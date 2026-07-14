/**
 * ToggleSwitch — a modern, accessible toggle switch component.
 * Used for boolean settings like OTP enable/disable.
 */
interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label?: string;
  description?: string;
}

export function ToggleSwitch({ checked, onChange, disabled = false, label, description }: ToggleSwitchProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0' }}>
      {(label || description) && (
        <div style={{ flex: 1, marginRight: 16 }}>
          {label && (
            <p style={{ fontSize: 14, fontWeight: 500, marginBottom: description ? 4 : 0, color: disabled ? 'var(--muted)' : 'inherit' }}>
              {label}
            </p>
          )}
          {description && (
            <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>
              {description}
            </p>
          )}
        </div>
      )}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        style={{
          position: 'relative',
          width: 48,
          height: 26,
          borderRadius: 13,
          border: 'none',
          cursor: disabled ? 'not-allowed' : 'pointer',
          background: checked
            ? 'linear-gradient(135deg, #16a34a, #22c55e)'
            : 'var(--line-strong)',
          boxShadow: checked
            ? '0 2px 8px rgba(22, 163, 74, 0.3)'
            : 'inset 0 1px 3px rgba(0, 0, 0, 0.1)',
          transition: 'all 0.25s ease',
          opacity: disabled ? 0.6 : 1,
          padding: 0,
          flexShrink: 0,
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: 3,
            left: checked ? 25 : 3,
            width: 20,
            height: 20,
            borderRadius: '50%',
            background: '#fff',
            boxShadow: '0 2px 4px rgba(0, 0, 0, 0.15)',
            transition: 'all 0.25s ease',
          }}
        />
      </button>
    </div>
  );
}
