/** Shared login/signup card shell, including the interactive cursor glow that
 * the original vanilla build wired up by hand. */
import { useRef, type ReactNode } from 'react';
import logo from '../../assets/images/logo.png';

export function AuthCard({ label, subtitle, children }: { label: string; subtitle: string; children: ReactNode }) {
  const cardRef = useRef<HTMLElement>(null);

  const onPointerMove = (e: React.PointerEvent) => {
    const card = cardRef.current;
    if (!card) return;
    const b = card.getBoundingClientRect();
    const x = ((e.clientX - b.left) / b.width) * 100;
    const y = ((e.clientY - b.top) / b.height) * 100;
    card.style.setProperty('--glow-x', `${Math.max(0, Math.min(100, x))}%`);
    card.style.setProperty('--glow-y', `${Math.max(0, Math.min(100, y))}%`);
  };

  const onPointerLeave = () => {
    const card = cardRef.current;
    if (!card) return;
    card.style.setProperty('--glow-x', '50%');
    card.style.setProperty('--glow-y', '14%');
  };

  return (
    <main className="page-shell">
      <section className="login-card" aria-label={label} ref={cardRef} onPointerMove={onPointerMove} onPointerLeave={onPointerLeave}>
        <span className="card-grid" aria-hidden="true" />
        <span className="card-line" aria-hidden="true" />
        <span className="card-flare" aria-hidden="true" />
        <span className="interactive-glow" aria-hidden="true" />
        <header className="card-header">
          <div className="brand-mark">
            <img src={logo} alt="FlowGuard logo" width={544} height={242} />
          </div>
          <p>{subtitle}</p>
        </header>
        {children}
      </section>
    </main>
  );
}
