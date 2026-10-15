// Capa de datos: usa Supabase si hay credenciales, si no localStorage (demo).
// Expone el mismo API en ambos modos para que la UI no cambie.
import { supabase, usaSupabase } from "./supabaseClient";

const K = "barberia_db_v1";

const seedServicios = [
  { id: "s1", nombre: "Corte clásico", descripcion: "Tijera + máquina, acabado navaja", precio: 150, duracion_minutos: 30, activo: true },
  { id: "s2", nombre: "Fade / Degradado", descripcion: "Fade preciso + perfilado + cera", precio: 180, duracion_minutos: 45, activo: true },
  { id: "s3", nombre: "Barba + perfilado", descripcion: "Toalla caliente + aceite + navaja", precio: 120, duracion_minutos: 30, activo: true },
  { id: "s4", nombre: "Corte + Barba premium", descripcion: "Servicio completo + mascarilla", precio: 280, duracion_minutos: 60, activo: true },
];

const seedHorarios = [0, 1, 2, 3, 4, 5, 6].map((d) => ({
  dia_semana: d,
  hora_apertura: d === 0 ? "10:00" : "10:00",
  hora_cierre: d === 0 ? "14:00" : "20:00",
  pausa_inicio: d === 0 ? null : "14:00",
  pausa_fin: d === 0 ? null : "15:00",
  activo: d !== 0,
}));

function seedLocal() {
  return { servicios: seedServicios, horarios_config: seedHorarios, bloqueos: [], citas: [] };
}

function loadLocal() {
  try {
    const raw = localStorage.getItem(K);
    if (!raw) {
      const s = seedLocal();
      localStorage.setItem(K, JSON.stringify(s));
      return s;
    }
    return JSON.parse(raw);
  } catch {
    return seedLocal();
  }
}
function saveLocal(db) {
  localStorage.setItem(K, JSON.stringify(db));
}

const uid = () => Math.random().toString(36).slice(2, 10);

// ---------- Lecturas ----------
export async function dbList() {
  if (usaSupabase()) {
    const [s, h, b, c] = await Promise.all([
      supabase.from("servicios").select("*").order("precio"),
      supabase.from("horarios_config").select("*").order("dia_semana"),
      supabase.from("bloqueos").select("*").order("fecha_inicio"),
      supabase.from("citas").select("*, servicios(nombre)").order("fecha_hora_inicio"),
    ]);
    // Si falla (sin RLS/tablas), cae a local para no romper la demo
    if (s.error || h.error) return loadLocal();
    return {
      servicios: s.data ?? [],
      horarios_config: h.data ?? [],
      bloqueos: (b.data ?? []).map((x) => ({ ...x, fecha_inicio: x.fecha_inicio, fecha_fin: x.fecha_fin })),
      citas: (c.data ?? []).map((x) => ({
        ...x,
        servicio_nombre: x.servicios?.nombre,
        fecha_hora_inicio: x.fecha_hora_inicio,
        fecha_hora_fin: x.fecha_hora_fin,
      })),
    };
  }
  return loadLocal();
}

// ---------- Citas (cliente crea) ----------
export async function dbCrearCita({ cliente_nombre, cliente_telefono, servicio_id, fecha_hora_inicio, fecha_hora_fin }) {
  if (usaSupabase()) {
    const { data, error } = await supabase
      .from("citas")
      .insert({ cliente_nombre, cliente_telefono, servicio_id, fecha_hora_inicio, fecha_hora_fin, estado: "Pendiente" })
      .select()
      .single();
    if (error) throw new Error(error.message.includes("SOLAPAMIENTO") ? "Ese horario se acaba de ocupar. Elige otro." : error.message);
    return data;
  }
  const db = loadLocal();
  // validación anti-solape local (misma regla que el trigger SQL)
  const s = new Date(fecha_hora_inicio).getTime();
  const e = new Date(fecha_hora_fin).getTime();
  const choca = db.citas.some(
    (c) => c.estado !== "Cancelada" && s < new Date(c.fecha_hora_fin).getTime() && new Date(c.fecha_hora_inicio).getTime() < e
  );
  if (choca) throw new Error("Ese horario se acaba de ocupar. Elige otro.");
  const row = { id: uid(), cliente_nombre, cliente_telefono, servicio_id, fecha_hora_inicio, fecha_hora_fin, estado: "Pendiente" };
  db.citas.push(row);
  saveLocal(db);
  return row;
}

// ---------- Admin ----------
export async function dbUpdateCita(id, patch) {
  if (usaSupabase()) {
    const { error } = await supabase.from("citas").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
    return;
  }
  const db = loadLocal();
  const i = db.citas.findIndex((c) => String(c.id) === String(id));
  if (i >= 0) db.citas[i] = { ...db.citas[i], ...patch };
  saveLocal(db);
}
export async function dbDeleteCita(id) {
  if (usaSupabase()) {
    const { error } = await supabase.from("citas").delete().eq("id", id);
    if (error) throw new Error(error.message);
    return;
  }
  const db = loadLocal();
  db.citas = db.citas.filter((c) => String(c.id) !== String(id));
  saveLocal(db);
}
export async function dbUpsertServicio(svc) {
  if (usaSupabase()) {
    if (svc.id && !String(svc.id).startsWith("s")) {
      const { error } = await supabase.from("servicios").update(svc).eq("id", svc.id);
      if (error) throw new Error(error.message);
    } else {
      const { id, ...rest } = svc;
      const { error } = await supabase.from("servicios").insert(rest);
      if (error) throw new Error(error.message);
    }
    return;
  }
  const db = loadLocal();
  if (svc.id) {
    const i = db.servicios.findIndex((s) => String(s.id) === String(svc.id));
    if (i >= 0) db.servicios[i] = svc;
    else db.servicios.push({ ...svc, id: uid() });
  } else db.servicios.push({ ...svc, id: uid() });
  saveLocal(db);
}
export async function dbSaveHorarios(horarios) {
  if (usaSupabase()) {
    const { error } = await supabase.from("horarios_config").upsert(horarios, { onConflict: "dia_semana" });
    if (error) throw new Error(error.message);
    return;
  }
  const db = loadLocal();
  db.horarios_config = horarios;
  saveLocal(db);
}
export async function dbCrearBloqueo({ fecha_inicio, fecha_fin, motivo }) {
  if (usaSupabase()) {
    const { error } = await supabase.from("bloqueos").insert({ fecha_inicio, fecha_fin, motivo });
    if (error) throw new Error(error.message);
    return;
  }
  const db = loadLocal();
  db.bloqueos.push({ id: uid(), fecha_inicio, fecha_fin, motivo });
  saveLocal(db);
}
export async function dbDeleteBloqueo(id) {
  if (usaSupabase()) {
    const { error } = await supabase.from("bloqueos").delete().eq("id", id);
    if (error) throw new Error(error.message);
    return;
  }
  const db = loadLocal();
  db.bloqueos = db.bloqueos.filter((b) => String(b.id) !== String(id));
  saveLocal(db);
}

// ---------- Auth admin (demo local + Supabase Auth compatible) ----------
export function adminLogin(email, pass) {
  const e = (import.meta.env.VITE_ADMIN_EMAIL || "barbero@midominio.com").trim().toLowerCase();
  const p = (import.meta.env.VITE_ADMIN_PASSWORD || "CambiaEstaClave123").trim();
  if (email.trim().toLowerCase() === e && pass === p) {
    localStorage.setItem("barberia_admin", JSON.stringify({ email, ts: Date.now() }));
    return true;
  }
  return false;
}
export const adminLogout = () => localStorage.removeItem("barberia_admin");
export const esAdmin = () => !!localStorage.getItem("barberia_admin");
