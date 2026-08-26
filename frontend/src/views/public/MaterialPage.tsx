/**
 * Public material info page — no login required.
 * Accessed via QR code scan: /material/:sku
 * Shows material details including current stock and supplier.
 */
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

const API_ROOT = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

interface MaterialInfo {
  sku: string;
  name: string;
  category: string;
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  supplier: string;
  source: string;
  status: string;
  min_level: number;
}

function stockLabel(status: string, qty: number): { text: string; color: string } {
  if (status === 'out_of_stock' || qty === 0) return { text: 'Out of Stock', color: '#e53e3e' };
  if (status === 'low_stock') return { text: 'Low Stock', color: '#d97706' };
  if (status === 'defective')  return { text: 'Defective',  color: '#6b7280' };
  return { text: 'In Stock', color: '#16a34a' };
}

export function MaterialPage() {
  const { sku } = useParams<{ sku: string }>();
  const [data, setData] = useState<MaterialInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!sku) return;
    fetch(`${API_ROOT}/api/material/${encodeURIComponent(sku)}`)
      .then((r) => {
        if (!r.ok) throw new Error('Material not found.');
        return r.json();
      })
      .then((body) => setData(body.data))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [sku]);

  return (
    <div className="mat-page">
      <header className="mat-header">
        <div className="mat-header-inner">
          <span className="mat-logo">💧 FlowGuard</span>
          <span className="mat-header-sub">Material Info</span>
        </div>
      </header>

      <main className="mat-main">
        {loading && (
          <div className="mat-state">
            <div className="mat-spinner" />
            <p>Loading…</p>
          </div>
        )}

        {error && !loading && (
          <div className="mat-state mat-error">
            <p className="mat-error-icon">⚠️</p>
            <p>{error}</p>
            <p className="mat-error-sku">SKU: {sku}</p>
          </div>
        )}

        {data && !loading && (() => {
          const stock = stockLabel(data.status, Number(data.quantity));
          return (
            <div className="mat-card">
              <div className="mat-card-top">
                <p className="mat-sku">{data.sku}</p>
                <h1 className="mat-name">{data.name}</h1>
                {data.category && <p className="mat-category">{data.category}</p>}
              </div>

              <div className="mat-divider" />

              <div className="mat-rows">
                <div className="mat-row">
                  <span className="mat-row-label">Stock</span>
                  <span className="mat-row-value mat-stock" style={{ color: stock.color }}>
                    {Number(data.quantity)} {data.unit} &mdash; <strong>{stock.text}</strong>
                  </span>
                </div>

                {data.supplier && (
                  <div className="mat-row">
                    <span className="mat-row-label">Supplier</span>
                    <span className="mat-row-value">{data.supplier}</span>
                  </div>
                )}

                {data.source && (
                  <div className="mat-row">
                    <span className="mat-row-label">Source</span>
                    <span className="mat-row-value">
                      {data.source === 'mother-company' ? 'Mother Company' : 'External Supplier'}
                    </span>
                  </div>
                )}

                {data.unit_price != null && Number(data.unit_price) > 0 && (
                  <div className="mat-row">
                    <span className="mat-row-label">Unit Price</span>
                    <span className="mat-row-value">
                      ₱{Number(data.unit_price).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                )}

                {data.description && (
                  <div className="mat-row mat-row-col">
                    <span className="mat-row-label">Description</span>
                    <span className="mat-row-value">{data.description}</span>
                  </div>
                )}
              </div>

              <p className="mat-footer-note">
                Maynilad‑Boac · FlowGuard Inventory System
              </p>
            </div>
          );
        })()}
      </main>
    </div>
  );
}
