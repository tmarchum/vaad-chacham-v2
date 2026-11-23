-- Recurring tasks become something that happens, not a list of dates:
-- the committee is reminded ahead of the due date, one tap sends the job to the
-- task's regular vendor or out for quotes, and closing that issue moves the task
-- to its next date.

-- category / law_reference / completion_history: the screen has written these
-- from the start but the columns never existed, so editing a task and marking
-- one done both failed.
alter table public.recurring_tasks
  add column if not exists category text,
  add column if not exists law_reference text,
  add column if not exists completion_history jsonb not null default '[]'::jsonb,
  add column if not exists trade text,                       -- the vendor trade that does it
  add column if not exists vendor_id uuid references public.vendors(id) on delete set null,
  add column if not exists remind_days integer,              -- null = 30 if required by law, else 14
  add column if not exists reminded_at timestamptz,
  add column if not exists overdue_reminded_at timestamptz,
  add column if not exists issue_id uuid references public.issues(id) on delete set null;

create or replace function public.recurring_next_due(p_from date, p_frequency text)
returns date language sql immutable as $$
  select case p_frequency
    when 'weekly' then p_from + 7
    when 'monthly' then (p_from + interval '1 month')::date
    when 'quarterly' then (p_from + interval '3 months')::date
    when 'biannually' then (p_from + interval '6 months')::date
    when 'annually' then (p_from + interval '1 year')::date
    when 'yearly' then (p_from + interval '1 year')::date
    else (p_from + interval '1 month')::date end
$$;

-- A new due date starts a new round of reminders.
create or replace function public.recurring_task_reset_reminders()
returns trigger language plpgsql as $$
begin
  if new.next_due_date is distinct from old.next_due_date then
    new.reminded_at := null;
    new.overdue_reminded_at := null;
  end if;
  return new;
end $$;

drop trigger if exists trg_recurring_task_reset on public.recurring_tasks;
create trigger trg_recurring_task_reset before update on public.recurring_tasks
  for each row execute function public.recurring_task_reset_reminders();

-- Done: the next date counts from the due date when done on time or early, and
-- from today when done late (a yearly check done two months late is due a year
-- from when it was actually done).
create or replace function public.complete_recurring_task(p_task uuid, p_via text default 'app')
returns date language plpgsql security definer set search_path to 'public' as $$
declare t public.recurring_tasks%rowtype; v_today date := (now() at time zone 'Asia/Jerusalem')::date; v_next date;
begin
  select * into t from public.recurring_tasks where id = p_task for update;
  if not found then return null; end if;
  v_next := public.recurring_next_due(greatest(coalesce(t.next_due_date, v_today), v_today), t.frequency);
  update public.recurring_tasks
     set next_due_date = v_next,
         completion_history = coalesce(completion_history, '[]'::jsonb)
           || jsonb_build_object('completed_at', now(), 'previous_due', t.next_due_date, 'via', p_via, 'issue_id', t.issue_id),
         issue_id = null, updated_at = now()
   where id = p_task;
  return v_next;
end $$;
revoke all on function public.complete_recurring_task(uuid, text) from public, anon, authenticated;

-- The issue a task opened is closed: the task is done. Closed without work
-- ("נדחתה"): the task is released and stays due.
create or replace function public.recurring_task_issue_closed()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare r record;
begin
  if new.status is distinct from old.status and new.status in ('completed', 'resolved', 'closed', 'rejected') then
    for r in select id from public.recurring_tasks where issue_id = new.id loop
      if new.status = 'rejected' then
        update public.recurring_tasks set issue_id = null, updated_at = now() where id = r.id;
      else
        perform public.complete_recurring_task(r.id, 'issue');
      end if;
    end loop;
  end if;
  return new;
end $$;

drop trigger if exists trg_recurring_task_issue_closed on public.issues;
create trigger trg_recurring_task_issue_closed after update of status on public.issues
  for each row execute function public.recurring_task_issue_closed();

-- A starting trade for the seeded statutory tasks, by what the title says.
-- Editable on the task; left empty where no trade in the pool fits.
update public.recurring_tasks set trade = case
  when title ~ 'מעלית כבאים' then 'מעליות'
  when title ~ 'מעלית' then 'בדיקת מעליות'
  when title ~ 'תרמוגרפיה|ברקים|בדיקת חשמל' then 'בדיקת חשמל'
  when title ~ 'תאורת חירום' then 'חשמל'
  when title ~ 'גנרטור' then 'גנרטור'
  when title ~ 'גז מרכזי' then 'גז מרכזי'
  when title ~ 'ניקוי מיכלי מים' then 'חיטוי מאגרי מים'
  when title ~ 'משאבות ניקוז' then 'ביוב ושאיבה'
  when title ~ 'משאבות מים|בוסטר' then 'משאבות מים'
  when title ~ 'דלתות אש|אוורור|בריכת מים לכיבוי' then 'בטיחות אש - בדיקות ואישורים'
  when title ~ 'מפלס מאגר|הרצת משאבות|ממ"ק|מרזבים' then 'אחזקה כללית'
  when title ~ 'כיבוי|גילוי אש|ספרינקלר|שחרור עשן|כריזת חירום|הידרנט' then 'כיבוי וגילוי אש'
  when title ~ 'איטום' then 'איטום וגגות'
  when title ~ 'גינון' then 'גינון'
  when title ~ 'הדברת' then 'הדברה'
  when title ~ 'ניקיון' then 'ניקיון'
  else null end
where trade is null;
