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
