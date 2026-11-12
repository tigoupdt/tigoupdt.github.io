-- 0031_ios_waitlist.sql
-- Lista de espera de la versión para iPhone (página https://tigoupdt.github.io).
-- La ejecuta Zihao a mano en el SQL Editor de Supabase. NO forma parte de las
-- migraciones de la app (supabase/migrations), aunque comparta base de datos.
--
-- La página escribe con la clave publicable (anon): solo puede INSERTAR.
-- Nadie puede leer, cambiar ni borrar filas desde la API (sin SELECT/UPDATE/DELETE,
-- ni políticas ni permisos). Los correos se consultan solo desde el SQL Editor.
--
-- Exportar los correos pendientes de avisar:
--   select email, lang from public.ios_waitlist where notified_at is null;
--
-- Después de enviar el aviso, marcar como avisados (o borrar la lista, como dice
-- la política de privacidad: al enviar el aviso o, como máximo, a los 24 meses):
--   update public.ios_waitlist set notified_at = now() where notified_at is null;
--   delete from public.ios_waitlist;

create table public.ios_waitlist (
  id          uuid primary key default gen_random_uuid(),
  email       text not null unique,
  lang        text,
  consent     boolean not null,
  created_at  timestamptz not null default now(),
  notified_at timestamptz,
  constraint ios_waitlist_consent_true check (consent = true),
  constraint ios_waitlist_email_len   check (char_length(email) <= 254),
  -- Añadido: el idioma es un código corto ("es", "zh"); evita guardar texto largo
  constraint ios_waitlist_lang_len    check (lang is null or char_length(lang) <= 10)
);

alter table public.ios_waitlist enable row level security;

-- Solo INSERT, y solo con el consentimiento marcado. Sin políticas de select,
-- update ni delete: con RLS activada, eso las deja prohibidas.
create policy ios_waitlist_insert
  on public.ios_waitlist
  for insert
  to anon, authenticated
  with check (consent = true);

-- Permisos mínimos: se quita cualquier permiso por defecto y se da solo INSERT,
-- y solo en las columnas que rellena la página (id, created_at y notified_at
-- los pone siempre la base de datos).
revoke all on public.ios_waitlist from public, anon, authenticated;
grant insert (email, lang, consent) on public.ios_waitlist to anon, authenticated;
