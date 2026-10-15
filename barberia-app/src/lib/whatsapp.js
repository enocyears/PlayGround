// Construye el mensaje + URL de WhatsApp con los detalles de la cita.
export function waUrl({ to, nombre, servicio, fecha, hora, fin, precio }) {
  const msg =
    `✂️ *NUEVA CITA — ALANÍS STUDIO*%0A` +
    `———————————%0A` +
    `👤 *Cliente:* ${encodeURIComponent(nombre)}%0A` +
    `💈 *Servicio:* ${encodeURIComponent(servicio)}%0A` +
    `📅 *Fecha:* ${encodeURIComponent(fecha)}%0A` +
    `⏰ *Hora:* ${encodeURIComponent(hora)} – ${encodeURIComponent(fin)}%0A` +
    `💰 *Precio:* $${encodeURIComponent(precio)}%0A` +
    `———————————%0A` +
    `Confirmo mi cita. ¡Gracias!`;
  return `https://wa.me/${to}?text=${msg}`;
}
