import { useMemo } from 'react';
import { QR_QUIET_ZONE, ticketQrMatrix } from '@/lib/ticket-qr';
export function TicketQr({ payload }: { payload: string }) {
  const result = useMemo(() => {
    try {
      const matrix = ticketQrMatrix(payload), paths: string[] = [];
      for (let row = 0; row < matrix.size; row++) for (let col = 0; col < matrix.size; col++) if (matrix.get(row, col)) paths.push(`M${col + QR_QUIET_ZONE} ${row + QR_QUIET_ZONE}h1v1h-1z`);
      return { size: matrix.size + QR_QUIET_ZONE * 2, path: paths.join('') };
    } catch { return null; }
  }, [payload]);
  return result ? <svg className="ticket-qr" role="img" aria-label="Your secure ticket QR code" viewBox={`0 0 ${result.size} ${result.size}`} shapeRendering="crispEdges"><rect width="100%" height="100%" fill="#fff" /><path d={result.path} fill="#000" /></svg> : <p role="alert">We couldn’t render your QR. Refresh the ticket to try again.</p>;
}
