import { useState } from 'react';
import { motion } from 'framer-motion';

export interface AnimatedLogoProps {
  className?: string;
  textClassName?: string;
  showText?: boolean;
}

// Main ring arc (sweeps bottom-left to top-right)
const RING = "M 16 68 A 44 44 0 0 1 82 17";

// Bottom swoosh (crescent moon form)
const SWOOSH = "M 16 68 C 25 96, 75 98, 89 62 C 68 85, 35 82, 16 68 Z";

// Orbital Dot
const dot = { x: 88, y: 24 };

// Helper to draw precise custom ascending bars with sloped/rounded tops
const getBarPath = (x: number, w: number, bottom: number, h: number) => {
  const right = x + w;
  const topEdge = bottom - h;
  return `M ${x} ${bottom}
          L ${right} ${bottom}
          L ${right} ${topEdge}
          L ${x + 5} ${topEdge + 3}
          Q ${x} ${topEdge + 5} ${x} ${topEdge + 10}
          Z`;
};

const BARS = [
  getBarPath(26, 12, 74, 20),
  getBarPath(43, 12, 74, 34),
  getBarPath(60, 12, 74, 48),
];

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
            {/* Ring gradient: dark-teal lower-left → bright-teal upper-right */}
            <linearGradient
              id="fs-ring-grad"
              x1="16" y1="68" x2="88" y2="24"
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0%"   stopColor="#0f766e" />
              <stop offset="55%"  stopColor="#0d9488" />
              <stop offset="100%" stopColor="#2dd4bf" />
            </linearGradient>

            {/* Swoosh gradient: left → right */}
            <linearGradient
              id="fs-swoosh-grad"
              x1="16" y1="68" x2="89" y2="62"
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0%"   stopColor="#134e4a" />
              <stop offset="100%" stopColor="#0f766e" />
            </linearGradient>

            {/* Glow filter for dot */}
            <filter id="fs-dot-glow" x="-120%" y="-120%" width="340%" height="340%">
              <feGaussianBlur stdDeviation="2.2" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>

            {/* Drop shadow for swoosh */}
            <filter id="fs-swoosh-shadow" x="-20%" y="-60%" width="140%" height="220%">
              <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#0f766e" floodOpacity="0.35" />
            </filter>
          </defs>

          {/* ── Main ring arc ── */}
          <motion.path
            d={RING}
            fill="none"
            stroke="url(#fs-ring-grad)"
            strokeWidth="4.5"
            strokeLinecap="round"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 0.85, ease: 'easeInOut' }}
            onAnimationComplete={() => setRingDone(true)}
          />

          {/* ── Bars (grow up from bottom) ── */}
          {BARS.map((barPath, i) => (
            <motion.path
              key={i}
              d={barPath}
              fill="#0f172a"
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

          {/* ── Swoosh (rendered after bars so it sits on top) ── */}
          <motion.path
            d={SWOOSH}
            fill="url(#fs-swoosh-grad)"
            filter="url(#fs-swoosh-shadow)"
            style={{ transformOrigin: 'center', transformBox: 'fill-box' }}
            initial={{ opacity: 0, scale: 0.8, y: 5 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.7, ease: 'easeOut' }}
          />

          {/* ── Dot at 1 o'clock with ripple ── */}
          {ringDone && (
            <>
              <motion.circle
                cx={dot.x}
                cy={dot.y}
                r={5}
                fill="#14b8a6"
                filter="url(#fs-dot-glow)"
                style={{
                  transformOrigin: 'center',
                  transformBox: 'fill-box',
                }}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.38, type: 'spring', stiffness: 320, damping: 14 }}
              />
              {/* Ripple */}
              <motion.circle
                cx={dot.x}
                cy={dot.y}
                r={5}
                fill="none"
                stroke="#2dd4bf"
                strokeWidth="1.8"
                style={{
                  transformOrigin: 'center',
                  transformBox: 'fill-box',
                }}
                initial={{ scale: 1, opacity: 0.7 }}
                animate={{ scale: 3.6, opacity: 0 }}
                transition={{
                  delay: 0.4,
                  duration: 1.6,
                  repeat: Infinity,
                  repeatDelay: 1.1,
                  ease: 'easeOut',
                }}
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
