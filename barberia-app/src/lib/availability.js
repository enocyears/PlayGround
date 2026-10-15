// ============================================================
// Lógica de cálculo de bloques horarios disponibles
// Evita solapamientos de citas + respeta horario laboral,
// pausas, bloqueos y hora actual. Sin dependencias.
// ============================================================

/** ¿Los intervalos [aStart,aEnd) y [bStart,bEnd) se solapan? */
export function intervalosSeSolapan(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

const toMin = (t) => {
  // "HH:MM" o "HH:MM:SS" -> minutos desde medianoche
  if (t == null) return null;
  const [h, m] = String(t).split(":").map(Number);
  return h * 60 + m;
};

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function addMin(date, min) {
  return new Date(date.getTime() + min * 60000);
}

/**
 * Calcula slots disponibles para una fecha.
 * @param {Object} args
 * @param {Date|string} args.fecha - día a evaluar
 * @param {number} args.duracionMin - duración del servicio
 * @param {Array} args.horariosConfig - [{dia_semana, hora_apertura, hora_cierre, pausa_inicio, pausa_fin, activo}]
 * @param {Array} args.citas - [{fecha_hora_inicio, fecha_hora_fin, estado}] (se ignoran Canceladas)
 * @param {Array} args.bloqueos - [{fecha_inicio, fecha_fin}]
 * @param {number} [args.slotStep=15] - granularidad en minutos
 * @param {Date} [args.ahora=new Date()] - para no ofrecer pasado
 * @returns {{slots: Date[], razon: string|null}} slots = inicios válidos
 */
export function getSlotsDisponibles({
  fecha,
  duracionMin,
  horariosConfig,
  citas = [],
  bloqueos = [],
  slotStep = 15,
  ahora = new Date(),
}) {
  const dia = startOfDay(fecha);
  const dow = dia.getDay(); // 0=Dom
  const cfg = horariosConfig.find((h) => Number(h.dia_semana) === dow);

  if (!cfg || !cfg.activo) return { slots: [], razon: "Día no laborable" };

  const ap = toMin(cfg.hora_apertura);
  const ci = toMin(cfg.hora_cierre);
  if (ap == null || ci == null || ci <= ap) return { slots: [], razon: "Horario inválido" };

  const pausaIni = toMin(cfg.pausa_inicio);
  const pausaFin = toMin(cfg.pausa_fin);
  const hayPausa = pausaIni != null && pausaFin != null && pausaFin > pausaIni;

  // Ocupados = citas activas de ESE día + pausa + bloqueos que toquen el día
  const iniDia = dia.getTime();
  const finDia = iniDia + 24 * 3600 * 1000;
  const ocupados = [];

  for (const c of citas) {
    if (c.estado === "Cancelada") continue;
    const s = new Date(c.fecha_hora_inicio).getTime();
    const e = new Date(c.fecha_hora_fin).getTime();
    if (e > iniDia && s < finDia) ocupados.push([s, e]);
  }
  if (hayPausa) {
    ocupados.push([
      addMin(dia, pausaIni).getTime(),
      addMin(dia, pausaFin).getTime(),
    ]);
  }
  for (const b of bloqueos) {
    const s = new Date(b.fecha_inicio ?? b.fechaInicio).getTime();
    const e = new Date(b.fecha_fin ?? b.fechaFin).getTime();
    if (e > iniDia && s < finDia) ocupados.push([Math.max(s, iniDia), Math.min(e, finDia)]);
  }

  const slots = [];
  // Candidato: desde apertura hasta (cierre - duración), pasos de slotStep
  for (let m = ap; m + duracionMin <= ci; m += slotStep) {
    const ini = addMin(dia, m);
    const fin = addMin(ini, duracionMin);
    // 1) No ofrecer pasado (+ margen 10 min)
    if (fin.getTime() <= ahora.getTime() + 10 * 60000) continue;
    // 2) Sin solapamiento con ningún ocupado
    const choca = ocupados.some(([s, e]) =>
      intervalosSeSolapan(ini.getTime(), fin.getTime(), s, e)
    );
    if (!choca) slots.push(ini);
  }
  return { slots, razon: slots.length ? null : "Sin disponibilidad" };
}

/** Próximos N días con al menos 1 slot (para pintar el calendario). */
export function getDiasConDisponibilidad({
  desde = new Date(),
  dias = 14,
  duracionMin,
  horariosConfig,
  citas,
  bloqueos,
  slotStep = 15,
  ahora = new Date(),
}) {
  const out = [];
  for (let i = 0; i < dias; i++) {
    const f = new Date(desde);
    f.setDate(f.getDate() + i);
    const { slots } = getSlotsDisponibles({
      fecha: f, duracionMin, horariosConfig, citas, bloqueos, slotStep, ahora,
    });
    if (slots.length) out.push(startOfDay(f));
  }
  return out;
}

/** Formatea Date a "HH:MM" */
export const fmtHora = (d) =>
  new Date(d).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", hour12: false });
