# Inventory Checklist

Full-stack multi-user inventory app built with Next.js 15, Supabase (Auth + PostgreSQL), and TypeScript.

## Setup

### 1. Create a Supabase project

Go to [supabase.com](https://supabase.com), create a free project.

### 2. Run the database schema

In your Supabase project → **SQL Editor**, paste and run the contents of [`supabase/schema.sql`](./supabase/schema.sql).

### 3. Get your credentials

In your Supabase project → **Settings → API**:
- Copy **Project URL**
- Copy **anon / public** key

### 4. Configure environment variables

```bash
cp .env.local.example .env.local
```

Fill in `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

### 5. Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Deploy to Vercel

1. Push this repo to GitHub
2. Import at [vercel.com/new](https://vercel.com/new)
3. Add the two env vars (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`) in the Vercel project settings
4. Deploy

## Features

- **Auth** — sign up / sign in via Supabase email+password
- **Multi-user** — each account has its own isolated inventory (Row Level Security)
- **CRUD** — add, edit, delete inventory items
- **Check-in** — mark items as verified with progress tracking
- **Search & filter** — by keyword, category, and status
- **Sort** — click any column header
- **Export** — download full inventory as CSV
- **Dark mode** — persisted in localStorage
