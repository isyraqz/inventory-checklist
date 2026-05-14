-- Run this in the Supabase SQL editor (supabase.com → your project → SQL Editor)

create table public.items (
  id            uuid default gen_random_uuid() primary key,
  user_id       uuid references auth.users(id) on delete cascade not null,
  name          text not null,
  serial        text not null default '',
  assigned_to   text not null default '',
  category      text not null default 'IT',
  condition     text not null default 'Good',
  status        text not null default 'Available',
  location      text not null default '',
  date_acquired date,
  notes         text not null default '',
  checked       boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Row-level security: each user can only see and modify their own items
alter table public.items enable row level security;

create policy "Users manage their own items"
  on public.items
  for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── Item photos ──
-- Also create a Storage bucket named "item-photos" set to PUBLIC in Supabase dashboard.
create table public.item_photos (
  id           uuid default gen_random_uuid() primary key,
  item_id      uuid references public.items(id) on delete cascade not null,
  user_id      uuid references auth.users(id) not null,
  storage_path text not null,
  url          text not null,
  uploaded_at  timestamptz not null default now(),
  photo_date   date null
);

alter table public.item_photos enable row level security;

create policy "Users manage their own item photos"
  on public.item_photos
  for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── Maintenance logs ──
create table public.maintenance_logs (
  id          uuid default gen_random_uuid() primary key,
  item_id     uuid references public.items(id) on delete cascade not null,
  user_id     uuid references auth.users(id) not null,
  logged_by   text not null default '',
  description text not null,
  log_date    date,
  created_at  timestamptz not null default now()
);

alter table public.maintenance_logs enable row level security;

create policy "Users manage their own maintenance logs"
  on public.maintenance_logs
  for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── Item user history ──
create table public.item_user_history (
  id          uuid default gen_random_uuid() primary key,
  item_id     uuid references public.items(id) on delete cascade not null,
  user_name   text not null,
  date_from   date,
  date_to     date,
  created_at  timestamptz not null default now()
);

alter table public.item_user_history enable row level security;

create policy "Authenticated users manage item user history"
  on public.item_user_history
  for all
  using  (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');
