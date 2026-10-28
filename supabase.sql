-- Схема базы для сайта «Знаки Кингисеппа» (Supabase → SQL Editor → New query → Run).

create table if not exists public.signs (
  id          uuid primary key,
  type        text not null check (type in ('no_parking','no_stopping','lanes','speed')),
  path        jsonb not null,          -- [[lat,lng], ...] вдоль улицы
  side        text,                    -- left | right  (для 3.27/3.28)
  direction   text default 'forward',  -- forward | backward | both
  speed       int,                     -- для 3.24
  lanes       jsonb,                   -- [{"turn":"left"}, ...] для 5.15.1
  zone        jsonb,                   -- {"from":"08:00","to":"20:00","days":"even"}
  note        text default '',
  author      text default '',
  owner_token text,                    -- кто нарисовал; см. supabase-admin.sql
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create index if not exists signs_type_idx on public.signs (type);
create index if not exists signs_updated_idx on public.signs (updated_at desc);

alter table public.signs enable row level security;

-- Читать могут все (сайт публичный)
drop policy if exists "signs read" on public.signs;
create policy "signs read" on public.signs
  for select using (true);

-- Писать могут все, у кого есть ссылка на сайт (проект для друзей).
-- Если нужна защита — включите Supabase Auth и замените true на auth.role() = 'authenticated'.
drop policy if exists "signs insert" on public.signs;
create policy "signs insert" on public.signs
  for insert with check (true);

drop policy if exists "signs update" on public.signs;
create policy "signs update" on public.signs
  for update using (true);

drop policy if exists "signs delete" on public.signs;
create policy "signs delete" on public.signs
  for delete using (true);
