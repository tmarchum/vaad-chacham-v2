-- Issue details for vendors: the committee adds notes and photos to an issue,
-- and a vendor asked for a quote opens one public page (by unguessable token)
-- with everything needed to price the job. No resident names, no apartment
-- occupants — only the job, the address and the pictures.
alter table public.issues add column if not exists brief_token uuid not null default gen_random_uuid();
create unique index if not exists issues_brief_token_key on public.issues (brief_token);

create table if not exists public.issue_attachments (
  id          uuid primary key default gen_random_uuid(),
  issue_id    uuid not null references public.issues(id) on delete cascade,
  building_id uuid not null references public.buildings(id) on delete cascade,
  kind        text not null check (kind in ('photo', 'note')),
  url         text,
  body        text,
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now()
);
create index if not exists issue_attachments_issue_idx on public.issue_attachments (issue_id, created_at);
alter table public.issue_attachments enable row level security;
drop policy if exists issue_attachments_committee on public.issue_attachments;
create policy issue_attachments_committee on public.issue_attachments for all
  using (is_admin() or (is_committee() and building_id in (select my_building_ids())))
  with check (is_admin() or (is_committee() and building_id in (select my_building_ids())));

create or replace function public.get_issue_brief(p_token uuid)
returns json language sql security definer set search_path to 'public' stable as $fn$
  select json_build_object(
    'title', i.title, 'description', i.description, 'category', i.category, 'priority', i.priority,
    'created_at', i.created_at, 'ticket_no', i.ticket_no, 'status', i.status,
    'address', concat_ws(' ', b.street, b.house_number) || coalesce(', ' || b.city, ''),
    'building', b.name,
    'photos', coalesce((select json_agg(x.url) from (
        select i.photo_url as url, i.created_at as t where i.photo_url is not null
        union all select a.url, a.created_at from public.issue_attachments a where a.issue_id = i.id and a.kind = 'photo' and a.url is not null
      ) x), '[]'::json),
    'notes', coalesce((select json_agg(json_build_object('body', a.body, 'at', a.created_at) order by a.created_at)
        from public.issue_attachments a where a.issue_id = i.id and a.kind = 'note'), '[]'::json)
  )
  from public.issues i join public.buildings b on b.id = i.building_id
  where i.brief_token = p_token
$fn$;
grant execute on function public.get_issue_brief(uuid) to anon, authenticated;
