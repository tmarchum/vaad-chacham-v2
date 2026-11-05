-- Bookings were storing login handles instead of people: "lior.tsion",
-- "dkuper100", "naamashmu", "benmat1971בנימין מתתיה". The resident portal took
-- the name from the signup profile (first_name/last_name seeded from the email
-- local-part), not from unit_residents, which is where the building actually
-- knows who lives where. The committee then read a calendar full of usernames.
--
-- Fixing only the portal would leave every other path free to repeat it, so
-- the rule lives in the database: a booking tied to a flat carries the name of
-- someone who lives in that flat. Guests are untouched — an outside guest is
-- precisely the case where the name is not in the directory.
--
-- The name is not forced to the primary resident: any non-archived resident of
-- that flat is accepted, so the committee can record that the spouse booked it.
-- Anything else snaps to the primary resident.

create or replace function public.tg_booking_name_from_residents()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  matched public.unit_residents%rowtype;
  fallback_name text;
begin
  if new.is_guest is true or new.unit_id is null then
    return new;
  end if;

  -- Already one of the household? Keep it.
  select r.* into matched
  from public.unit_residents r
  where r.unit_id = new.unit_id
    and r.archived = false
    and btrim(coalesce(new.booker_name, '')) <> ''
    and lower(btrim(coalesce(r.first_name, '') || ' ' || coalesce(r.last_name, '')))
        = lower(btrim(new.booker_name))
  limit 1;

  if not found then
    select r.* into matched
    from public.unit_residents r
    where r.unit_id = new.unit_id
      and r.archived = false
    order by r.is_primary desc nulls last, r.created_at asc nulls last
    limit 1;

    if found then
      fallback_name := btrim(coalesce(matched.first_name, '') || ' ' || coalesce(matched.last_name, ''));
      -- A flat whose resident record has no name at all leaves the booking as
      -- it was: an empty name is worse than a username.
      if fallback_name <> '' then
        new.booker_name := fallback_name;
      end if;
    end if;
  end if;

  -- Contact details follow the person, but never overwrite what was entered.
  if matched.unit_id is not null then
    if btrim(coalesce(new.booker_phone, '')) = '' then
      new.booker_phone := coalesce(matched.phone, '');
    end if;
    if btrim(coalesce(new.booker_email, '')) = '' then
      new.booker_email := coalesce(matched.email, '');
    end if;
  end if;

  return new;
end
$$;

drop trigger if exists booking_name_from_residents on public.bookings;
create trigger booking_name_from_residents
  before insert or update of booker_name, unit_id, is_guest on public.bookings
  for each row execute function public.tg_booking_name_from_residents();

-- Repair the bookings already on record. A no-op UPDATE runs the trigger.
update public.bookings set booker_name = booker_name
where unit_id is not null and is_guest is not true;
