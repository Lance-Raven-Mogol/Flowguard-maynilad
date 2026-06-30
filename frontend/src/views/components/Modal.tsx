import { useEffect } from 'react';
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

export function Modal({ title, open, onClose, onSubmit, submitText = 'Submit', submitting, wide, closeText, children }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="modal-overlay is-active" onClick={onClose}>
      <div className={`modal-card${wide ? ' is-wide' : ''}`} onClick={(e) => e.stopPropagation()}>
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
