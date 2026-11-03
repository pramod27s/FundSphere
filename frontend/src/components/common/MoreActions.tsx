import { useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { ROW_ACTION } from './buttonStyles';

export interface MenuItem {
  label: string;
  onSelect: () => void;
  danger?: boolean;
}

/**
 * A row's less common actions behind a "⋯" button, so each row shows only
 * what's usually needed. Sits at the right end of the row and opens
 * leftwards, so it stays on screen wherever the row wraps.
 */
export default function MoreActions({ label, items, disabled }: { label: string; items: MenuItem[]; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  if (items.length === 0) return null;
  return (
    <div
      className="relative ml-auto"
      onKeyDown={(e) => {
        if (e.key === 'Escape') setOpen(false);
      }}
    >
      <button
        type="button"
        className={ROW_ACTION.icon}
        aria-label={label}
        title="More actions"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>
      {open && (
        <>
          <button type="button" aria-label="Close menu" tabIndex={-1} className="fixed inset-0 z-10 cursor-default" onClick={() => setOpen(false)} />
          <div role="menu" className="absolute z-20 right-0 mt-1 w-44 bg-white border border-brand-200 rounded-lg shadow-lg overflow-hidden py-1">
            {items.map((item) => (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  item.onSelect();
                }}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-brand-50 ${item.danger ? 'text-red-700' : 'text-brand-800'}`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
