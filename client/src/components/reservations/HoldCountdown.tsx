import { useEffect, useRef } from 'react';
export function HoldCountdown({ remaining, expired }: { remaining: number; expired: () => void }) {
  const sent = useRef(false);
  useEffect(() => { if (remaining <= 0 && !sent.current) { sent.current = true; expired(); } }, [remaining, expired]);
  const seconds = Math.ceil(remaining / 1000);
  return <div className="hold-countdown"><span>YOUR TEMPORARY HOLD</span><p role="timer" aria-label="Hold time remaining">{remaining > 0 ? `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}` : 'Checking hold status…'}</p><small>{remaining > 0 ? 'Time remaining · server status is authoritative' : 'The deadline has passed. Refreshing the current reservation.'}</small></div>;
}
