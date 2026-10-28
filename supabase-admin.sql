-- Админ-режим для сайта «Знаки Кингисеппа».
-- Supabase → SQL Editor → New query → вставить → Run.
--
-- ЧТО ДЕЛАЕТ:
--   1) добавляет колонку owner_token (по ней сайт понимает, кто нарисовал участок);
--   2) закрывает прямой DELETE в таблице signs;
--   3) создаёт функцию delete_sign(id, owner_token, admin_password):
--        • свою запись может удалить её автор;
--        • чужую — только тот, кто знает админский пароль;
--   4) пароль хранится в таблице app_secrets в виде sha256-хэша,
--      прочитать её через API нельзя (RLS без политик).
--
-- ВАЖНО: этот файл лежит в публичном репозитории, поэтому настоящий пароль
-- сюда не пишем. Замени CHANGE_ME на свой пароль ПЕРЕД запуском.

create extension if not exists pgcrypto with schema extensions;

alter table public.signs add column if not exists owner_token text;
create index if not exists signs_owner_idx on public.signs (owner_token);

-- Секреты: читать через API нельзя (RLS включён, политик нет).
create table if not exists public.app_secrets (
  key   text primary key,
  value text not null
);
alter table public.app_secrets enable row level security;

-- Пароль админа. do nothing — чтобы повторный запуск скрипта не сбрасывал пароль.
insert into public.app_secrets (key, value)
values ('admin_hash', encode(digest('CHANGE_ME', 'sha256'), 'hex'))
on conflict (key) do nothing;

-- Проверка пароля. При неверном пароле слегка тормозим — чтобы не перебирали.
create or replace function public.is_admin(p_password text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare ok boolean;
begin
  select exists (
    select 1 from public.app_secrets s
    where s.key = 'admin_hash'
      and s.value = encode(digest(coalesce(p_password, ''), 'sha256'), 'hex')
  ) into ok;
  if not ok then perform pg_sleep(0.3); end if;
  return ok;
end;
$$;

-- Удаление участка: свой — по owner_token, любой — по админскому паролю.
create or replace function public.delete_sign(
  p_id uuid,
  p_token text default null,
  p_password text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v_count int;
begin
  if public.is_admin(p_password) then
    delete from public.signs where id = p_id;
  else
    delete from public.signs
     where id = p_id
       and owner_token is not null
       and owner_token = p_token;
  end if;
  get diagnostics v_count = row_count;
  return v_count > 0;
end;
$$;

revoke all on function public.is_admin(text) from public;
grant execute on function public.is_admin(text) to anon, authenticated;
revoke all on function public.delete_sign(uuid, text, text) from public;
grant execute on function public.delete_sign(uuid, text, text) to anon, authenticated;

-- Прямое удаление закрываем: только через функцию.
drop policy if exists "signs delete" on public.signs;
revoke delete on public.signs from anon, authenticated;

-- ПРОВЕРКА после запуска:
--   select type, count(*) from public.signs group by type;
--   select public.is_admin('твой-пароль');   -- должно быть true

-- СМЕНИТЬ ПАРОЛЬ ПОЗЖЕ (вставь новый и выполни):
--   update public.app_secrets
--      set value = encode(digest('новый-пароль', 'sha256'), 'hex')
--    where key = 'admin_hash';
