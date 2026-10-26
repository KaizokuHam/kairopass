import { useState } from 'react';
import { useNavigate } from 'react-router';
import { LoaderCircle, LogOut } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';

export function LogoutButton() {
  const auth = useAuth(); const navigate = useNavigate();
  const [error, setError] = useState(false);
  async function logout() {
    setError(false);
    try { await auth.logout(() => navigate('/', { replace: true })); }
    catch { setError(true); }
  }
  return <div className="logout-control"><Button variant="ghost" className="logout-button" disabled={auth.pendingAction !== null} onClick={() => void logout()}>
    {auth.pendingAction === 'logout' ? <LoaderCircle className="spin" size={15} /> : <LogOut size={15} />}<span>{auth.pendingAction === 'logout' ? 'Signing out…' : 'Sign out'}</span>
  </Button>{error && <span role="alert" className="field-error">Sign-out could not be confirmed. Retry your connection.</span>}</div>;
}
