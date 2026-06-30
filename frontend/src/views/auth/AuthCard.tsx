/** Modern minimalist split-screen auth shell: a deep-blue brand panel beside a
 *  clean white form panel. Shared by the login and signup pages. */
import type { ReactNode } from 'react';
import { BarChart3, ShieldCheck, Waves } from 'lucide-react';
import logo from '../../assets/images/logo.png';

const HIGHLIGHTS = [
  { icon: BarChart3, text: 'Real-time analytics across every zone' },
  { icon: Waves, text: 'Track usage, billing & field operations' },
  { icon: ShieldCheck, text: 'Secure, role-based access control' },
];

export function AuthCard({ label, subtitle, children }: { label: string; subtitle: string; children: ReactNode }) {
  return (
    <main className="auth-shell">
      <aside className="auth-brand">
        <span className="auth-orb auth-orb-1" aria-hidden="true" />
        <span className="auth-orb auth-orb-2" aria-hidden="true" />
        <div className="auth-brand-top">
          <span className="auth-brand-logo">
            <img src={logo} alt="FlowGuard" />
          </span>
        </div>
        <div className="auth-brand-copy">
          <h2>Smart water utility management, simplified.</h2>
          <p>One intelligent workspace to monitor zones, resolve issues, and keep the city flowing.</p>
          <ul className="auth-highlights">
            {HIGHLIGHTS.map(({ icon: Icon, text }) => (
              <li key={text}>
                <span className="auth-highlight-icon">
                  <Icon size={16} strokeWidth={2.2} />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>
        <p className="auth-brand-foot">© {new Date().getFullYear()} FlowGuard · Maynilad</p>
      </aside>

      <section className="auth-panel" aria-label={label}>
        <div className="auth-form-wrap">
          <header className="auth-head">
            <span className="auth-logo-sm">
              <img src={logo} alt="FlowGuard" />
            </span>
            <h1>{label}</h1>
            <p>{subtitle}</p>
          </header>
          {children}
        </div>
      </section>
    </main>
  );
}
