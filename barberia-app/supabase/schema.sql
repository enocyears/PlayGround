-- ============================================================
-- ALANÍS STUDIO — Esquema Supabase (PostgreSQL + RLS)
-- Tablas: servicios, horarios_config, bloqueos, citas
-- Roles: anon/cliente (público) vs admin (barbero, Supabase Auth)
-- ============================================================

-- ---------- 1. TABLAS ----------
create table if not exists public.servicios (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  descripcion text default '',
  precio numeric(10,2) not null check (precio >= 0),
  duracion_minutos int not null check (duracion_minutos > 0),
  activo boolean not null default true,
  created_at timestamptz default now()
);

-- dia_semana: 0=Domingo … 6=Sábado (igual que JS getDay())
create table if not exists public.horarios_config (
  dia_semana int primary key check (dia_semana between 0 and 6),
  hora_apertura time not null,
  hora_cierre time not null,
  pausa_inicio time,          -- ej. comida 14:00
  pausa_fin time,             -- ej. comida 15:00
  activo boolean not null default true,
  check (hora_apertura < hora_cierre)
);

create table if not exists public.bloqueos (
  id uuid primary key default gen_random_uuid(),
  fecha_inicio timestamptz not null,
  fecha_fin timestamptz not null,
  motivo text default '',
  check (fecha_inicio < fecha_fin)
);

create table if not exists public.citas (
  id uuid primary key default gen_random_uuid(),
  cliente_nombre text not null check (char_length(cliente_nombre) >= 2),
  cliente_telefono text not null,
  servicio_id uuid references public.servicios(id) on delete set null,
  fecha_hora_inicio timestamptz not null,
  fecha_hora_fin timestamptz not null,
  estado text not null default 'Pendiente'
    check (estado in ('Pendiente','Confirmada','Completada','Cancelada')),
  created_at timestamptz default now(),
  check (fecha_hora_inicio < fecha_hora_fin)
);
create index if not exists idx_citas_inicio on public.citas (fecha_hora_inicio);
create index if not exists idx_citas_estado on public.citas (estado);

-- ---------- 2. FUNCIÓN ANTI-SOLAPAMIENTO ----------
-- Impide doble reserva a nivel BD (citas no canceladas que se traslapan).
create or replace function public.cita_se_solapa()
returns trigger language plpgsql as $$
begin
  if new.estado <> 'Cancelada' and exists (
    select 1 from public.citas c
    where c.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
      and c.estado <> 'Cancelada'
      and tstzrange(c.fecha_hora_inicio, c.fecha_hora_fin, '[)')
       && tstzrange(new.fecha_hora_inicio, new.fecha_hora_fin, '[)')
  ) then
    raise exception 'SOLAPAMIENTO: ese bloque ya está reservado';
  end if;
  return new;
end $$;

drop trigger if exists trg_cita_solapa on public.citas;
create trigger trg_cita_solapa
  before insert or update on public.citas
  for each row execute function public.cita_se_solapa();

-- ---------- 3. RLS ----------
alter table public.servicios enable row level security;
alter table public.horarios_config enable row level security;
alter table public.bloqueos enable row level security;
alter table public.citas enable row level security;

-- helper: ¿es admin? (usuario Auth con user_metadata.role = 'admin')
create or replace function public.es_admin()
returns boolean language sql stable as $$
  select coalesce((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin', false)
$$;

-- LECTURA PÚBLICA: servicios activos, horarios activos, bloqueos (solo fechas, sin motivo sensible)
drop policy if exists "public read servicios activos" on public.servicios;
create policy "public read servicios activos" on public.servicios
  for select to anon, authenticated using (activo = true or public.es_admin());

drop policy if exists "public read horarios" on public.horarios_config;
create policy "public read horarios" on public.horarios_config
  for select to anon, authenticated using (true);

drop policy if exists "public read bloqueos" on public.bloqueos;
create policy "public read bloqueos" on public.bloqueos
  for select to anon, authenticated using (true);

-- CITAS: el público SOLO puede INSERTAR (crear su reserva).
-- No puede SELECT/UPDATE/DELETE → no ve datos de otros clientes.
drop policy if exists "public insert citas" on public.citas;
create policy "public insert citas" on public.citas
  for insert to anon, authenticated
  with check (estado = 'Pendiente');

-- ADMIN: todo permitido
drop policy if exists "admin all servicios" on public.servicios;
create policy "admin all servicios" on public.servicios
  for all to authenticated using (public.es_admin()) with check (public.es_admin());
drop policy if exists "admin all horarios" on public.horarios_config;
create policy "admin all horarios" on public.horarios_config
  for all to authenticated using (public.es_admin()) with check (public.es_admin());
drop policy if exists "admin all bloqueos" on public.bloqueos;
create policy "admin all bloqueos" on public.bloqueos
  for all to authenticated using (public.es_admin()) with check (public.es_admin());
drop policy if exists "admin all citas" on public.citas;
create policy "admin all citas" on public.citas
  for all to authenticated using (public.es_admin()) with check (public.es_admin());

-- ---------- 4. SEED ----------
insert into public.servicios (nombre, descripcion, precio, duracion_minutos) values
  ('Corte clásico', 'Tijera + máquina, acabado con navaja', 150, 30),
  ('Fade / Degradado', 'Fade preciso + perfilado + cera', 180, 45),
  ('Barba + perfilado', 'Toalla caliente + aceite + navaja', 120, 30),
  ('Corte + Barba premium', 'Servicio completo + mascarilla', 280, 60)
on conflict do nothing;

-- Lun(1)–Sáb(6) 10:00–20:00 con comida 14:00–15:00. Domingo cerrado.
insert into public.horarios_config (dia_semana, hora_apertura, hora_cierre, pausa_inicio, pausa_fin, activo) values
  (0, '10:00', '14:00', null, null, false),
  (1, '10:00', '20:00', '14:00', '15:00', true),
  (2, '10:00', '20:00', '14:00', '15:00', true),
  (3, '10:00', '20:00', '14:00', '15:00', true),
  (4, '10:00', '20:00', '14:00', '15:00', true),
  (5, '10:00', '20:00', '14:00', '15:00', true),
  (6, '10:00', '20:00', '14:00', '15:00', true)
on conflict (dia_semana) do update set
  hora_apertura = excluded.hora_apertura, hora_cierre = excluded.hora_cierre,
  pausa_inicio = excluded.pausa_inicio, pausa_fin = excluded.pausa_fin, activo = excluded.activo;
