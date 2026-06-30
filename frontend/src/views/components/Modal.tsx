import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  title: string;
  open: boolean;
  onClose: () => void;
  onSubmit?: () => void;
  submitText?: string;
  submitting?: boolean;
  /** Wider card for detail / view modals. */
  wide?: boolean;
  /** Label for the dismiss button (defaults to "Cancel", or "Close" when there's no submit action). */
  closeText?: string;
  children: React.ReactNode;
}

/* Body scroll lock shared across (possibly nested) modals. */
let lockCount = 0;
function lockScroll() {
  if (lockCount === 0) document.body.style.overflow = 'hidden';
  lockCount += 1;
}
function unlockScroll() {
  lockCount = Math.max(0, lockCount - 1);
  if (lockCount === 0) document.body.style.overflow = '';
}

export function Modal({ title, open, onClose, onSubmit, submitText = 'Submit', submitting, wide, closeText, children }: ModalProps) {
  // Only dismiss on a backdrop click that BOTH starts and ends on the overlay.
  // This prevents the modal from closing when you select text inside a field
  // and release the mouse outside the card (which would discard your input).
  const pressedOnBackdrop = useRef(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    lockScroll();
    return () => {
      window.removeEventListener('keydown', onKey);
      unlockScroll();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="modal-overlay is-active"
      onMouseDown={(e) => {
        pressedOnBackdrop.current = e.target === e.currentTarget;
      }}
      onMouseUp={(e) => {
        if (pressedOnBackdrop.current && e.target === e.currentTarget) onClose();
        pressedOnBackdrop.current = false;
      }}
    >
      <div className={`modal-card${wide ? ' is-wide' : ''}`}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>
            {closeText ?? (onSubmit ? 'Cancel' : 'Close')}
          </button>
          {onSubmit && (
            <button className="btn-primary" onClick={onSubmit} disabled={submitting}>
              {submitting ? 'Processing…' : submitText}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
