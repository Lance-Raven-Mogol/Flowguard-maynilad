/**
 * BarangayCombobox — searchable barangay picker for all 6 municipalities
 * of Marinduque. Supports keyboard navigation, free-text typing, and
 * grouped display. Works in both auth (variant="auth") and dashboard
 * (variant="dashboard") contexts.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { MapPin, ChevronDown, X } from 'lucide-react';

export interface BarangayGroup {
  municipality: string;
  barangays: string[];
}

export const BARANGAYS: BarangayGroup[] = [
  { municipality: 'Boac', barangays: ['Agot','Agumaymayan','Amoingon','Apitong','Balagasan','Balaring','Balimbing','Balogo','Bamban','Bangbangalon','Bantad','Bantay','Bayuti','Binunga','Boi','Boton','Buliasnin','Bunganay','Caganhao','Canat','Catubugan','Cawit','Daig','Daypay','Duyay','Hinapulan','Ihatub','Isok I','Isok II Poblacion','Laylay','Lupac','Mahinhin','Mainit','Malbog','Maligaya','Malusak','Mansiwat','Mataas na Bayan','Maybo','Mercado','Murallon','Ogbac','Pawa','Pili','Poctoy','Poras','Puting Buhangin','Puyog','Sabong','San Miguel','Santol','Sawi','Tabi','Tabigue','Tagwak','Tambunan','Tampus','Tanza','Tugos','Tumagabok','Tumapon'] },
  { municipality: 'Buenavista', barangays: ['Bagacay','Bagtingon','Barangay I','Barangay II','Barangay III','Barangay IV','Bicas-bicas','Caigangan','Daykitin','Libas','Malbog','Sihi','Timbo','Tungib-Lipata','Yook'] },
  { municipality: 'Gasan', barangays: ['Antipolo','Bachao Ibaba','Bachao Ilaya','Bacongbacong','Bahi','Bangbang','Banot','Banuyo','Barangay I','Barangay II','Barangay III','Bognuyan','Cabugao','Dawis','Dili','Libtangin','Mahunig','Mangiliol','Masiga','Matandang Gasan','Pangi','Pingan','Tabionan','Tapuyan','Tiguion'] },
  { municipality: 'Mogpog', barangays: ['Anapog-Sibucao','Argao','Balanacan','Banto','Bintakay','Bocboc','Butansapa','Candahon','Capayang','Danao','Dulong Bayan','Gitnang Bayan','Guisian','Hinadharan','Hinanggayon','Ino','Janagdong','Lamesa','Laon','Magapua','Malayak','Malusak','Mampaitan','Mangyan-Mababad','Market Site','Mataas na Bayan','Mendez','Nangka I','Nangka II','Paye','Pili','Puting Buhangin','Sayao','Silangan','Sumangga','Tarug','Villa Mendez'] },
  { municipality: 'Santa Cruz', barangays: ['Alobo','Angas','Aturan','Bagong Silang Poblacion','Baguidbirin','Baliis','Balogo','Banahaw Poblacion','Bangcuangan','Banogbog','Biga','Botilao','Buyabod','Dating Bayan','Devilla','Dolores','Haguimit','Hupi','Ipil','Jolo','Kaganhao','Kalangkang','Kamandugan','Kasily','Kilo-kilo','Kiñaman','Labo','Lamesa','Landy','Lapu-lapu Poblacion','Libjo','Lipa','Lusok','Maharlika Poblacion','Makulapnit','Maniwaya','Manlibunan','Masaguisi','Masalukot','Matalaba','Mongpong','Morales','Napo','Pag-asa Poblacion','Pantayin','Polo','Pulong-Parang','Punong','San Antonio','San Isidro','Tagum','Tamayo','Tambangan','Tawiran','Taytay'] },
  { municipality: 'Torrijos', barangays: ['Bangwayin','Bayakbakin','Bolo','Bonliw','Buangan','Cabuyo','Cagpo','Dampulan','Kay Duke','Mabuhay','Makawayan','Malibago','Malinao','Maranlig','Marlangga','Matuyatuya','Nangka','Pakaskasan','Payanas','Poblacion','Poctoy','Sibuyao','Suha','Talawan','Tigwi'] },
];


interface BarangayComboboxProps {
  value: string;
  onChange: (value: string) => void;
  /** 'auth' uses the floating-label input-shell design; 'dashboard' uses the form-group design. */
  variant?: 'auth' | 'dashboard';
  id?: string;
}

export function BarangayCombobox({ value, onChange, variant = 'dashboard', id }: BarangayComboboxProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // The display text: show just the barangay name when a full "Brgy, Municipality" is selected.
  const displayValue = value
    ? value.includes(',') ? value.split(',')[0].trim() : value
    : '';

  /** Filter options by query — match barangay name or municipality. */
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return BARANGAYS;
    return BARANGAYS.map(({ municipality, barangays }) => ({
      municipality,
      barangays: barangays.filter(
        (b) =>
          b.toLowerCase().includes(q) ||
          municipality.toLowerCase().includes(q),
      ),
    })).filter(({ barangays }) => barangays.length > 0);
  }, [query]);

  /** Flat ordered list of all visible options for keyboard nav. */
  const flatFiltered = useMemo(
    () => filtered.flatMap(({ municipality, barangays }) =>
      barangays.map((b) => ({ label: b, value: `${b}, ${municipality}`, municipality })),
    ),
    [filtered],
  );

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlight < 0 || !listRef.current) return;
    const el = listRef.current.querySelector<HTMLLIElement>(`[data-idx="${highlight}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [highlight]);

  const pick = (optValue: string) => {
    onChange(optValue);
    setQuery('');
    setOpen(false);
    setHighlight(-1);
  };

  const clear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
    setQuery('');
    inputRef.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setHighlight((h) => Math.min(h + 1, flatFiltered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlight >= 0 && flatFiltered[highlight]) pick(flatFiltered[highlight].value);
    } else if (e.key === 'Escape') {
      setOpen(false);
      setQuery('');
    }
  };

  const inputPlaceholder = value ? displayValue : 'Type to search barangay…';

  // ── Auth variant (floating-label shell) ──────────────────────────────
  if (variant === 'auth') {
    return (
      <div className="brgy-wrap" ref={wrapRef}>
        <div
          className={`input-shell brgy-shell${open ? ' brgy-shell--open' : ''}`}
          onClick={() => { setOpen(true); inputRef.current?.focus(); }}
        >
          <label className="input-copy" htmlFor={id ?? 'barangay'}>
            <span className="input-label">Barangay</span>
            <div className="brgy-input-row">
              <input
                ref={inputRef}
                id={id ?? 'barangay'}
                type="text"
                autoComplete="off"
                placeholder={inputPlaceholder}
                value={open ? query : displayValue}
                onChange={(e) => { setQuery(e.target.value); setOpen(true); setHighlight(-1); }}
                onFocus={() => { setOpen(true); setQuery(''); }}
                onKeyDown={onKeyDown}
                aria-expanded={open}
                aria-autocomplete="list"
                aria-haspopup="listbox"
              />
              <div className="brgy-controls">
                {value && (
                  <button type="button" className="brgy-clear" onClick={clear} tabIndex={-1} aria-label="Clear">
                    <X size={13} />
                  </button>
                )}
                <ChevronDown size={15} className={`brgy-caret${open ? ' brgy-caret--open' : ''}`} />
              </div>
            </div>
          </label>
        </div>
        {open && (
          <DropdownList
            listRef={listRef}
            filtered={filtered}
            flatFiltered={flatFiltered}
            highlight={highlight}
            selected={value}
            query={query}
            onPick={pick}
            onHover={setHighlight}
          />
        )}
      </div>
    );
  }

  // ── Dashboard variant (form-group) ───────────────────────────────────
  return (
    <div className="brgy-wrap" ref={wrapRef}>
      <div
        className={`brgy-field${open ? ' brgy-field--open' : ''}`}
        onClick={() => { setOpen(true); inputRef.current?.focus(); }}
      >
        <MapPin size={14} className="brgy-field-icon" />
        <input
          ref={inputRef}
          id={id}
          type="text"
          autoComplete="off"
          placeholder="Type to search barangay…"
          value={open ? query : displayValue}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); setHighlight(-1); }}
          onFocus={() => { setOpen(true); setQuery(''); }}
          onKeyDown={onKeyDown}
          aria-expanded={open}
          aria-autocomplete="list"
          aria-haspopup="listbox"
        />
        <div className="brgy-controls">
          {value && (
            <button type="button" className="brgy-clear" onClick={clear} tabIndex={-1} aria-label="Clear">
              <X size={13} />
            </button>
          )}
          <ChevronDown size={14} className={`brgy-caret${open ? ' brgy-caret--open' : ''}`} />
        </div>
      </div>
      {open && (
        <DropdownList
          listRef={listRef}
          filtered={filtered}
          flatFiltered={flatFiltered}
          highlight={highlight}
          selected={value}
          query={query}
          onPick={pick}
          onHover={setHighlight}
        />
      )}
    </div>
  );
}

// ── Shared dropdown list ─────────────────────────────────────────────────────
function DropdownList({
  listRef,
  filtered,
  flatFiltered,
  highlight,
  selected,
  query,
  onPick,
  onHover,
}: {
  listRef: React.RefObject<HTMLUListElement>;
  filtered: BarangayGroup[];
  flatFiltered: { label: string; value: string; municipality: string }[];
  highlight: number;
  selected: string;
  query: string;
  onPick: (v: string) => void;
  onHover: (i: number) => void;
}) {
  // Build a global index map from (municipality, barangay) → flat index
  const indexMap = useMemo(() => {
    const m = new Map<string, number>();
    flatFiltered.forEach((o, i) => m.set(o.value, i));
    return m;
  }, [flatFiltered]);

  if (flatFiltered.length === 0) {
    return (
      <div className="brgy-dropdown">
        <p className="brgy-empty">Walang nahanap na barangay.</p>
      </div>
    );
  }

  return (
    <ul className="brgy-dropdown" role="listbox" ref={listRef}>
      {filtered.map(({ municipality, barangays }) => (
        <li key={municipality} className="brgy-group">
          <p className="brgy-group-label">{municipality}</p>
          <ul>
            {barangays.map((b) => {
              const val = `${b}, ${municipality}`;
              const idx = indexMap.get(val) ?? -1;
              const isSelected = selected === val;
              const isHighlighted = highlight === idx;
              return (
                <li
                  key={val}
                  role="option"
                  aria-selected={isSelected}
                  data-idx={idx}
                  className={`brgy-option${isSelected ? ' is-selected' : ''}${isHighlighted ? ' is-highlighted' : ''}`}
                  onMouseDown={(e) => { e.preventDefault(); onPick(val); }}
                  onMouseEnter={() => onHover(idx)}
                >
                  <span className="brgy-option-name">{highlightMatch(b, query)}</span>
                  {isSelected && <span className="brgy-option-check">✓</span>}
                </li>
              );
            })}
          </ul>
        </li>
      ))}
    </ul>
  );
}

/** Bold the matched portion of a barangay name. */
function highlightMatch(text: string, query: string) {
  if (!query.trim()) return <>{text}</>;
  const q = query.trim();
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <strong className="brgy-match">{text.slice(idx, idx + q.length)}</strong>
      {text.slice(idx + q.length)}
    </>
  );
}


/**
 * AddressInput — combines a Purok / Street / House No. text input with the
 * BarangayCombobox into a single grouped field. Emits and accepts a combined
 * string in the format "Purok 3, Mercado, Boac". When the value is empty the
 * fields start blank. The purok part is optional — if left blank the value is
 * just the barangay string.
 */
export interface AddressInputProps {
  value: string;
  onChange: (value: string) => void;
  variant?: 'auth' | 'dashboard';
}

/** Split a combined "Purok X, Brgy, Municipality" back into its parts. */
function splitAddress(combined: string): { purok: string; barangay: string } {
  if (!combined) return { purok: '', barangay: '' };
  // Find the first part that matches a known barangay value
  const knownBrgy = BARANGAYS.flatMap(({ municipality, barangays }) =>
    barangays.map((b) => `${b}, ${municipality}`),
  );
  for (const brgy of knownBrgy) {
    if (combined === brgy) return { purok: '', barangay: brgy };
    if (combined.endsWith(`, ${brgy}`)) {
      return { purok: combined.slice(0, combined.length - brgy.length - 2).trim(), barangay: brgy };
    }
  }
  // Fallback: treat the whole thing as purok (old format or free-text)
  return { purok: combined, barangay: '' };
}

/** Combine purok + barangay into one string. */
function joinAddress(purok: string, barangay: string): string {
  const p = purok.trim();
  const b = barangay.trim();
  if (p && b) return `${p}, ${b}`;
  return b || p;
}

export function AddressInput({ value, onChange, variant = 'dashboard' }: AddressInputProps) {
  const { purok: initPurok, barangay: initBrgy } = splitAddress(value);
  const [purok, setPurok] = useState(initPurok);
  const [barangay, setBarangay] = useState(initBrgy);

  // Sync back up if the parent changes value externally (e.g. auto-fill)
  const prevValue = useRef(value);
  useEffect(() => {
    if (value !== prevValue.current) {
      const { purok: p, barangay: b } = splitAddress(value);
      setPurok(p);
      setBarangay(b);
      prevValue.current = value;
    }
  }, [value]);

  const emit = (p: string, b: string) => {
    const combined = joinAddress(p, b);
    prevValue.current = combined;
    onChange(combined);
  };

  if (variant === 'auth') {
    return (
      <div className="address-input-wrap">
        <div className="input-shell address-purok-shell">
          <label className="input-copy" htmlFor="purok">
            <span className="input-label">Purok / Street / House No. <span className="address-optional">(optional)</span></span>
            <input
              id="purok"
              type="text"
              placeholder="e.g. Purok 3, Phase 2"
              autoComplete="off"
              value={purok}
              onChange={(e) => { setPurok(e.target.value); emit(e.target.value, barangay); }}
            />
          </label>
        </div>
        <BarangayCombobox
          id="barangay"
          value={barangay}
          onChange={(b) => { setBarangay(b); emit(purok, b); }}
          variant="auth"
        />
      </div>
    );
  }

  return (
    <div className="address-input-wrap">
      <input
        className="address-purok-input"
        type="text"
        placeholder="Purok / Street / House No. (optional)"
        autoComplete="off"
        value={purok}
        onChange={(e) => { setPurok(e.target.value); emit(e.target.value, barangay); }}
      />
      <BarangayCombobox
        value={barangay}
        onChange={(b) => { setBarangay(b); emit(purok, b); }}
        variant="dashboard"
      />
    </div>
  );
}
