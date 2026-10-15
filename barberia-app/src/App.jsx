import { useEffect, useMemo, useState } from "react";
import { getSlotsDisponibles } from "./lib/availability";
import { dbList, dbCrearCita, dbUpdateCita, dbDeleteCita, dbUpsertServicio, dbSaveHorarios, dbCrearBloqueo, dbDeleteBloqueo, adminLogin, adminLogout, esAdmin } from "./lib/store";
import { waUrl } from "./lib/whatsapp";

const BARBER_WA = import.meta.env.VITE_BARBER_WHATSAPP || "5215500000000";
const DIAS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const MESES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
const ESTADOS = ["Pendiente", "Confirmada", "Completada", "Cancelada"];
const estadoColor = { Pendiente: "bg-zinc-500/15 text-zinc-300 border-zinc-500/30", Confirmada: "bg-white text-black border-white", Completada: "bg-transparent text-zinc-400 border-zinc-700", Cancelada: "bg-zinc-800 text-zinc-500 border-zinc-800" };

const fmtFecha = (d) => { const x = new Date(d); return `${DIAS[x.getDay()]} ${x.getDate()} ${MESES[x.getMonth()]}`; };
const fmtHora = (d) => new Date(d).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", hour12: false });
const mismoDia = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();
const soloFecha = (d) => { const x = new Date(d); x.setHours(0,0,0,0); return x; };

export default function App() {
  const [vista, setVista] = useState("reservar"); // reservar | admin
  const [db, setDb] = useState({ servicios: [], horarios_config: [], bloqueos: [], citas: [] });
  const [cargando, setCargando] = useState(true);
  // flujo reserva
  const [paso, setPaso] = useState(1);
  const [servicioId, setServicioId] = useState(null);
  const [fechaSel, setFechaSel] = useState(soloFecha(new Date()));
  const [horaSel, setHoraSel] = useState(null);
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [citaCreada, setCitaCreada] = useState(null);
  const [error, setError] = useState("");
  // admin
  const [admin, setAdmin] = useState(esAdmin());
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPass, setLoginPass] = useState("");
  const [adminTab, setAdminTab] = useState("agenda");
  const [filtroDia, setFiltroDia] = useState(soloFecha(new Date()));
  const [filtroEstado, setFiltroEstado] = useState("Todas");

  const recargar = async () => {
    setCargando(true);
    try { setDb(await dbList()); } finally { setCargando(false); }
  };
  useEffect(() => { recargar(); }, []);

  const servicio = useMemo(() => db.servicios.find((s) => String(s.id) === String(servicioId)) ?? null, [db, servicioId]);
  const serviciosActivos = db.servicios.filter((s) => s.activo);

  // próximos 14 días para el carrusel
  const dias14 = useMemo(() => Array.from({ length: 14 }, (_, i) => { const d = soloFecha(new Date()); d.setDate(d.getDate() + i); return d; }), []);
  const disponibilidadPorDia = useMemo(() => {
    if (!servicio) return {};
    const map = {};
    for (const d of dias14) {
      const { slots } = getSlotsDisponibles({ fecha: d, duracionMin: servicio.duracion_minutos, horariosConfig: db.horarios_config, citas: db.citas, bloqueos: db.bloqueos });
      map[d.toDateString()] = slots;
    }
    return map;
  }, [dias14, servicio, db]);

  const slotsDelDia = fechaSel && servicio ? (disponibilidadPorDia[soloFecha(fechaSel).toDateString()] ?? []) : [];

  const confirmarReserva = async () => {
    setError("");
    if (nombre.trim().length < 2) return setError("Escribe tu nombre completo.");
    if (!/^[0-9+()\\s-]{8,}$/.test(telefono.trim())) return setError("Teléfono/WhatsApp inválido.");
    if (!servicio || !horaSel) return setError("Selecciona servicio, fecha y hora.");
    try {
      const fin = new Date(new Date(horaSel).getTime() + servicio.duracion_minutos * 60000);
      const row = await dbCrearCita({ cliente_nombre: nombre.trim(), cliente_telefono: telefono.trim(), servicio_id: servicio.id, fecha_hora_inicio: new Date(horaSel).toISOString(), fecha_hora_fin: fin.toISOString() });
      setCitaCreada({ ...row, servicio });
      setPaso(4);
      recargar();
    } catch (e) { setError(e.message); }
  };

  // ---- admin derivados ----
  const citasDia = useMemo(() => {
    let list = [...db.citas].sort((a, b) => new Date(a.fecha_hora_inicio) - new Date(b.fecha_hora_inicio));
    if (adminTab === "agenda") list = list.filter((c) => mismoDia(c.fecha_hora_inicio, filtroDia));
    if (filtroEstado !== "Todas") list = list.filter((c) => c.estado === filtroEstado);
    return list;
  }, [db, filtroDia, filtroEstado, adminTab]);

  return (
    <div className="min-h-screen">
      <Header vista={vista} setVista={setVista} admin={admin} />
      {vista === "reservar" ? (
        <main className="mx-auto max-w-3xl px-4 pb-24">
          <Hero />
          <Steps paso={paso} />
          {error && <div className="mb-4 rounded-xl border border-zinc-500/40 bg-zinc-500/10 px-4 py-3 text-sm text-zinc-200">{error}</div>}
          {paso === 1 && (
            <section>
              <h2 className="font-display text-xl uppercase tracking-wide">1 · Elige tu servicio</h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {serviciosActivos.map((s) => (
                  <button key={s.id} onClick={() => { setServicioId(s.id); setHoraSel(null); setPaso(2); }}
                    className={`rounded-2xl border p-4 text-left transition ${String(servicioId) === String(s.id) ? "border-white bg-white/10" : "border-zinc-800 bg-coal-800 hover:border-zinc-400"}`}>
                    <div className="font-display text-lg uppercase">{s.nombre}</div>
                    <div className="text-sm text-zinc-400">{s.descripcion}</div>
                    <div className="mt-2 flex gap-2 text-sm">
                      <span className="rounded-full bg-coal-600 px-2 py-0.5">⏱ {s.duracion_minutos} min</span>
                      <span className="rounded-full bg-white/10 px-2 py-0.5 text-zinc-200 font-semibold">${s.precio}</span>
                    </div>
                  </button>
                ))}
              </div>
              {cargando && <p className="mt-4 text-sm text-zinc-500">Cargando servicios…</p>}
            </section>
          )}
          {paso === 2 && servicio && (
            <section>
              <button onClick={() => setPaso(1)} className="text-sm text-zinc-200">← Cambiar servicio ({servicio.nombre})</button>
              <h2 className="mt-1 font-display text-xl uppercase">2 · Fecha y hora</h2>
              <div className="mt-3 flex gap-2 overflow-x-auto pb-2">
                {dias14.map((d) => {
                  const n = (disponibilidadPorDia[d.toDateString()] ?? []).length;
                  const sel = mismoDia(d, fechaSel);
                  return (
                    <button key={d.toISOString()} disabled={!n} onClick={() => { setFechaSel(d); setHoraSel(null); }}
                      className={`min-w-[68px] rounded-xl border px-2 py-2 text-center ${sel ? "border-white bg-white text-black" : n ? "border-zinc-700 bg-coal-800" : "border-zinc-800 bg-coal-800 opacity-35"}`}>
                      <div className="text-xs uppercase">{DIAS[d.getDay()]}</div>
                      <div className="font-display text-xl">{d.getDate()}</div>
                      <div className="text-[11px]">{n ? `${n} libres` : "lleno"}</div>
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-sm text-zinc-400">{fmtFecha(fechaSel)} · {servicio.duracion_minutos} min</p>
              <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
                {slotsDelDia.map((s) => (
                  <button key={s.toISOString()} onClick={() => setHoraSel(s)}
                    className={`rounded-xl border py-2 font-semibold ${horaSel && new Date(horaSel).getTime() === s.getTime() ? "border-white bg-white text-black" : "border-zinc-700 bg-coal-800 hover:border-zinc-400"}`}>
                    {fmtHora(s)}
                  </button>
                ))}
                {!slotsDelDia.length && <p className="col-span-full text-sm text-zinc-500">Sin disponibilidad este día. Prueba otra fecha.</p>}
              </div>
              <button disabled={!horaSel} onClick={() => setPaso(3)}
                className="mt-4 w-full rounded-xl bg-white py-3 font-display uppercase tracking-widest text-black disabled:opacity-40">Continuar →</button>
            </section>
          )}
          {paso === 3 && (
            <section>
              <h2 className="font-display text-xl uppercase">3 · Tus datos</h2>
              <div className="mt-3 rounded-2xl border border-zinc-800 bg-coal-800 p-4 text-sm">
                <b>{servicio?.nombre}</b> · {fechaSel && fmtFecha(fechaSel)} · <b>{horaSel && fmtHora(horaSel)}</b> · ${servicio?.precio}
              </div>
              <label className="mt-3 block text-sm">Nombre completo<input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Juan Pérez" className="mt-1 w-full rounded-xl border border-zinc-700 bg-coal-700 px-3 py-2.5 outline-none focus:border-white" /></label>
              <label className="mt-3 block text-sm">Teléfono / WhatsApp<input value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="Ej. 55 1234 5678" inputMode="tel" className="mt-1 w-full rounded-xl border border-zinc-700 bg-coal-700 px-3 py-2.5 outline-none focus:border-white" /></label>
              <div className="mt-4 flex gap-2">
                <button onClick={() => setPaso(2)} className="flex-1 rounded-xl border border-zinc-700 py-3">← Atrás</button>
                <button onClick={confirmarReserva} className="flex-[2] rounded-xl bg-white py-3 font-display uppercase tracking-widest text-black">Confirmar cita</button>
              </div>
              <p className="mt-2 text-xs text-zinc-500">Sin contraseña: reserva como invitado con nombre + WhatsApp.</p>
            </section>
          )}
          {paso === 4 && citaCreada && (
            <Confirmacion cita={citaCreada} barberWa={BARBER_WA} onNueva={() => { setPaso(1); setCitaCreada(null); setHoraSel(null); setNombre(""); setTelefono(""); }} />
          )}
        </main>
      ) : (
        <main className="mx-auto max-w-5xl px-4 pb-24">
          {!admin ? (
            <Login onOk={() => { setAdmin(true); setVista("admin"); }} loginEmail={loginEmail} setLoginEmail={setLoginEmail} loginPass={loginPass} setLoginPass={setLoginPass} />
          ) : (
            <AdminPanel db={db} recargar={recargar} adminTab={adminTab} setAdminTab={setAdminTab} filtroDia={filtroDia} setFiltroDia={setFiltroDia} filtroEstado={filtroEstado} setFiltroEstado={setFiltroEstado} citasDia={citasDia} onLogout={() => { adminLogout(); setAdmin(false); setVista("reservar"); }} />
          )}
        </main>
      )}
      <NavBottom vista={vista} setVista={setVista} />
    </div>
  );
}

function Header({ vista, setVista, admin }) {
  return (
    <header className="sticky top-0 z-10 border-b border-zinc-800 bg-coal-900/90 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <button onClick={() => setVista("reservar")} className="flex items-center gap-2">
          <img src="/logo.svg" alt="Alanís Studio" className="h-9 w-9 rounded-full ring-1 ring-zinc-700" />
          <span className="font-display text-lg uppercase tracking-widest">Alanís <span className="text-zinc-400">Studio</span></span>
        </button>
        <nav className="hidden gap-2 sm:flex">
          <button onClick={() => setVista("reservar")} className={`rounded-lg px-3 py-1.5 text-sm ${vista === "reservar" ? "bg-white text-black font-semibold" : "text-zinc-300"}`}>Reservar</button>
          <button onClick={() => setVista("admin")} className={`rounded-lg px-3 py-1.5 text-sm ${vista === "admin" ? "bg-white text-black font-semibold" : "text-zinc-300"}`}>{admin ? "Panel" : "Soy barbero"}</button>
        </nav>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <div className="mt-4 overflow-hidden rounded-2xl border border-zinc-800 bg-gradient-to-br from-coal-700 via-coal-800 to-black p-5">
      <p className="text-xs uppercase tracking-[0.25em] text-zinc-200">Modo oscuro · Sin filas · Sin llamadas</p>
      <h1 className="mt-1 font-display text-3xl uppercase leading-tight">Reserva tu corte<br />en <span className="text-white">30 segundos</span></h1>
      <p className="mt-1 text-sm text-zinc-400">Elige servicio → fecha y hora libres → confirma por WhatsApp.</p>
    </div>
  );
}

function Steps({ paso }) {
  return (
    <div className="my-4 flex gap-1.5">
      {["Servicio", "Fecha", "Datos", "Listo"].map((t, i) => (
        <div key={t} className={`flex-1 rounded-lg px-2 py-1.5 text-center text-xs ${paso >= i + 1 ? "bg-white/10 text-zinc-200 border border-zinc-600" : "bg-coal-800 text-zinc-500 border border-zinc-800"}`}>{i + 1}. {t}</div>
      ))}
    </div>
  );
}

function Confirmacion({ cita, barberWa, onNueva }) {
  const s = cita.servicio;
  const fecha = fmtFecha(cita.fecha_hora_inicio);
  const hora = fmtHora(cita.fecha_hora_inicio);
  const fin = fmtHora(cita.fecha_hora_fin);
  const url = waUrl({ to: barberWa, nombre: cita.cliente_nombre, servicio: s?.nombre ?? "", fecha, hora, fin, precio: s?.precio ?? "" });
  return (
    <section className="rounded-2xl border border-zinc-600 bg-white/5 p-5 text-center">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-full border border-white text-2xl text-white">✓</div>
      <h2 className="mt-1 font-display text-2xl uppercase">¡Cita confirmada!</h2>
      <div className="mx-auto mt-3 max-w-sm rounded-xl bg-coal-800 p-4 text-left text-sm">
        <p>👤 <b>{cita.cliente_nombre}</b> · {cita.cliente_telefono}</p>
        <p>💈 {s?.nombre} (${s?.precio} · {s?.duracion_minutos} min)</p>
        <p>📅 {fecha} · ⏰ {hora} – {fin}</p>
        <p className="mt-1 inline-block rounded-full border px-2 py-0.5 text-xs border-zinc-500/30 bg-zinc-500/15 text-zinc-300">Estado: Pendiente (el barbero la confirmará)</p>
      </div>
      <a href={url} target="_blank" rel="noreferrer" className="mt-4 block rounded-xl bg-white py-3 font-semibold text-black">Enviar confirmación por WhatsApp</a>
      <button onClick={onNueva} className="mt-2 w-full rounded-xl border border-zinc-700 py-2.5 text-sm">Agendar otra cita</button>
    </section>
  );
}

function Login({ onOk, loginEmail, setLoginEmail, loginPass, setLoginPass }) {
  const [err, setErr] = useState("");
  return (
    <div className="mx-auto mt-8 max-w-sm rounded-2xl border border-zinc-800 bg-coal-800 p-5">
      <h2 className="font-display text-xl uppercase">Acceso barbero 🔒</h2>
      <p className="text-xs text-zinc-500">Solo el administrador. Configura VITE_ADMIN_EMAIL / PASSWORD.</p>
      <input value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} placeholder="Email admin" className="mt-3 w-full rounded-xl border border-zinc-700 bg-coal-700 px-3 py-2.5" />
      <input value={loginPass} onChange={(e) => setLoginPass(e.target.value)} type="password" placeholder="Contraseña" className="mt-2 w-full rounded-xl border border-zinc-700 bg-coal-700 px-3 py-2.5" />
      {err && <p className="mt-2 text-sm text-zinc-300">{err}</p>}
      <button onClick={() => (adminLogin(loginEmail, loginPass) ? onOk() : setErr("Credenciales inválidas."))} className="mt-3 w-full rounded-xl bg-white py-2.5 font-semibold text-black">Entrar al panel</button>
    </div>
  );
}

function AdminPanel({ db, recargar, adminTab, setAdminTab, filtroDia, setFiltroDia, filtroEstado, setFiltroEstado, citasDia, onLogout }) {
  const nombreServicio = (c) => c.servicio_nombre ?? db.servicios.find((s) => String(s.id) === String(c.servicio_id))?.nombre ?? "—";
  const cambiarEstado = async (c, estado) => { await dbUpdateCita(c.id, { estado }); recargar(); };
  return (
    <div className="mt-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-2xl uppercase">Panel del barbero</h2>
        <button onClick={onLogout} className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm">Salir</button>
      </div>
      <div className="mt-3 flex gap-2 overflow-x-auto">
        {[["agenda", "📅 Agenda"], ["servicios", "💈 Servicios"], ["horarios", "⏰ Horarios"], ["bloqueos", "🚫 Bloqueos"]].map(([k, t]) => (
          <button key={k} onClick={() => setAdminTab(k)} className={`rounded-lg px-3 py-1.5 text-sm whitespace-nowrap ${adminTab === k ? "bg-white text-black font-semibold" : "bg-coal-800 border border-zinc-700"}`}>{t}</button>
        ))}
      </div>

      {adminTab === "agenda" && (
        <div className="mt-3">
          <div className="flex flex-wrap gap-2">
            <input type="date" value={new Date(filtroDia).toISOString().slice(0, 10)} onChange={(e) => setFiltroDia(new Date(e.target.value + "T12:00:00"))} className="rounded-lg border border-zinc-700 bg-coal-800 px-2 py-1.5 text-sm" />
            <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)} className="rounded-lg border border-zinc-700 bg-coal-800 px-2 py-1.5 text-sm">
              {["Todas", ...ESTADOS].map((e) => <option key={e}>{e}</option>)}
            </select>
            <span className="text-sm text-zinc-400 self-center">{citasDia.length} cita(s) · {fmtFecha(filtroDia)}</span>
          </div>
          <div className="mt-2 grid gap-2">
            {citasDia.map((c) => (
              <div key={c.id} className="rounded-xl border border-zinc-800 bg-coal-800 p-3">
                <div className="flex items-center justify-between gap-2">
                  <b>{fmtHora(c.fecha_hora_inicio)} – {fmtHora(c.fecha_hora_fin)}</b>
                  <span className={`rounded-full border px-2 py-0.5 text-xs ${estadoColor[c.estado]}`}>{c.estado}</span>
                </div>
                <p className="text-sm">{c.cliente_nombre} · {c.cliente_telefono}</p>
                <p className="text-xs text-zinc-400">{nombreServicio(c)} · {fmtFecha(c.fecha_hora_inicio)}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {c.estado === "Pendiente" && <button onClick={() => cambiarEstado(c, "Confirmada")} className="rounded-lg bg-white px-2.5 py-1 text-xs font-semibold text-black">Aceptar</button>}
                  {c.estado !== "Completada" && c.estado !== "Cancelada" && <button onClick={() => cambiarEstado(c, "Completada")} className="rounded-lg bg-zinc-600 px-2.5 py-1 text-xs font-semibold text-white">Completada</button>}
                  {c.estado !== "Cancelada" && <button onClick={() => cambiarEstado(c, "Cancelada")} className="rounded-lg border border-zinc-500 px-2.5 py-1 text-xs text-zinc-200">Cancelar</button>}
                  <button onClick={async () => { if (confirm("¿Eliminar cita?")) { await dbDeleteCita(c.id); recargar(); } }} className="rounded-lg border border-zinc-600 px-2.5 py-1 text-xs">Eliminar</button>
                  <a href={`https://wa.me/${String(c.cliente_telefono).replace(/\\D/g, "")}`} target="_blank" rel="noreferrer" className="rounded-lg bg-white px-2.5 py-1 text-xs font-semibold text-black">WhatsApp cliente</a>
                </div>
              </div>
            ))}
            {!citasDia.length && <p className="text-sm text-zinc-500">No hay citas con ese filtro.</p>}
          </div>
        </div>
      )}

      {adminTab === "servicios" && <ServiciosEditor db={db} recargar={recargar} />}
      {adminTab === "horarios" && <HorariosEditor db={db} recargar={recargar} />}
      {adminTab === "bloqueos" && <BloqueosEditor db={db} recargar={recargar} />}
    </div>
  );
}

function ServiciosEditor({ db, recargar }) {
  const [form, setForm] = useState({ id: "", nombre: "", descripcion: "", precio: "", duracion_minutos: "" });
  const guardar = async () => {
    if (!form.nombre || !form.precio || !form.duracion_minutos) return alert("Nombre, precio y duración son obligatorios");
    await dbUpsertServicio({ id: form.id || undefined, nombre: form.nombre, descripcion: form.descripcion, precio: Number(form.precio), duracion_minutos: Number(form.duracion_minutos), activo: true });
    setForm({ id: "", nombre: "", descripcion: "", precio: "", duracion_minutos: "" });
    recargar();
  };
  return (
    <div className="mt-3">
      <div className="rounded-xl border border-zinc-800 bg-coal-800 p-3">
        <p className="text-sm font-semibold">{form.id ? "Editar servicio" : "Nuevo servicio"}</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="Nombre" className="rounded-lg border border-zinc-700 bg-coal-700 px-2 py-1.5 text-sm" />
          <input value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} placeholder="Descripción" className="rounded-lg border border-zinc-700 bg-coal-700 px-2 py-1.5 text-sm" />
          <input value={form.precio} onChange={(e) => setForm({ ...form, precio: e.target.value })} placeholder="Precio $" type="number" className="rounded-lg border border-zinc-700 bg-coal-700 px-2 py-1.5 text-sm" />
          <input value={form.duracion_minutos} onChange={(e) => setForm({ ...form, duracion_minutos: e.target.value })} placeholder="Duración min" type="number" className="rounded-lg border border-zinc-700 bg-coal-700 px-2 py-1.5 text-sm" />
        </div>
        <div className="mt-2 flex gap-2">
          <button onClick={guardar} className="rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-black">Guardar</button>
          {form.id && <button onClick={() => setForm({ id: "", nombre: "", descripcion: "", precio: "", duracion_minutos: "" })} className="rounded-lg border border-zinc-600 px-3 py-1.5 text-sm">Cancelar</button>}
        </div>
      </div>
      <div className="mt-2 grid gap-2">
        {db.servicios.map((s) => (
          <div key={s.id} className="flex items-center justify-between rounded-xl border border-zinc-800 bg-coal-800 p-3 text-sm">
            <div><b>{s.nombre}</b> <span className="text-zinc-400">· {s.duracion_minutos} min · ${s.precio} · {s.activo ? "activo" : "inactivo"}</span></div>
            <div className="flex gap-1.5">
              <button onClick={() => setForm({ id: s.id, nombre: s.nombre, descripcion: s.descripcion ?? "", precio: s.precio, duracion_minutos: s.duracion_minutos })} className="rounded-lg border border-zinc-600 px-2 py-1 text-xs">Editar</button>
              <button onClick={async () => { await dbUpsertServicio({ ...s, activo: !s.activo }); recargar(); }} className="rounded-lg border border-zinc-600 px-2 py-1 text-xs">{s.activo ? "Desactivar" : "Activar"}</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function HorariosEditor({ db, recargar }) {
  const [h, setH] = useState(db.horarios_config);
  useEffect(() => setH(db.horarios_config), [db]);
  const set = (dow, k, v) => setH(h.map((x) => (x.dia_semana === dow ? { ...x, [k]: v } : x)));
  return (
    <div className="mt-3 rounded-xl border border-zinc-800 bg-coal-800 p-3">
      {["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"].map((n, dow) => {
        const c = h.find((x) => x.dia_semana === dow);
        if (!c) return null;
        return (
          <div key={dow} className="flex flex-wrap items-center gap-2 border-b border-zinc-800 py-2 text-sm last:border-0">
            <label className="flex w-28 items-center gap-1.5"><input type="checkbox" checked={c.activo} onChange={(e) => set(dow, "activo", e.target.checked)} className="accent-white" />{n}</label>
            <input type="time" value={String(c.hora_apertura).slice(0, 5)} onChange={(e) => set(dow, "hora_apertura", e.target.value)} className="rounded-lg border border-zinc-700 bg-coal-700 px-1.5 py-1 text-sm" />
            <span>–</span>
            <input type="time" value={String(c.hora_cierre).slice(0, 5)} onChange={(e) => set(dow, "hora_cierre", e.target.value)} className="rounded-lg border border-zinc-700 bg-coal-700 px-1.5 py-1 text-sm" />
            <span className="text-xs text-zinc-500">comida:</span>
            <input type="time" value={c.pausa_inicio ? String(c.pausa_inicio).slice(0, 5) : ""} onChange={(e) => set(dow, "pausa_inicio", e.target.value || null)} className="rounded-lg border border-zinc-700 bg-coal-700 px-1.5 py-1 text-sm" />
            <input type="time" value={c.pausa_fin ? String(c.pausa_fin).slice(0, 5) : ""} onChange={(e) => set(dow, "pausa_fin", e.target.value || null)} className="rounded-lg border border-zinc-700 bg-coal-700 px-1.5 py-1 text-sm" />
          </div>
        );
      })}
      <button onClick={async () => { await dbSaveHorarios(h); recargar(); alert("Horario guardado"); }} className="mt-2 rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-black">Guardar horarios</button>
    </div>
  );
}

function BloqueosEditor({ db, recargar }) {
  const [f, setF] = useState({ fecha: "", hini: "10:00", hfin: "20:00", motivo: "" });
  return (
    <div className="mt-3">
      <div className="rounded-xl border border-zinc-800 bg-coal-800 p-3 text-sm">
        <p className="font-semibold">Bloquear día / hora (feriado, imprevisto)</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <input type="date" value={f.fecha} onChange={(e) => setF({ ...f, fecha: e.target.value })} className="rounded-lg border border-zinc-700 bg-coal-700 px-2 py-1.5" />
          <input type="time" value={f.hini} onChange={(e) => setF({ ...f, hini: e.target.value })} className="rounded-lg border border-zinc-700 bg-coal-700 px-2 py-1.5" />
          <input type="time" value={f.hfin} onChange={(e) => setF({ ...f, hfin: e.target.value })} className="rounded-lg border border-zinc-700 bg-coal-700 px-2 py-1.5" />
          <input value={f.motivo} onChange={(e) => setF({ ...f, motivo: e.target.value })} placeholder="Motivo" className="min-w-[140px] flex-1 rounded-lg border border-zinc-700 bg-coal-700 px-2 py-1.5" />
          <button onClick={async () => { if (!f.fecha) return alert("Elige fecha"); await dbCrearBloqueo({ fecha_inicio: new Date(`${f.fecha}T${f.hini}`).toISOString(), fecha_fin: new Date(`${f.fecha}T${f.hfin}`).toISOString(), motivo: f.motivo }); setF({ fecha: "", hini: "10:00", hfin: "20:00", motivo: "" }); recargar(); }} className="rounded-lg bg-white px-3 py-1.5 font-semibold text-black">Bloquear</button>
        </div>
      </div>
      <div className="mt-2 grid gap-2">
        {db.bloqueos.map((b) => (
          <div key={b.id} className="flex items-center justify-between rounded-xl border border-zinc-800 bg-coal-800 p-3 text-sm">
            <span>{fmtFecha(b.fecha_inicio)} · {fmtHora(b.fecha_inicio)}–{fmtHora(b.fecha_fin)} · {b.motivo}</span>
            <button onClick={async () => { await dbDeleteBloqueo(b.id); recargar(); }} className="rounded-lg border border-zinc-600 px-2 py-1 text-xs">Desbloquear</button>
          </div>
        ))}
        {!db.bloqueos.length && <p className="text-sm text-zinc-500">Sin bloqueos.</p>}
      </div>
    </div>
  );
}

function NavBottom({ vista, setVista }) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 border-t border-zinc-800 bg-coal-900/95 backdrop-blur sm:hidden">
      <div className="grid grid-cols-2">
        <button onClick={() => setVista("reservar")} className={`py-3 text-sm ${vista === "reservar" ? "text-zinc-200 font-semibold" : "text-zinc-400"}`}>💈 Reservar</button>
        <button onClick={() => setVista("admin")} className={`py-3 text-sm ${vista === "admin" ? "text-zinc-200 font-semibold" : "text-zinc-400"}`}>🔒 Admin</button>
      </div>
    </nav>
  );
}
