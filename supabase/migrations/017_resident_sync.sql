-- 017_resident_sync.sql — keep "who lives where" in sync as residents come and go.
--
-- Unit numbers are fixed; the people in them change. Everything that shows a
-- family name reads unit_residents live (useUnitDirectory), so names update
-- by themselves — PROVIDED unit_residents itself reflects reality. This
-- migration makes that automatic, at the database level, regardless of which
-- screen (or script) changes the data:
--
--   1. move_out_date reached  → resident is archived (on write, and nightly).
--   2. resident archived/removed/moved → their login is unlinked from the
--      unit (a former resident must not keep seeing the unit's portal), and
--      if they were the primary resident, the next active one is promoted.
--   3. resident added/updated with an email of an existing account → that
--      account is linked to the unit immediately (no re-signup needed).
--
-- Bookings and collection_cases keep their own name snapshots on purpose:
-- they record who booked / who owed at the time.

-- ── 1a. Archive on write when the move-out date is today or past ──────────
create or replace function public.resident_apply_move_out() returns trigger
language plpgsql as $fn$
begin
  if new.move_out_date is not null and new.move_out_date <= current_date
     and coalesce(new.archived, false) = false then
    new.archived := true;
  end if;
  -- An archived resident can't be the unit's primary contact.
  if coalesce(new.archived, false) then
    new.is_primary := false;
  end if;
  return new;
end $fn$;

drop trigger if exists trg_resident_move_out on public.unit_residents;
create trigger trg_resident_move_out
  before insert or update on public.unit_residents
  for each row execute function public.resident_apply_move_out();

-- ── 2. Departure side-effects: unlink login, promote next primary ─────────
create or replace function public.resident_after_departure(p_unit uuid, p_user uuid)
returns void language plpgsql security definer set search_path to 'public' as $fn$
begin
  -- Unlink the former resident's login from this unit, unless they still
  -- have another active resident row in it (e.g. a duplicate record).
  if p_user is not null and not exists (
    select 1 from unit_residents
     where unit_id = p_unit and user_id = p_user and coalesce(archived, false) = false
  ) then
    update profiles
       set unit_id = null, building_id = null
     where id = p_user and unit_id = p_unit and role = 'resident';
  end if;

  -- Keep exactly one primary while anyone still lives there.
  if not exists (
    select 1 from unit_residents
     where unit_id = p_unit and is_primary and coalesce(archived, false) = false
  ) then
    update unit_residents set is_primary = true
     where id = (
       select id from unit_residents
        where unit_id = p_unit and coalesce(archived, false) = false
        order by move_in_date nulls last, created_at
        limit 1
     );
  end if;
end $fn$;

create or replace function public.resident_sync_after_write() returns trigger
language plpgsql security definer set search_path to 'public' as $fn$
begin
  if tg_op = 'DELETE' then
    perform resident_after_departure(old.unit_id, old.user_id);
    return old;
  end if;

  -- Left the unit: archived now, or moved to another unit.
  if tg_op = 'UPDATE' and (
       (coalesce(new.archived, false) and not coalesce(old.archived, false))
       or new.unit_id is distinct from old.unit_id) then
    perform resident_after_departure(old.unit_id, old.user_id);
  end if;

  -- 3. Arriving / active resident: link an existing account by email.
  if not coalesce(new.archived, false) and new.email is not null and new.email <> '' then
    if new.user_id is null then
      update unit_residents set user_id = p.id
        from profiles p
       where unit_residents.id = new.id and lower(p.email) = lower(new.email);
    end if;
    update profiles p
       set unit_id = new.unit_id,
           building_id = (select building_id from units where id = new.unit_id)
     where lower(p.email) = lower(new.email)
       and p.role = 'resident'
       and p.unit_id is null;
  end if;
  return new;
end $fn$;

drop trigger if exists trg_resident_sync on public.unit_residents;
create trigger trg_resident_sync
  after insert or update or delete on public.unit_residents
  for each row execute function public.resident_sync_after_write();

-- ── 1b. Nightly sweep for move-out dates that arrive with no write ────────
-- (touching the row fires both triggers above, so unlink/promote happen too)
create or replace function public.archive_departed_residents() returns integer
language plpgsql security definer set search_path to 'public' as $fn$
declare n integer;
begin
  update unit_residents set archived = true
   where move_out_date is not null and move_out_date <= current_date
     and coalesce(archived, false) = false;
  get diagnostics n = row_count;
  return n;
end $fn$;

do $cron$
begin
  perform cron.unschedule('archive-departed-residents')
    where exists (select 1 from cron.job where jobname = 'archive-departed-residents');
  perform cron.schedule('archive-departed-residents', '15 0 * * *',
                        'select public.archive_departed_residents()');
end $cron$;

-- ── One-time backfill for residents already past their move-out date ─────
select public.archive_departed_residents();
