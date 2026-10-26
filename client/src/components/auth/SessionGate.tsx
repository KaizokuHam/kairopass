import { Link } from 'react-router';
import { LoaderCircle, RefreshCw, WifiOff } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';

export function SessionGate() {
  const { status, refreshSession } = useAuth();
  const loading = status === 'INITIALIZING';
  return <section className="session-gate" aria-busy={loading}>
    <span className="gate-icon">{loading ? <LoaderCircle className="spin" size={27} /> : <WifiOff size={27} />}</span>
    <p className="eyebrow">{loading ? 'JUST A MOMENT' : 'A SMALL INTERRUPTION'}</p>
    <h1>{loading ? 'Getting your space ready.' : 'Let’s reconnect.'}</h1>
    <p role={loading ? 'status' : 'alert'}>{loading ? 'Checking your account before we let you in.' : 'We couldn’t verify your session. We haven’t changed it. Please try again.'}</p>
    {!loading && <div className="gate-actions"><Button onClick={() => void refreshSession()}><RefreshCw size={15} />Retry connection</Button><Link className="text-link" to="/">Back to overview</Link></div>}
  </section>;
}
