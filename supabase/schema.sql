-- ============================================================================
-- BookHaven — Supabase database schema (PostgreSQL)
--
-- HOW TO USE
--   1. Open your Supabase project  ->  SQL Editor  ->  New query
--   2. Paste this whole file into the editor and press Run (or Cmd/Ctrl+Enter).
--   3. The tables below are created. The app creates them itself when the
--      local SQLite file is used; on Supabase they must exist in advance.
--   4. Connect the app by setting an environment variable:
--        DATABASE_URL=postgresql://postgres.example:password@aws-0-region.pooler.supabase.com:6543/postgres
--      (Supabase dashboard -> Project Settings -> Database -> Connection string)
--   5. The first time the app starts it seeds the 5,720 book catalogue and
--      the admin account, exactly like the SQLite setup.
--
-- You can safely re-run this file — every statement is idempotent.
-- ============================================================================

-- Books (the full 5,720-book catalogue)
create table if not exists public.books (
  id          bigserial primary key,
  title       text not null,
  author      text not null,
  category    text not null,
  subcategory text not null default '',
  description text not null default '',
  cover       text,
  price       double precision not null,
  "oldPrice"  double precision,
  stock       integer not null default 20,
  rating      double precision not null default 0,
  reviews     integer not null default 0,
  -- Banner flags (0/1 like the SQLite schema — the app stores 1/0)
  featured    smallint not null default 0,
  bestseller  smallint not null default 0,
  "isNew"     smallint not null default 0
);

create index if not exists books_category_idx     on public.books (category);
create index if not exists books_featured_idx     on public.books (featured);
create index if not exists books_bestseller_idx   on public.books (bestseller);
create index if not exists books_isnew_idx        on public.books ("isNew");

-- Users (admin + customers, incl. Google/Facebook/Twitter sign-in)
create table if not exists public.users (
  id            bigserial primary key,
  name          text not null,
  email         text not null unique,
  password_hash text not null,
  salt          text not null,
  role          text not null default 'customer',
  provider      text not null default '',
  provider_id   text not null default '',
  created_at    text not null default to_char(now() at time zone 'utc', 'YYYY-MM-DD HH24:MI:SS')
);

-- Login sessions (opaque bearer tokens)
create table if not exists public.sessions (
  token      text primary key,
  user_id    bigint not null references public.users (id) on delete cascade,
  expires_at text not null
);

create index if not exists sessions_user_idx on public.sessions (user_id);

-- Orders (all checkouts, for the admin Order Management panel)
create table if not exists public.orders (
  id         bigserial primary key,
  order_ref  text not null unique,
  customer   text not null,
  email      text not null,
  date       text not null,
  items      integer not null,
  total      double precision not null,
  status     text not null default 'Processing',
  created_at text not null default to_char(now() at time zone 'utc', 'YYYY-MM-DD HH24:MI:SS')
);

create index if not exists orders_email_idx on public.orders (email);

-- Contact messages (Admin -> Messages)
create table if not exists public.contact_messages (
  id         bigserial primary key,
  name       text not null,
  email      text not null,
  subject    text not null default '',
  message    text not null,
  created_at text not null default to_char(now() at time zone 'utc', 'YYYY-MM-DD HH24:MI:SS')
);

-- Done. BookHaven is ready to connect. The app creates everything else.