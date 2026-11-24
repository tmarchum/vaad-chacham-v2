-- A second reminder a week before the due date, for a task the committee was
-- reminded of and has not acted on (no issue opened, not marked done).
alter table public.recurring_tasks add column if not exists last_reminded_at timestamptz;

create or replace function public.recurring_task_reset_reminders()
returns trigger language plpgsql as $$
begin
  if new.next_due_date is distinct from old.next_due_date then
    new.reminded_at := null;
    new.last_reminded_at := null;
    new.overdue_reminded_at := null;
  end if;
  return new;
end $$;
