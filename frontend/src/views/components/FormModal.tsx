/**
 * Renders a modal from a ModalConfig, collects field values, and either
 * persists a record via the dashboard service (when the modal has an `action`)
 * or simply acknowledges with a toast.
 */
import { useMemo, useState } from 'react';
import type { ModalConfig } from '../../config/modals';
import type { TableRow } from '../../models/types';
import { dashboardService } from '../../services/dashboardService';
import { ApiError } from '../../services/apiClient';
import { useToast } from '../../controllers/ToastContext';
import { Modal } from './Modal';

interface FormModalProps {
  config: ModalConfig | null;
  onClose: () => void;
  onCreated?: (tableId: string, row: TableRow) => void;
}

export function FormModal({ config, onClose, onCreated }: FormModalProps) {
  const { notify } = useToast();
  const [submitting, setSubmitting] = useState(false);

  const initial = useMemo(() => {
    const v: Record<string, string> = {};
    config?.fields.forEach((f) => {
      v[f.name] = 'value' in f && f.value ? f.value : '';
    });
    return v;
  }, [config]);

  const [values, setValues] = useState<Record<string, string>>(initial);

  if (!config) return null;

  const set = (name: string, value: string) => setValues((p) => ({ ...p, [name]: value }));

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      if (config.action) {
        const { tableId, row } = await dashboardService.createRecord(config.action, values);
        onCreated?.(tableId, row);
      }
      notify(config.successMsg);
      onClose();
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Something went wrong.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal title={config.title} open onClose={onClose} onSubmit={handleSubmit} submitText={config.submitText} submitting={submitting}>
      {config.fields.map((f) => (
        <div className="form-group" key={f.name}>
          <label>{f.label}</label>
          {f.kind === 'textarea' ? (
            <textarea
              placeholder={f.placeholder}
              value={values[f.name] ?? ''}
              onChange={(e) => set(f.name, e.target.value)}
            />
          ) : f.kind === 'select' ? (
            <select value={values[f.name] ?? f.options[0]} onChange={(e) => set(f.name, e.target.value)}>
              {f.options.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          ) : (
            <input
              type={f.kind}
              placeholder={'placeholder' in f ? f.placeholder : undefined}
              readOnly={'readOnly' in f ? f.readOnly : undefined}
              value={values[f.name] ?? ''}
              onChange={(e) => set(f.name, e.target.value)}
            />
          )}
        </div>
      ))}
    </Modal>
  );
}
