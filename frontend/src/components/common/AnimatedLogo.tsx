import { useState } from 'react';
import { motion } from 'framer-motion';

export interface AnimatedLogoProps {
  className?: string;
  textClassName?: string;
  showText?: boolean;
}

// Equatorial ring (rx=44 ry=13): back half = top arc, front half = bottom arc
const EQ_BACK  = "M 6 50 A 44 13 0 0 1 94 50";
const EQ_FRONT = "M 6 50 A 44 13 0 0 0 94 50";

// Meridional ring (rx=13 ry=44): back half = left arc, front half = right arc
const MR_BACK  = "M 50 6 A 13 44 0 0 0 50 94";
const MR_FRONT = "M 50 6 A 13 44 0 0 1 50 94";

export default function AnimatedLogo({
  className     = "w-10 h-10",
  textClassName = "text-2xl",
  showText      = false,
}: AnimatedLogoProps) {
  const [dotsReady, setDotsReady] = useState(false);

  return (
    <div className="flex items-center gap-3">
      <div className={`relative shrink-0 overflow-visible ${className}`}>
        <svg viewBox="0 0 100 100" className="w-full h-full overflow-visible">
          <defs>
            {/* 3-D sphere gradient — highlight top-left */}
            <radialGradient id="fs-globe" cx="38%" cy="30%" r="65%">
              <stop offset="0%"   stopColor="#5eead4" />
              <stop offset="42%"  stopColor="#0d9488" />
              <stop offset="100%" stopColor="#061514" />
            </radialGradient>

            {/* Specular sheen */}
            <radialGradient id="fs-sheen" cx="30%" cy="24%" r="44%">
              <stop offset="0%"   stopColor="rgba(255,255,255,0.26)" />
              <stop offset="100%" stopColor="rgba(255,255,255,0)" />
            </radialGradient>

            {/* Glow for rings and dots */}
            <filter id="fs-glow" x="-60%" y="-60%" width="220%" height="220%">
              <feGaussianBlur stdDeviation="2" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>

            {/* Softer glow for secondary dot */}
            <filter id="fs-glow-sm" x="-80%" y="-80%" width="260%" height="260%">
              <feGaussianBlur stdDeviation="1.5" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>

            {/* Clip sphere surface lines */}
            <clipPath id="fs-clip">
              <circle cx="50" cy="50" r="35.5" />
            </clipPath>
          </defs>

          {/* ── Back arcs (rendered before sphere) ── */}

          {/* Equatorial ring — back */}
          <motion.path
            d={EQ_BACK}
            transform="rotate(-18, 50, 50)"
            fill="none" stroke="#2dd4bf" strokeWidth="2" strokeLinecap="round"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 0.28 }}
            transition={{ delay: 0.4, duration: 0.65, ease: "easeInOut" }}
          />

          {/* Meridional ring — back */}
          <motion.path
            d={MR_BACK}
            transform="rotate(22, 50, 50)"
            fill="none" stroke="#2dd4bf" strokeWidth="2" strokeLinecap="round"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 0.22 }}
            transition={{ delay: 0.48, duration: 0.65, ease: "easeInOut" }}
          />

          {/* ── Sphere ── */}
          <motion.circle
            cx="50" cy="50" r="36"
            fill="url(#fs-globe)"
            style={{ transformOrigin: "50px 50px" }}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.5, type: "spring", stiffness: 210, damping: 17 }}
          />

          {/* Meridian surface lines clipped to sphere */}
          <g clipPath="url(#fs-clip)">
            <motion.ellipse
              cx="50" cy="50" rx="17" ry="36"
              fill="none" stroke="#5eead4" strokeWidth="0.9"
              initial={{ opacity: 0 }} animate={{ opacity: 0.13 }}
              transition={{ delay: 0.55, duration: 0.5 }}
            />
            <motion.ellipse
              cx="50" cy="50" rx="36" ry="11"
              fill="none" stroke="#5eead4" strokeWidth="0.9"
              initial={{ opacity: 0 }} animate={{ opacity: 0.13 }}
              transition={{ delay: 0.6, duration: 0.5 }}
            />
          </g>

          {/* Sheen overlay */}
          <motion.circle
            cx="50" cy="50" r="36"
            fill="url(#fs-sheen)"
            style={{ pointerEvents: "none" }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.5 }}
          />

          {/* ── Front arcs + dots (rendered after sphere) ── */}

          {/* Equatorial ring — front */}
          <motion.path
            d={EQ_FRONT}
            transform="rotate(-18, 50, 50)"
            fill="none" stroke="#2dd4bf" strokeWidth="2.8" strokeLinecap="round"
            filter="url(#fs-glow)"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ delay: 0.72, duration: 0.7, ease: "easeInOut" }}
            onAnimationComplete={() => setDotsReady(true)}
          />

          {/* Meridional ring — front */}
          <motion.path
            d={MR_FRONT}
            transform="rotate(22, 50, 50)"
            fill="none" stroke="#2dd4bf" strokeWidth="2.2" strokeLinecap="round"
            filter="url(#fs-glow)"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 0.85 }}
            transition={{ delay: 0.82, duration: 0.7, ease: "easeInOut" }}
          />

          {/* ── Orbital dots (appear after rings animate in) ── */}
          {dotsReady && (
            <>
              {/* Equatorial dot — right tip (94, 50) rotated -18deg around center */}
              {/* Actual position: rotate(-18) of (94,50) → approx (92.5, 44.6) */}
              <g transform="rotate(-18, 50, 50)">
                <motion.circle
                  cx="94" cy="50" r="3.6"
                  fill="#5eead4"
                  filter="url(#fs-glow)"
                  style={{ transformOrigin: "94px 50px", transformBox: "fill-box" }}
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.35, type: "spring", stiffness: 320, damping: 14 }}
                />
                {/* Ripple */}
                <motion.circle
                  cx="94" cy="50" r="3.6"
                  fill="none" stroke="#5eead4" strokeWidth="1.5"
                  style={{ transformOrigin: "94px 50px", transformBox: "fill-box" }}
                  initial={{ scale: 1, opacity: 0.65 }}
                  animate={{ scale: 3.4, opacity: 0 }}
                  transition={{
                    delay: 0.5, duration: 1.5,
                    repeat: Infinity, repeatDelay: 1.2, ease: "easeOut",
                  }}
                />
              </g>

              {/* Meridional dot — top tip (50, 6) rotated 22deg around center */}
              <g transform="rotate(22, 50, 50)">
                <motion.circle
                  cx="50" cy="6" r="2.6"
                  fill="#5eead4"
                  filter="url(#fs-glow-sm)"
                  style={{ transformOrigin: "50px 6px", transformBox: "fill-box" }}
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 0.9 }}
                  transition={{ delay: 0.18, duration: 0.35, type: "spring", stiffness: 280, damping: 14 }}
                />
                {/* Soft ripple */}
                <motion.circle
                  cx="50" cy="6" r="2.6"
                  fill="none" stroke="#5eead4" strokeWidth="1"
                  style={{ transformOrigin: "50px 6px", transformBox: "fill-box" }}
                  initial={{ scale: 1, opacity: 0.5 }}
                  animate={{ scale: 3, opacity: 0 }}
                  transition={{
                    delay: 1.1, duration: 1.5,
                    repeat: Infinity, repeatDelay: 1.6, ease: "easeOut",
                  }}
                />
              </g>
            </>
          )}
        </svg>
      </div>

      {showText && (
        <motion.div
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 1.15, duration: 0.45, ease: "easeOut" }}
          className={`font-bold tracking-tight ${textClassName}`}
        >
          <span className="text-teal-600">Fund</span>
          <span className="text-brand-900">Sphere</span>
        </motion.div>
      )}
    </div>
  );
}
