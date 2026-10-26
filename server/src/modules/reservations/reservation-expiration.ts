import { isDatabaseReady } from '../../config/database.js';
import { env } from '../../config/env.js';
import { Reservation } from '../../models/Reservation.model.js';
import { expireReservation } from './reservations.service.js';

export const EXPIRATION_INTERVAL_MS = 60_000;
export const EXPIRATION_BATCH_SIZE = 50;
/** No module-import timer. One in-flight batch per instance; conditional transactions arbitrate across instances. */
export function createExpirationWorker(options: { now?: () => Date; intervalMs?: number; onError?: () => void } = {}) {
  const now = options.now ?? (() => new Date(Date.now()));
  let timer: ReturnType<typeof setInterval> | undefined;
  let running: Promise<number> | undefined;
  let stopping = false;
  const onError = options.onError ?? (() => {
    if (env.LOG_LEVEL !== 'silent') console.error('Reservation expiration batch failed; a later batch will retry.');
  });
  const runOnce = (): Promise<number> => {
    if (stopping || !isDatabaseReady()) return Promise.resolve(0);
    if (running) return running;
    running = (async () => {
      let released = 0;
      const cutoff = now();
      const due = await Reservation.find({ status: 'HELD', expiresAt: { $lte: cutoff } })
        .select('_id').sort({ expiresAt: 1, _id: 1 }).limit(EXPIRATION_BATCH_SIZE).maxTimeMS(2000);
      for (const reservation of due) {
        if (stopping) break;
        try { if (await expireReservation(reservation._id.toString(), cutoff)) released++; }
        catch { onError(); }
      }
      return released;
    })().catch(() => { onError(); return 0; }).finally(() => { running = undefined; });
    return running;
  };
  return {
    runOnce,
    start() {
      if (timer || stopping) return;
      void runOnce();
      timer = setInterval(() => { void runOnce(); }, options.intervalMs ?? EXPIRATION_INTERVAL_MS);
      timer.unref();
    },
    async stop() {
      stopping = true;
      if (timer) clearInterval(timer);
      timer = undefined;
      await running;
    }
  };
}
