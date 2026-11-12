-- Meetings: give the existing protocol an agenda, and the agenda a vote.
--
-- `meeting_minutes` has existed since 001 and holds a flat record — title,
-- date, attendee count, a summary blob and a decisions blob. It has never been
-- used: zero rows. The reason is visible the moment you compare it with what a
-- committee actually runs. A meeting is a LIST: item, discussion, decision,
-- and how the vote fell. A single "decisions" textarea cannot hold that, so
-- nobody filled it in.
--
-- This adds the list. Deliberately NOT online resident voting: who may vote on
-- what in a בית משותף, and what majority carries, is set by law and by the
-- building's תקנון. Recording how a vote went at a meeting the committee held
-- is a faithful minute; collecting binding votes through an app is a legal
-- claim this system is in no position to make.

create table if not exists public.meeting_agenda_items (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meeting_minutes on delete cascade,
  building_id uuid references public.buildings on delete cascade,
  position integer not null default 0,          -- order on the agenda
  title text not null,
  description text default '',
  -- pending: on the agenda, not yet discussed. decided: a decision was taken.
  -- deferred: discussed and pushed to a later meeting.
  status text not null default 'pending'
    check (status in ('pending', 'decided', 'deferred')),
  decision text default '',
  votes_for integer not null default 0 check (votes_for >= 0),
  votes_against integer not null default 0 check (votes_against >= 0),
  votes_abstain integer not null default 0 check (votes_abstain >= 0),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists meeting_agenda_items_meeting_idx
  on public.meeting_agenda_items (meeting_id, position);

alter table public.meeting_agenda_items enable row level security;

-- Same shape as meeting_minutes' own policy (001): admins everywhere, members
-- within their own buildings.
drop policy if exists meeting_agenda_items_all on public.meeting_agenda_items;
create policy meeting_agenda_items_all on public.meeting_agenda_items
  for all using (
    public.is_admin() or building_id in (select public.my_building_ids())
  ) with check (
    public.is_admin() or building_id in (select public.my_building_ids())
  );

-- Keep building_id in step with the parent meeting, so the policy above can
-- never be bypassed by passing a building the caller does belong to while
-- attaching the item to a meeting in one they do not.
create or replace function public.meeting_agenda_sync_building()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  select building_id into new.building_id
  from public.meeting_minutes where id = new.meeting_id;
  return new;
end $$;

drop trigger if exists meeting_agenda_items_building on public.meeting_agenda_items;
create trigger meeting_agenda_items_building
  before insert or update of meeting_id on public.meeting_agenda_items
  for each row execute function public.meeting_agenda_sync_building();
