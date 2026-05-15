import { useMemo, useState, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GLOSSARY, GLOSSARY_TERMS_BY_LENGTH, type GlossaryEntry } from '../../utils/glossary';

interface GlossaryTextProps {
  /** Plain text to scan. Acronyms found in glossary will be wrapped. */
  children: string | null | undefined;
  /** Render as `<p>` (default) or `<span>`. */
  as?: 'p' | 'span';
  className?: string;
}

/**
 * Renders text and auto-wraps any India-research acronym (UC, GFR, SERB,
 * UGC-CARE, …) with a hover tooltip explaining the term. Useful for
 * grant descriptions and eligibility text where users hit jargon they
 * may not know.
 *
 * Implementation: build one regex with all terms in length-descending
 * order so "UGC-CARE" wins over "UGC". Split the string on matches and
 * render each match as a <GlossaryTerm>. Pure render — re-runs on every
 * text change but the regex is memoised.
 */
export default function GlossaryText({ children, as = 'p', className }: GlossaryTextProps) {
  const text = children ?? '';

  const segments = useMemo(() => tokenize(text), [text]);
  const Tag = as;

  return (
    <Tag className={className}>
      {segments.map((seg, i) =>
        seg.kind === 'term' ? (
          <GlossaryTerm key={i} term={seg.match} entry={seg.entry} />
        ) : (
          <span key={i}>{seg.text}</span>
        ),
      )}
    </Tag>
  );
}

// =============================================================================
// Tokeniser
// =============================================================================

type Segment =
  | { kind: 'text'; text: string }
  | { kind: 'term'; match: string; entry: GlossaryEntry };

// Build one combined regex with word-boundary anchors. Escapes
// hyphens inside terms like "UGC-CARE" / "Co-PI" so they match literally.
const COMBINED_REGEX = (() => {
  const parts = GLOSSARY_TERMS_BY_LENGTH.map((t) =>
    t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
  );
  // \b doesn't play with hyphens at term boundaries, so emulate it with
  // negative look-arounds for word chars.
  return new RegExp(`(?<![A-Za-z0-9])(${parts.join('|')})(?![A-Za-z0-9])`, 'g');
})();

function tokenize(text: string): Segment[] {
  if (!text) return [];
  const segments: Segment[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(COMBINED_REGEX)) {
    const start = match.index ?? 0;
    if (start > lastIndex) {
      segments.push({ kind: 'text', text: text.slice(lastIndex, start) });
    }
    const word = match[0];
    segments.push({ kind: 'term', match: word, entry: GLOSSARY[word] });
    lastIndex = start + word.length;
  }
  if (lastIndex < text.length) {
    segments.push({ kind: 'text', text: text.slice(lastIndex) });
  }
  return segments;
}

// =============================================================================
// Per-term tooltip
// =============================================================================

interface GlossaryTermProps {
  term: string;
  entry: GlossaryEntry;
}

function GlossaryTerm({ term, entry }: GlossaryTermProps): ReactNode {
  const [open, setOpen] = useState(false);
  // Tap-to-toggle for touch devices; hover for pointer devices. Native
  // hover events fire on mobile-tap too, so we just rely on focus/blur
  // and mouseenter/leave together.
  return (
    <span className="relative inline-block">
      <button
        type="button"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={(e) => {
          e.preventDefault();
          setOpen((v) => !v);
        }}
        aria-label={`${term} — ${entry.full}. ${entry.definition}`}
        className="inline align-baseline underline decoration-dotted decoration-primary-400 decoration-2 underline-offset-2 hover:decoration-primary-600 hover:text-primary-700 focus:outline-none focus:text-primary-700 focus-visible:ring-2 focus-visible:ring-primary-300 rounded-sm cursor-help bg-transparent text-inherit p-0"
      >
        {term}
      </button>

      <AnimatePresence>
        {open && (
          <motion.span
            role="tooltip"
            initial={{ opacity: 0, y: 4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.98 }}
            transition={{ duration: 0.12, ease: 'easeOut' }}
            className="absolute z-50 left-1/2 -translate-x-1/2 mt-2 top-full w-72 max-w-[min(20rem,calc(100vw-2rem))] bg-brand-900 text-white rounded-lg shadow-xl shadow-brand-900/30 p-3 text-xs leading-relaxed pointer-events-none"
          >
            <span className="block font-bold text-primary-300 mb-1 tabular-nums">
              {term} <span className="text-brand-300 font-normal">— {entry.full}</span>
            </span>
            <span className="block text-brand-100">{entry.definition}</span>
            <span className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-brand-900 rotate-45 -z-10" />
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}
