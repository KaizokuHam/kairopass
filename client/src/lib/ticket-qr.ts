import QRCode from 'qrcode';
import type { TicketDetails } from '@/types/tickets';
import { formatEventDate, formatPrice, localTimezone } from './event-format';
export const QR_QUIET_ZONE = 4;
export function ticketQrMatrix(payload: string) { return QRCode.create(payload, { errorCorrectionLevel: 'Q' }).modules; }
/** All QR operations encode the server bytes unchanged; no signing credentials live here. */
export async function ticketPng(ticket: TicketDetails, attendeeName: string): Promise<Blob> {
  if (!ticket.qrAvailable || !ticket.qrPayload || !ticket.event) throw new Error('This ticket has no active QR.');
  const qr = document.createElement('canvas');
  await QRCode.toCanvas(qr, ticket.qrPayload, { errorCorrectionLevel: 'Q', margin: QR_QUIET_ZONE, width: 720, color: { dark: '#000000', light: '#ffffff' } });
  const canvas = document.createElement('canvas'); canvas.width = 1200; canvas.height = 2150;
  const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Ticket image export is unavailable.');
  ctx.fillStyle = '#081b1c'; ctx.fillRect(0, 0, 1200, 2150);
  ctx.fillStyle = '#83e2c8'; ctx.font = 'bold 44px sans-serif'; ctx.fillText('KairoPass / DIGITAL TICKET', 80, 110);
  function lines(text: string, y: number, size: number, color = '#ffffff') {
    ctx!.font = `${size}px sans-serif`; ctx!.fillStyle = color;
    const words = text.slice(0, 400).split(/\s+/); let line = '', row = y;
    for (const word of words) { if (ctx!.measureText(line + word).width > 1020 && line) { ctx!.fillText(line.trim(), 80, row); row += size + 12; line = ''; } line += word + ' '; }
    ctx!.fillText(line.trim(), 80, row); return row + size + 24;
  }
  let y = lines(ticket.event.title, 205, 48);
  y = lines(ticket.event.venue, y, 30, '#c4d9d5');
  y = lines(formatEventDate(ticket.event.startAt) + ' · ' + localTimezone(), y, 28, '#c4d9d5');
  y = lines(attendeeName + ' · ' + formatPrice(ticket.amountPaise) + ' · ' + ticket.status, y, 30);
  // A fixed, isolated white QR region remains clear of all typography.
  if (y > 980) throw new Error('Ticket details are too long for this export.');
  ctx.drawImage(qr, 240, 1000, 720, 720);
  lines('Ticket reference: ' + ticket.id, 1850, 26);
  lines('Keep your QR private. Admission requires live validation.', 1920, 24, '#c4d9d5');
  return new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Ticket image export failed.')), 'image/png'));
}
export async function downloadTicket(ticket: TicketDetails, name: string, signal: AbortSignal) {
  const blob = await ticketPng(ticket, name);
  if (signal.aborted) return;
  const url = URL.createObjectURL(blob), anchor = document.createElement('a');
  try { anchor.href = url; anchor.download = 'kairopass-ticket-' + ticket.id.replace(/[^a-f\d]/gi, '') + '.png'; anchor.click(); }
  finally { URL.revokeObjectURL(url); }
}
