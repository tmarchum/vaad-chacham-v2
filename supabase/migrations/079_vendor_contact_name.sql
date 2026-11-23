-- How a vendor is addressed in messages. Names collected from Google are
-- listings ("חשמלאי מוסמך - עדן האזרד"); "שלום חשמלאי מוסמך - עדן האזרד" reads
-- like a mail merge. Empty = derived from the listing name (vendorGreeting).
alter table public.vendors add column if not exists contact_name text;

update public.vendors set contact_name = 'עדן האזרד' where id = 'bc97605a-eec7-44c7-980b-c5d07f44afb3' and contact_name is null;
update public.vendors set contact_name = 'קובי' where id = '65377b3b-e44d-424c-8b19-c5657887bfd6' and contact_name is null;
