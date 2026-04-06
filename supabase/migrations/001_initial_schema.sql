-- ============================================================
-- ועד חכם — Supabase Schema
-- ============================================================

-- Profiles (linked to auth.users)
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text unique not null,
  first_name text default '',
  last_name text default '',
  phone text default '',
  role text default 'resident' check (role in ('admin','committee','resident')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.profiles enable row level security;

-- Buildings
create table if not exists public.buildings (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  street text default '',
  house_number text default '',
  city text default '',
  floors integer default 0,
  total_units integer default 0,
  monthly_fee numeric default 0,
  balance numeric default 0,
  elevators integer default 0,
  generator boolean default false,
  water_pump boolean default false,
  fire_suppression boolean default false,
  intercom boolean default false,
  pool boolean default false,
  gym boolean default false,
  shared_roof boolean default false,
  year_built text default '',
  management_company text default '',
  bank_name text default '',
  branch text default '',
  account_number text default '',
  holder text default '',
  authorized_signer text default '',
  board_member_discount numeric default 0,
  notes text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.buildings enable row level security;

-- Building memberships (committee members per building)
create table if not exists public.building_memberships (
  id uuid primary key default gen_random_uuid(),
  building_id uuid references public.buildings on delete cascade not null,
  user_id uuid references public.profiles on delete cascade not null,
  role text default 'committee' check (role in ('committee_chair','committee','manager')),
  created_at timestamptz default now(),
  unique(building_id, user_id)
);
alter table public.building_memberships enable row level security;

-- Unit field definitions (admin-level custom fields)
create table if not exists public.unit_field_definitions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  field_key text not null unique,
  field_type text default 'text' check (field_type in ('text','number','boolean','date')),
  required boolean default false,
  display_order integer default 0,
  created_at timestamptz default now()
);
alter table public.unit_field_definitions enable row level security;

-- Units
create table if not exists public.units (
  id uuid primary key default gen_random_uuid(),
  building_id uuid references public.buildings on delete cascade not null,
  number text not null,
  floor integer default 0,
  rooms numeric default 0,
  area numeric default 0,
  monthly_fee numeric default 0,
  parking_spots jsonb default '[]',
  storage_number text default '',
  key_numbers jsonb default '[]',
  parking_gate_phone text default '',
  board_member boolean default false,
  notes text default '',
  custom_fields jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.units enable row level security;

-- Vendors (defined before issues due to FK)
create table if not exists public.vendors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text default '',
  phone text default '',
  email text default '',
  rating numeric default 0,
  is_blacklisted boolean default false,
  sanctions text default '',
  license_number text default '',
  insurance_expiry date,
  service_area text default '',
  available_24_7 boolean default false,
  preferred boolean default false,
  notes text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.vendors enable row level security;

-- Unit residents (people linked to a unit)
create table if not exists public.unit_residents (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid references public.units on delete cascade not null,
  user_id uuid references public.profiles,
  first_name text not null default '',
  last_name text not null default '',
  email text default '',
  phone text default '',
  resident_type text default 'owner' check (resident_type in ('owner','tenant')),
  is_primary boolean default false,
  owner_first_name text default '',
  owner_last_name text default '',
  owner_phone text default '',
  owner_email text default '',
  move_in_date date,
  move_out_date date,
  notes text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.unit_residents enable row level security;

-- Payments
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  building_id uuid references public.buildings on delete cascade,
  unit_id uuid references public.units on delete cascade,
  amount numeric default 0,
  month text not null,
  status text default 'pending' check (status in ('paid','pending','overdue')),
  paid_at timestamptz,
  method text default '',
  notes text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.payments enable row level security;

-- Expenses
create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  building_id uuid references public.buildings on delete cascade,
  date date not null,
  description text default '',
  category text default '',
  amount numeric default 0,
  vendor text default '',
  notes text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.expenses enable row level security;

-- Issues
create table if not exists public.issues (
  id uuid primary key default gen_random_uuid(),
  building_id uuid references public.buildings on delete cascade,
  title text not null,
  description text default '',
  status text default 'reported',
  priority text default 'medium' check (priority in ('low','medium','high','urgent')),
  category text default '',
  reported_by uuid references public.unit_residents,
  reported_at timestamptz default now(),
  vendor_name text default '',
  vendor_id uuid references public.vendors,
  cost numeric,
  resolved_at timestamptz,
  notes text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.issues enable row level security;

-- Compliance
create table if not exists public.compliance (
  id uuid primary key default gen_random_uuid(),
  building_id uuid references public.buildings on delete cascade,
  title text not null,
  type text default '',
  issue_date date,
  expiry_date date,
  document_number text default '',
  notes text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.compliance enable row level security;

-- Recurring tasks
create table if not exists public.recurring_tasks (
  id uuid primary key default gen_random_uuid(),
  building_id uuid references public.buildings on delete cascade,
  title text not null,
  frequency text default 'monthly',
  next_due_date date,
  is_required_by_law boolean default false,
  notes text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.recurring_tasks enable row level security;

-- Building assets
create table if not exists public.building_assets (
  id uuid primary key default gen_random_uuid(),
  building_id uuid references public.buildings on delete cascade,
  name text not null,
  category text default '',
  manufacturer text default '',
  model text default '',
  install_date date,
  warranty_end date,
  last_service date,
  next_service date,
  status text default 'active',
  notes text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.building_assets enable row level security;

-- Quotes
create table if not exists public.quotes (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid references public.issues on delete cascade,
  vendor_id uuid references public.vendors,
  building_id uuid references public.buildings on delete cascade,
  description text default '',
  amount numeric default 0,
  status text default 'pending' check (status in ('pending','accepted','rejected')),
  sent_at timestamptz default now(),
  responded_at timestamptz,
  valid_until date,
  notes text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.quotes enable row level security;

-- Work orders
create table if not exists public.work_orders (
  id uuid primary key default gen_random_uuid(),
  building_id uuid references public.buildings on delete cascade,
  issue_id uuid references public.issues,
  vendor_id uuid references public.vendors,
  quote_id uuid references public.quotes,
  title text not null,
  description text default '',
  status text default 'scheduled',
  priority text default 'medium',
  scheduled_date timestamptz,
  completed_date timestamptz,
  estimated_cost numeric,
  actual_cost numeric,
  approved_by text default '',
  approved_at timestamptz,
  notes text default '',
  rating integer,
  resident_feedback text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.work_orders enable row level security;

-- Announcements
create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  building_id uuid references public.buildings on delete cascade,
  title text not null,
  content text default '',
  type text default 'general',
  priority text default 'normal',
  published_at timestamptz default now(),
  expires_at date,
  author text default 'ועד הבית',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.announcements enable row level security;

-- Documents
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  building_id uuid references public.buildings on delete cascade,
  title text not null,
  type text default 'other',
  category text default '',
  uploaded_at date default current_date,
  expires_at date,
  notes text default '',
  file_size text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.documents enable row level security;

-- Meeting minutes
create table if not exists public.meeting_minutes (
  id uuid primary key default gen_random_uuid(),
  building_id uuid references public.buildings on delete cascade,
  title text not null,
  date timestamptz,
  attendees integer default 0,
  total_units integer default 0,
  type text default 'committee',
  summary text default '',
  decisions text default '',
  next_meeting date,
  author text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.meeting_minutes enable row level security;

-- ============================================================
-- Helper functions
-- ============================================================
create or replace function public.is_admin()
returns boolean language sql security definer stable as
  $$ select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'); $$;

create or replace function public.my_building_ids()
returns setof uuid language sql security definer stable as
  $$ select building_id from public.building_memberships where user_id = auth.uid()
     union select id from public.buildings where public.is_admin(); $$;

create or replace function public.my_unit_ids()
returns setof uuid language sql security definer stable as
  $$ select unit_id from public.unit_residents where user_id = auth.uid(); $$;

-- ============================================================
-- RLS Policies
-- ============================================================
create policy "profiles_select" on public.profiles for select using (id = auth.uid() or public.is_admin());
create policy "profiles_insert" on public.profiles for insert with check (id = auth.uid());
create policy "profiles_update" on public.profiles for update using (id = auth.uid() or public.is_admin());

create policy "buildings_select" on public.buildings for select using (public.is_admin() or id in (select public.my_building_ids()));
create policy "buildings_insert" on public.buildings for insert with check (public.is_admin());
create policy "buildings_update" on public.buildings for update using (public.is_admin() or id in (select public.my_building_ids()));
create policy "buildings_delete" on public.buildings for delete using (public.is_admin());

create policy "memberships_select" on public.building_memberships for select using (public.is_admin() or user_id = auth.uid());
create policy "memberships_insert" on public.building_memberships for insert with check (public.is_admin());
create policy "memberships_delete" on public.building_memberships for delete using (public.is_admin());

create policy "ufd_select" on public.unit_field_definitions for select using (auth.uid() is not null);
create policy "ufd_all" on public.unit_field_definitions for all using (public.is_admin());

create policy "units_select" on public.units for select using (public.is_admin() or building_id in (select public.my_building_ids()) or id in (select public.my_unit_ids()));
create policy "units_write" on public.units for all using (public.is_admin() or building_id in (select public.my_building_ids()));

create policy "ur_select" on public.unit_residents for select using (public.is_admin() or unit_id in (select u.id from public.units u where u.building_id in (select public.my_building_ids())) or user_id = auth.uid());
create policy "ur_write" on public.unit_residents for all using (public.is_admin() or unit_id in (select u.id from public.units u where u.building_id in (select public.my_building_ids())));

create policy "payments_select" on public.payments for select using (public.is_admin() or building_id in (select public.my_building_ids()) or unit_id in (select public.my_unit_ids()));
create policy "payments_write" on public.payments for all using (public.is_admin() or building_id in (select public.my_building_ids()));

create policy "expenses_all" on public.expenses for all using (public.is_admin() or building_id in (select public.my_building_ids()));
create policy "issues_select" on public.issues for select using (public.is_admin() or building_id in (select public.my_building_ids()));
create policy "issues_write" on public.issues for all using (public.is_admin() or building_id in (select public.my_building_ids()));
create policy "vendors_all" on public.vendors for all using (auth.uid() is not null);
create policy "compliance_all" on public.compliance for all using (public.is_admin() or building_id in (select public.my_building_ids()));
create policy "recurring_tasks_all" on public.recurring_tasks for all using (public.is_admin() or building_id in (select public.my_building_ids()));
create policy "building_assets_all" on public.building_assets for all using (public.is_admin() or building_id in (select public.my_building_ids()));
create policy "quotes_all" on public.quotes for all using (public.is_admin() or building_id in (select public.my_building_ids()));
create policy "work_orders_all" on public.work_orders for all using (public.is_admin() or building_id in (select public.my_building_ids()));
create policy "announcements_select" on public.announcements for select using (public.is_admin() or building_id in (select public.my_building_ids()) or building_id in (select u.building_id from public.units u where u.id in (select public.my_unit_ids())));
create policy "announcements_write" on public.announcements for all using (public.is_admin() or building_id in (select public.my_building_ids()));
create policy "documents_all" on public.documents for all using (public.is_admin() or building_id in (select public.my_building_ids()));
create policy "meeting_minutes_all" on public.meeting_minutes for all using (public.is_admin() or building_id in (select public.my_building_ids()));

-- ============================================================
-- Auto-create profile on signup trigger
-- ============================================================
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as
$$
begin
  insert into public.profiles (id, email, first_name, last_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'given_name', split_part(new.email,'@',1)),
    coalesce(new.raw_user_meta_data->>'family_name', ''),
    case when (select count(*) from public.profiles) = 0 then 'admin' else 'resident' end
  );
  update public.unit_residents set user_id = new.id where email = new.email and user_id is null;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
