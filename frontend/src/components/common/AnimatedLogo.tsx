import { motion } from 'framer-motion';

export interface AnimatedLogoProps {
  className?: string;
  textClassName?: string;
  showText?: boolean;
}

export default function AnimatedLogo({
  className = "w-12 h-12",
  textClassName = "text-2xl",
  showText = false,
}: AnimatedLogoProps) {
  return (
    <div className="flex items-center gap-3">
      <div className={`relative shrink-0 ${className}`}>
        {/*
          viewBox is wider than tall to match the reference's oval planet look.
          The "planet" is an ellipse centered at (110, 100) with rx=80, ry=75.
          Saturn-style rings wrap around it.
        */}
        <svg viewBox="0 0 220 200" className="w-full h-full overflow-visible">
          <defs>
            {/* Main globe gradient — deep teal with 3D highlight */}
            <radialGradient id="globeGrad" cx="36%" cy="30%" r="68%">
              <stop offset="0%"   stopColor="#5eead4" />
              <stop offset="35%"  stopColor="#0f766e" />
              <stop offset="100%" stopColor="#042f2e" />
            </radialGradient>

            {/* Subtle 3D sheen overlay */}
            <radialGradient id="sheenGrad" cx="32%" cy="26%" r="50%">
              <stop offset="0%"   stopColor="rgba(255,255,255,0.22)" />
              <stop offset="100%" stopColor="rgba(255,255,255,0)" />
            </radialGradient>

            {/* Shadow at base of sphere */}
            <radialGradient id="shadowGrad" cx="50%" cy="50%" r="50%">
              <stop offset="0%"   stopColor="rgba(0,0,0,0)" />
              <stop offset="100%" stopColor="rgba(0,0,0,0.45)" />
            </radialGradient>

            {/* Swoosh ring gradients */}
            <linearGradient id="ringFrontGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%"   stopColor="#0f766e"  stopOpacity="0.2" />
              <stop offset="30%"  stopColor="#2dd4bf"  stopOpacity="1" />
              <stop offset="70%"  stopColor="#2dd4bf"  stopOpacity="1" />
              <stop offset="100%" stopColor="#0f766e"  stopOpacity="0.2" />
            </linearGradient>

            <linearGradient id="ringBackGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%"   stopColor="#0f766e"  stopOpacity="0.15" />
              <stop offset="50%"  stopColor="#2dd4bf"  stopOpacity="0.6" />
              <stop offset="100%" stopColor="#0f766e"  stopOpacity="0.15" />
            </linearGradient>

            {/* Glow filter */}
            <filter id="glow" x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur stdDeviation="2.5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>

            {/* Soft glow filter for swoosh */}
            <filter id="swooshGlow" x="-20%" y="-40%" width="140%" height="180%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>

            {/* Clip to globe */}
            <clipPath id="globeClip">
              <ellipse cx="110" cy="100" rx="80" ry="75" />
            </clipPath>

            {/* Half-clip for left brain */}
            <clipPath id="leftHalf">
              <rect x="0" y="0" width="110" height="200" />
            </clipPath>

            {/* Half-clip for right chart */}
            <clipPath id="rightHalf">
              <rect x="110" y="0" width="110" height="200" />
            </clipPath>
          </defs>

          {/* ══ BACK RING (behind globe, top arc) ══ */}
          <motion.path
            d="M 36 82 C 55 48, 165 48, 184 82"
            fill="none"
            stroke="url(#ringBackGrad)"
            strokeWidth="9"
            strokeLinecap="round"
            filter="url(#swooshGlow)"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ delay: 1.6, duration: 0.9, ease: "easeInOut" }}
          />

          {/* ══ GLOBE BODY ══ */}
          <motion.g
            style={{ transformOrigin: "110px 100px" }}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.55, ease: [0.34, 1.56, 0.64, 1] }}
          >
            <ellipse cx="110" cy="100" rx="80" ry="75" fill="url(#globeGrad)" />
          </motion.g>

          {/* ══ GLOBE CONTENTS (clipped) ══ */}
          <g clipPath="url(#globeClip)">

            {/* Vertical centre divider */}
            <motion.line
              x1="110" y1="28" x2="110" y2="172"
              stroke="rgba(45,212,191,0.35)"
              strokeWidth="1.2"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ delay: 0.5, duration: 0.5 }}
            />

            {/* ── LEFT: Brain circuit ── */}
            {/* Main organic brain outline (left semi-circle + curves) */}
            {[
              /* Top branch */
              { d: "M 110 48 C 98 48, 86 44, 76 38", delay: 0.55 },
              /* Upper-mid external */
              { d: "M 110 65 C 92 65, 78 60, 66 68 C 58 74, 54 82, 48 82", delay: 0.65 },
              /* Centre branch */
              { d: "M 110 82 C 96 82, 82 80, 74 90 C 68 97, 64 108, 56 108", delay: 0.75 },
              /* Lower branch */
              { d: "M 110 100 C 94 100, 80 102, 70 112 C 62 120, 58 130, 52 132", delay: 0.85 },
              /* Bottom branch */
              { d: "M 110 122 C 98 122, 88 128, 80 136", delay: 0.95 },
            ].map(({ d, delay }, i) => (
              <motion.path
                key={`brain-${i}`}
                d={d}
                fill="none"
                stroke="#2dd4bf"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{ delay, duration: 0.55, ease: "easeOut" }}
              />
            ))}

            {/* Brain terminal nodes (end caps) */}
            {[
              { cx: 76,  cy: 38,  r: 4.5, delay: 1.10 },
              { cx: 48,  cy: 82,  r: 4.5, delay: 1.15 },
              { cx: 56,  cy: 108, r: 4,   delay: 1.20 },
              { cx: 52,  cy: 132, r: 4,   delay: 1.25 },
              { cx: 80,  cy: 136, r: 3.5, delay: 1.30 },
            ].map(({ cx, cy, r, delay }, i) => (
              <motion.g
                key={`bnode-${i}`}
                style={{ transformOrigin: `${cx}px ${cy}px` }}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: [0, 1.35, 1], opacity: 1 }}
                transition={{ delay, duration: 0.4, times: [0, 0.65, 1], ease: "easeOut" }}
              >
                <circle cx={cx} cy={cy} r={r} fill="#2dd4bf" filter="url(#glow)" />
                <circle cx={cx} cy={cy} r={r * 0.45} fill="white" opacity={0.7} />
              </motion.g>
            ))}

            {/* Junction dots along branches */}
            {[
              { cx: 92, cy: 45, delay: 1.05 },
              { cx: 78, cy: 63, delay: 1.10 },
              { cx: 82, cy: 84, delay: 1.12 },
              { cx: 76, cy: 104, delay: 1.14 },
              { cx: 90, cy: 124, delay: 1.18 },
            ].map(({ cx, cy, delay }, i) => (
              <motion.circle
                key={`junc-${i}`}
                cx={cx} cy={cy} r={2.2}
                fill="#5eead4"
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.85 }}
                transition={{ delay, duration: 0.3 }}
              />
            ))}

            {/* ── RIGHT: Bar chart ── */}
            {/* Baseline */}
            <motion.line
              x1="118" y1="148" x2="196" y2="148"
              stroke="rgba(255,255,255,0.3)"
              strokeWidth="1.5"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ delay: 0.65, duration: 0.4 }}
            />

            {/* Bars */}
            {[
              { x: 125, h: 28, delay: 0.75 },
              { x: 147, h: 46, delay: 0.90 },
              { x: 169, h: 66, delay: 1.05 },
            ].map(({ x, h, delay }, i) => (
              <motion.rect
                key={`bar-${i}`}
                x={x} y={148 - h}
                width={14} height={h}
                rx="2"
                fill={i === 2 ? "#2dd4bf" : "rgba(255,255,255,0.75)"}
                filter={i === 2 ? "url(#glow)" : undefined}
                style={{ transformOrigin: `${x + 7}px 148px` }}
                initial={{ scaleY: 0, opacity: 0 }}
                animate={{ scaleY: 1, opacity: 1 }}
                transition={{ delay, duration: 0.6, type: "spring", stiffness: 110, damping: 14 }}
              />
            ))}

            {/* Growth arrow diagonal */}
            <motion.path
              d="M 128 132 L 174 88"
              fill="none"
              stroke="white"
              strokeWidth="3"
              strokeLinecap="round"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 0.9 }}
              transition={{ delay: 1.3, duration: 0.65, ease: "easeOut" }}
            />
            {/* Arrow head */}
            <motion.g
              style={{ transformOrigin: "178px 84px" }}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 0.9 }}
              transition={{ delay: 1.9, duration: 0.25 }}
            >
              <polygon points="178,84 166,90 172,100" fill="white" />
            </motion.g>

          </g>

          {/* ══ 3D SHEEN overlay ══ */}
          <motion.ellipse
            cx="110" cy="100" rx="80" ry="75"
            fill="url(#sheenGrad)"
            style={{ pointerEvents: "none" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6, duration: 0.8 }}
          />

          {/* ══ FRONT RING (in front of globe, lower arc) ══ */}
          <motion.path
            d="M 26 118 C 48 165, 172 165, 194 118"
            fill="none"
            stroke="url(#ringFrontGrad)"
            strokeWidth="12"
            strokeLinecap="round"
            filter="url(#swooshGlow)"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ delay: 1.8, duration: 0.9, ease: "easeInOut" }}
          />

          {/* Ring accent line (inner shimmer) */}
          <motion.path
            d="M 34 113 C 56 157, 164 157, 186 113"
            fill="none"
            stroke="rgba(255,255,255,0.4)"
            strokeWidth="2"
            strokeLinecap="round"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ delay: 2.1, duration: 0.7, ease: "easeInOut" }}
          />

          {/* ══ PARTICLE DOTS around rings ══ */}
          {[
            { cx: 28,  cy: 108, r: 3,   delay: 2.0 },
            { cx: 19,  cy: 118, r: 2,   delay: 2.05 },
            { cx: 36,  cy: 80,  r: 2.5, delay: 2.1 },
            { cx: 196, cy: 108, r: 2.5, delay: 2.15 },
            { cx: 205, cy: 118, r: 1.8, delay: 2.2 },
            { cx: 185, cy: 76,  r: 2,   delay: 2.25 },
            { cx: 100, cy: 38,  r: 1.5, delay: 2.3 },
          ].map(({ cx, cy, r, delay }, i) => (
            <motion.g
              key={`pdot-${i}`}
              style={{ transformOrigin: `${cx}px ${cy}px` }}
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: [0, 0.9, 0.6], scale: 1 }}
              transition={{ delay, duration: 0.4 }}
            >
              <circle cx={cx} cy={cy} r={r} fill="#2dd4bf" filter="url(#glow)" />
            </motion.g>
          ))}

          {/* ══ IDLE: floating particle on front ring ══ */}
          <motion.g
            animate={{ x: [0, 8, 16, 24, 16, 8, 0], y: [0, -4, 2, 10, 16, 10, 0], opacity: [0, 1, 1, 1, 1, 1, 0] }}
            transition={{ delay: 2.8, duration: 4, repeat: Infinity, repeatDelay: 1, ease: "easeInOut" }}
          >
            <circle cx="34" cy="113" r="2.5" fill="#99f6e4" filter="url(#glow)" />
          </motion.g>

        </svg>
      </div>

      {showText && (
        <motion.div
          initial={{ opacity: 0, x: -14 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 1.8, duration: 0.6, ease: "easeOut" }}
          className={`font-bold tracking-tight ${textClassName}`}
        >
          <span className="text-teal-600">Fund</span>
          <span className="text-brand-900">Sphere</span>
        </motion.div>
      )}
    </div>
  );
}
