-- Общая библиотека форматов для сайта «Раскладка на лист».
-- Выполнить один раз: Supabase → SQL Editor → New query → вставить весь файл → Run.
-- Создаёт отдельную таблицу raskladka_formats, другие таблицы проекта не затрагивает.
--
-- Права посетителей сайта (ключ anon):
--   • читать все форматы;
--   • добавлять новые;
--   • убирать в корзину и возвращать из корзины — меняется только поле deleted_at.
-- Насовсем удалить или изменить формат посетитель не может.

create table if not exists public.raskladka_formats (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('sheets', 'items')),
  name        text not null check (char_length(btrim(name)) between 1 and 60),
  description text check (description is null or char_length(description) <= 200),
  w           numeric not null check (w > 0 and w <= 100000),
  h           numeric not null check (h > 0 and h <= 100000),
  b           numeric[] check (b is null or (array_length(b, 1) = 4 and 0 <= all (b) and 1000 >= all (b))),
  created_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

-- если таблица уже была создана прошлой версией скрипта — добавить описание
alter table public.raskladka_formats
  add column if not exists description text check (description is null or char_length(description) <= 200);

create index if not exists raskladka_formats_deleted_at_idx on public.raskladka_formats (deleted_at);

alter table public.raskladka_formats enable row level security;

drop policy if exists "raskladka: read" on public.raskladka_formats;
create policy "raskladka: read" on public.raskladka_formats
  for select to anon, authenticated using (true);

drop policy if exists "raskladka: add" on public.raskladka_formats;
create policy "raskladka: add" on public.raskladka_formats
  for insert to anon, authenticated with check (deleted_at is null);

drop policy if exists "raskladka: trash and restore" on public.raskladka_formats;
create policy "raskladka: trash and restore" on public.raskladka_formats
  for update to anon, authenticated using (true) with check (true);

-- Права на уровне столбцов: добавлять можно только данные формата, менять — только deleted_at.
revoke all on public.raskladka_formats from anon, authenticated;
grant select on public.raskladka_formats to anon, authenticated;
grant insert (kind, name, description, w, h, b) on public.raskladka_formats to anon, authenticated;
grant update (deleted_at) on public.raskladka_formats to anon, authenticated;

-- Сайт показывает корзину за последние 30 дней. Старые записи из корзины можно
-- удалить насовсем вручную (необязательно):
--   delete from public.raskladka_formats where deleted_at < now() - interval '30 days';
