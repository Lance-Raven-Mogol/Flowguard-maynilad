/**
 * Scan input for material QR labels and barcodes. Works three ways:
 *  - USB / Bluetooth barcode scanners (they type the code and press Enter),
 *  - typing a SKU by hand,
 *  - the device camera (QR codes and common 1D barcodes via html5-qrcode).
 */
import { useEffect, useId, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { Icon } from './Icon';

/** QR labels encode `<origin>/material/<SKU>`; barcodes carry the bare SKU. */
export function skuFromScan(text: string): string {
  const raw = text.trim();
  const match = raw.match(/\/material\/([^/?#]+)/i);
  return (match ? decodeURIComponent(match[1]) : raw).trim();
}

const FORMATS = [
  Html5QrcodeSupportedFormats.QR_CODE,
  Html5QrcodeSupportedFormats.CODE_128,
  Html5QrcodeSupportedFormats.CODE_39,
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.UPC_A,
];

export function ScanInput({ onScan, placeholder = 'Scan or type a SKU, then press Enter' }: {
  onScan: (sku: string) => void;
  placeholder?: string;
}) {
  const [value, setValue] = useState('');
  const [camera, setCamera] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;
  const regionId = `scan-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;

  useEffect(() => {
    if (!camera) return;
    const scanner = new Html5Qrcode(regionId, { formatsToSupport: FORMATS, verbose: false });
    let running = false;
    let done = false;
    const stop = () => {
      if (!running) return Promise.resolve();
      running = false;
      return scanner.stop().then(() => scanner.clear()).catch(() => undefined);
    };
    scanner
      .start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: (w, h) => { const size = Math.floor(Math.min(w, h) * 0.7); return { width: size, height: size }; } },
        (text) => {
          // One scan per camera session, so a label held in view isn't counted twice.
          if (done) return;
          done = true;
          void stop().then(() => setCamera(false));
          onScanRef.current(skuFromScan(text));
        },
        () => undefined,
      )
      .then(() => { running = true; if (done) void stop(); })
      .catch((err: unknown) => {
        setCameraError(err instanceof Error ? err.message : String(err ?? 'Camera unavailable.'));
        setCamera(false);
      });
    return () => { done = true; void stop(); };
  }, [camera, regionId]);

  const submit = () => {
    const sku = skuFromScan(value);
    if (!sku) return;
    setValue('');
    onScan(sku);
    inputRef.current?.focus();
  };

  return (
    <div className="scan-input">
      <div className="scan-input-row">
        <Icon name="scan-barcode" size={18} aria-hidden="true" />
        <input
          ref={inputRef}
          autoFocus
          value={value}
          placeholder={placeholder}
          aria-label="Scan or enter SKU"
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }}
        />
        <button type="button" className="btn-action" onClick={submit}>Find</button>
        <button
          type="button"
          className={camera ? 'btn-secondary' : 'btn-primary'}
          onClick={() => { setCameraError(null); setCamera((on) => !on); }}
        >
          <Icon name={camera ? 'x' : 'camera'} size={16} style={{ marginRight: 6 }} />
          {camera ? 'Stop Camera' : 'Use Camera'}
        </button>
      </div>
      {camera && <div id={regionId} className="scan-camera" />}
      {cameraError && (
        <small className="scan-error">
          Camera unavailable ({cameraError}). Allow camera access (HTTPS required), or use a USB scanner / type the SKU.
        </small>
      )}
    </div>
  );
}
