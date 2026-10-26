import type { ReactNode } from 'react';
import { ArrowUpRight, Sparkles } from 'lucide-react';

export function AuthLayout({ children }: { children: ReactNode }) {
  return <section className="auth-layout">
    <aside className="auth-story">
      <p className="eyebrow"><span className="eyebrow-line" />THE GOOD THINGS ARE AHEAD</p>
      <h1>Less scrolling.<br />More <span>showing up.</span></h1>
      <p>Your people. Your plans. One place to start.<br />Make a little room for your next chapter.</p>
      <div className="auth-art" aria-hidden="true"><div className="auth-art-orbit" /><div className="auth-art-pass"><span>KAIROPASS / YOUR NEXT CHAPTER <ArrowUpRight size={14} /></span><Sparkles size={38} strokeWidth={1} /><strong>Good things<br />start with<br /><em>a hello.</em></strong><small>CONNECTION IS THE DESTINATION.</small></div></div>
      <span className="auth-story-note">A LITTLE CLOSER TO BEING THERE.</span>
    </aside>
    <div className="auth-card">{children}</div>
  </section>;
}
