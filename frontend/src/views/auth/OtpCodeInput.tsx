/**
 * Shared pieces for the emailed 6-digit verification code: the digit boxes
 * and a "Resend code" link with a 60-second cooldown.
 */
import { useEffect, useRef, useState } from 'react';

export function OtpCodeInput({ value, onChange, align = 'center' }: {
  value: string;
  onChange: (code: string) => void;
  align?: 'center' | 'start';
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => { refs.current[0]?.focus(); }, []);

  return (
    <div className="otp-input-group" style={align === 'start' ? { justifyContent: 'flex-start' } : undefined}>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <input
          key={i}
          ref={(el) => { refs.current[i] = el; }}
          className="otp-digit"
          type="text"
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          aria-label={`Digit ${i + 1}`}
          maxLength={1}
          value={value[i] ?? ''}
          onChange={(e) => {
            const digit = e.target.value.replace(/\D/g, '').slice(-1);
            const chars = value.split('');
            chars[i] = digit;
            onChange(chars.join('').slice(0, 6));
            if (digit && i < 5) refs.current[i + 1]?.focus();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Backspace' && !value[i] && i > 0) refs.current[i - 1]?.focus();
          }}
          onPaste={(e) => {
            e.preventDefault();
            const pasted = (e.clipboardData.getData('text') ?? '').replace(/\D/g, '').slice(0, 6);
            onChange(pasted);
            refs.current[Math.min(pasted.length, 5)]?.focus();
          }}
        />
      ))}
    </div>
  );
}

const COOLDOWN_SECONDS = 60;

/**
 * "Resend code" link that is disabled for 60 s after each send. `onResend`
 * reports its own errors and returns whether a new code went out.
 */
export function ResendCodeButton({ onResend }: { onResend: () => Promise<boolean> }) {
  const [left, setLeft] = useState(COOLDOWN_SECONDS);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (left <= 0) return;
    const id = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [left]);

  if (left > 0) return <p className="otp-cooldown">Resend code in {left}s</p>;
  return (
    <button
      type="button"
      className="otp-link-btn"
      disabled={sending}
      onClick={async () => {
        setSending(true);
        try {
          if (await onResend()) setLeft(COOLDOWN_SECONDS);
        } finally {
          setSending(false);
        }
      }}
    >
      {sending ? 'Sending…' : 'Resend code'}
    </button>
  );
}
