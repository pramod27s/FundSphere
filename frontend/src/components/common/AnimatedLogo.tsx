import { useState } from 'react';
import { motion } from 'framer-motion';

export interface AnimatedLogoProps {
  className?: string;
  textClassName?: string;
  showText?: boolean;
}

// ── Two independent elements, just like the screenshot ──────────────────────
// 1) RING   — a nearly-complete thin teal circle with a small gap on the
//             upper-right where the dot lives.
// 2) SWOOSH — a separate teal crescent that sweeps from the lower-left,
//             DOWN past the ring's bottom and UP toward the dot.

// Center 50,50. Perfect mathematical arcs and clipping paths. R=43.
// Ring starts at top right (-45 deg) and loops CCW down deep into the Swoosh belly (130 deg) so no caps protrude.
const RING = "M 79.3 20.7 A 41.5 41.5 0 1 0 23.3 81.8";

// Swoosh starts EXACTLY touching the Ring's inner border on the left (145 deg) allowing it
// to brilliantly thicken the arc without causing a blob protruding on the left side.
// Outer ring matches R=43 to the right tip at -15 deg.
const SWOOSH = "M 14.8 74.6 A 43 43 0 0 0 91.5 38.9 C 75 80, 45 85, 16.0 73.8 Z";

// Precise orbital dot nested exactly between the tips
const dot = { x: 89, y: 31.8 };

// Ascending sleek bars: Flat flat right vertical edge, sharp right corner, sweeping left curve.
// Bars are drawn straight down; an automated SVG Mask will slice a perfect gap under them!
const getBarPath = (x: number, w: number, topY: number, r: number) => {
  return `M ${x} 95
          L ${x + w} 95
          L ${x + w} ${topY}
          Q ${x} ${topY} ${x} ${topY + r}
          Z`;
};

// Precisely fitted bars
const BARS = [
  getBarPath(24, 13, 50, 14),
  getBarPath(43, 13, 36, 15),
  getBarPath(62, 13, 23, 13),
];

// Theme Colors
const THEME_TEAL = "#0d9488"; // standard tailwind teal-600
const THEME_NAVY = "#0f172a"; // standard tailwind slate-900

export default function AnimatedLogo({
  className     = 'w-10 h-10',
  textClassName = 'text-2xl',
  showText      = false,
}: AnimatedLogoProps) {
  const [ringDone, setRingDone] = useState(false);

  return (
    <div className="flex items-center gap-3">
      <div className={`relative shrink-0 overflow-visible ${className}`}>
        <svg viewBox="0 0 100 100" className="w-full h-full overflow-visible">

          <defs>
            <mask id="fs-bar-mask">
              <rect x="0" y="0" width="100" height="100" fill="white" />
              {/* Perfectly cleanly slices everything identical to the swoosh's inner curve, minus a beautifully even 1.5px vertical offset! */}
              <path d="M 110 110 L 110 30 L 93.0 38.5 C 75 80, 45 85, 16.0 73.8 L -10 73.8 L -10 110 Z" fill="black" transform="translate(0, -1.8)" />
            </mask>
          </defs>

          {/* ── 1) Bars - Nested beneath AND masked to smoothly curve above the swoosh ── */}
          <g mask="url(#fs-bar-mask)">
            {BARS.map((barPath, i) => (
              <motion.path
                key={i}
                d={barPath}
                fill={THEME_NAVY}
                style={{ transformOrigin: '50% 100%', transformBox: 'fill-box' }}
                initial={{ scaleY: 0, opacity: 0 }}
                animate={{ scaleY: 1, opacity: 1 }}
                transition={{
                  delay: 0.45 + i * 0.13,
                  duration: 0.5,
                  type: 'spring',
                  stiffness: 220,
                  damping: 16,
                }}
              />
            ))}
          </g>

          {/* ── 2) Main ring (thin stroke) ── */}
          <motion.path
            d={RING}
            fill="none"
            stroke={THEME_TEAL}
            strokeWidth="3"
            strokeLinecap="round"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 1.0, ease: 'easeInOut' }}
            onAnimationComplete={() => setRingDone(true)}
          />

          {/* ── 3) Swoosh (Crescent) - Razor sharp tips correctly restored ── */}
          <motion.path
            d={SWOOSH}
            fill={THEME_TEAL}
            initial={{ opacity: 0, scale: 0.9, y: 4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.7, ease: 'easeOut' }}
          />

          {/* ── 4) Dot at 2 o'clock with ripple ── */}
          {ringDone && (
            <>
              <motion.circle
                cx={dot.x}
                cy={dot.y}
                r={4.5}
                fill={THEME_TEAL}
                style={{ transformOrigin: 'center', transformBox: 'fill-box' }}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.45, type: 'spring', stiffness: 320, damping: 13 }}
              />
            </>
          )}
        </svg>
      </div>

      {showText && (
        <motion.div
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 1.1, duration: 0.45, ease: 'easeOut' }}
          className={`font-bold tracking-tight ${textClassName}`}
        >
          <span className="text-teal-600">Fund</span>
          <span className="text-brand-900">Sphere</span>
        </motion.div>
      )}
    </div>
  );
}
