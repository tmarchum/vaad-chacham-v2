-- 031 — a booking is identified by FLAT + FAMILY NAME, never a first name.
--
-- Migration 030 copied the matching resident's full name onto the booking.
-- The committee's calendar, lists, exports and emails are shared documents,
-- and a booking belongs to the flat (one payer, one slot), not to a person —
-- so booker_name now holds the family name alone and the UI prints it next to
-- the flat number ("דירה 26 — מתתיה").
--
-- As in 030: a guest (is_guest) keeps free text, because a guest is not in the
-- directory. A flat with no resident record keeps whatever it has rather than
-- being blanked.

create or replace function public.tg_booking_name_from_residents()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  fam text;
  matched public.unit_residents%rowtype;
begin
  if new.is_guest is true or new.unit_id is null then
    return new;
  end if;

  -- The flat's family name: the primary resident's, else the oldest record
  -- that actually has one.
  select r.* into matched
  from public.unit_residents r
  where r.unit_id = new.unit_id
    and r.archived = false
    and btrim(coalesce(r.last_name, '')) <> ''
  order by r.is_primary desc nulls last, r.created_at asc nulls last
  limit 1;

  if found then
    fam := btrim(matched.last_name);
    new.booker_name := fam;
    -- Contact details stay useful: fill only what the booking is missing.
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

-- Backfill: re-run the trigger over every flat booking.
update public.bookings
set booker_name = booker_name
where unit_id is not null and is_guest is not true;
