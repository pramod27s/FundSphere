// @ts-nocheck
import { motion } from 'framer-motion';

export interface AnimatedLogoProps {
  className?: string;
  textClassName?: string;
  showText?: boolean;
}

export default function AnimatedLogo({ 
  className = "w-12 h-12", 
  textClassName = "text-2xl",
  showText = false 
}: AnimatedLogoProps) {
  // Animation variants
  const brainPathVariant = {
    hidden: { pathLength: 0, opacity: 0 },
    visible: { pathLength: 1, opacity: 1, transition: { duration: 1.5, ease: "easeInOut" } }
  };

  const nodeVariant = {
    hidden: { scale: 0, opacity: 0 },
    visible: (customDelay: number) => ({
      scale: 1, 
      opacity: 1, 
      transition: { delay: customDelay, duration: 0.5, type: 'spring' } 
    })
  };

  const globeVariant = {
    hidden: { opacity: 0, scale: 0.8 },
    visible: { opacity: 1, scale: 1, transition: { duration: 1, ease: "easeOut" } }
  };
  
  const patternVariant = {
    hidden: { opacity: 0 },
    visible: { opacity: 0.5, transition: { delay: 0.8, duration: 1 } }
  };

  const barVariant = {
    hidden: { height: 0, y: 85 },
    visible: (custom: any) => ({
      height: custom.h,
      y: custom.y,
      transition: { delay: custom.delay, duration: 0.6, type: "spring", bounce: 0.3 }
    })
  };

  const arrowVariant = {
    hidden: { pathLength: 0, opacity: 0 },
    visible: { pathLength: 1, opacity: 1, transition: { delay: 1.2, duration: 1, ease: "easeOut" } }
  };

  const arrowHeadVariant = {
    hidden: { opacity: 0, scale: 0 },
    visible: { opacity: 1, scale: 1, transition: { delay: 2, duration: 0.3 } }
  };

  const orbitVariant = {
    hidden: { pathLength: 0, opacity: 0 },
    visible: (custom: any) => ({
      pathLength: 1,
      opacity: custom.opacity || 1,
      transition: { delay: custom.delay, duration: 1.5, ease: "easeInOut" }
    })
  };

  return (
    <div className={`flex items-center gap-3`}>
      <div className={`relative shrink-0 ${className}`}>
        <svg viewBox="0 0 120 120" className="w-full h-full drop-shadow-sm overflow-visible">
          <defs>
            <linearGradient id="globeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#115e59" />
              <stop offset="100%" stopColor="#042f2e" />
            </linearGradient>
            <linearGradient id="chartGrad" x1="0%" y1="100%" x2="0%" y2="0%">
              <stop offset="0%" stopColor="#14b8a6" />
              <stop offset="100%" stopColor="#2dd4bf" />
            </linearGradient>
            <pattern id="dotPattern" x="0" y="0" width="4" height="4" patternUnits="userSpaceOnUse">
              <circle cx="1" cy="1" r="0.75" fill="rgba(255,255,255,0.2)"/>
            </pattern>
          </defs>

          {/* Right Globe Group */}
          <motion.g initial="hidden" animate="visible" variants={globeVariant}>
            {/* Base solid background */}
            <path d="M 60 15 A 42 42 0 0 1 60 99 Z" fill="url(#globeGrad)" />
            {/* Dotted pattern overlay */}
            <motion.path d="M 60 15 A 42 42 0 0 1 60 99 Z" fill="url(#dotPattern)" variants={patternVariant} />
            
            {/* Chart Bars */}
            <motion.rect x="68" width="6" rx="1.5" fill="#ffffff" custom={{ y: 65, h: 20, delay: 0.6 }} variants={barVariant} />
            <motion.rect x="78" width="6" rx="1.5" fill="#ffffff" custom={{ y: 50, h: 35, delay: 0.8 }} variants={barVariant} />
            <motion.rect x="88" width="6" rx="1.5" fill="url(#chartGrad)" custom={{ y: 30, h: 55, delay: 1.0 }} variants={barVariant} />

            {/* Growth Arrow */}
            <motion.path 
              d="M 64 65 Q 80 50 93 28" 
              fill="none" 
              stroke="#ffffff" 
              strokeWidth="3.5" 
              strokeLinecap="round"
              variants={arrowVariant}
            />
            <motion.polygon 
              points="95,24 84,28 91,37" 
              fill="#ffffff" 
              variants={arrowHeadVariant}
            />
          </motion.g>

          {/* Left Brain Circuit Group */}
          <motion.g initial="hidden" animate="visible">
            {/* Main Brain Border */}
            <motion.path 
              d="M 58 15 L 58 99 M 58 15 C 45 15, 38 20, 36 28 C 28 28, 24 35, 24 42 C 16 45, 14 55, 18 65 C 12 70, 14 85, 26 90 C 32 98, 45 99, 58 99" 
              fill="none" 
              stroke="#0f766e" 
              strokeWidth="3" 
              strokeLinecap="round" 
              strokeLinejoin="round"
              variants={brainPathVariant}
            />
            
            {/* Circuit Lines */}
            {[
              "M 58 28 L 46 28 L 40 22",
              "M 58 42 L 40 42 L 34 48 L 28 48",
              "M 58 55 L 48 55 L 42 65 L 30 65",
              "M 58 75 L 45 75 L 40 82",
              "M 58 88 L 45 88 L 36 82"
            ].map((d, i) => (
              <motion.path 
                key={i}
                d={d} 
                fill="none" 
                stroke="#0f766e" 
                strokeWidth="2.5" 
                strokeLinejoin="round"
                variants={brainPathVariant}
              />
            ))}

            {/* Circuit Nodes */}
            {[
              { cx: 40, cy: 22, r: 3.5 },
              { cx: 28, cy: 48, r: 3.5 },
              { cx: 30, cy: 65, r: 3.5 },
              { cx: 40, cy: 82, r: 3.5 },
              { cx: 36, cy: 82, r: 3.5 },
              { cx: 46, cy: 28, r: 2.5 },
              { cx: 40, cy: 42, r: 2.5 },
              { cx: 48, cy: 55, r: 2.5 },
              { cx: 45, cy: 75, r: 2.5 },
              { cx: 45, cy: 88, r: 2.5 },
              { cx: 58, cy: 28, r: 2 },
              { cx: 58, cy: 42, r: 2 },
              { cx: 58, cy: 55, r: 2 },
              { cx: 58, cy: 75, r: 2 },
              { cx: 58, cy: 88, r: 2 },
            ].map((node, i) => (
              <motion.circle 
                key={`node-${i}`}
                cx={node.cx} 
                cy={node.cy} 
                r={node.r} 
                fill="#0f766e"
                variants={nodeVariant}
                custom={1 + i * 0.05}
                initial="hidden"
                animate="visible"
              />
            ))}
          </motion.g>

          {/* Orbits / Swooshes */}
          {/* Top thin swoosh */}
          <motion.path 
            d="M 25 40 C 40 -5, 90 0, 105 35" 
            fill="none" 
            stroke="#115e59" 
            strokeWidth="1.5" 
            strokeLinecap="round"
            initial="hidden"
            animate="visible"
            custom={{ delay: 1.5, opacity: 0.6 }}
            variants={orbitVariant}
          />
          {/* Main dynamic front swoosh */}
          <motion.path 
            d="M 12 65 C 30 120, 95 110, 118 45" 
            fill="none" 
            stroke="#14b8a6" 
            strokeWidth="3.5" 
            strokeLinecap="round"
            initial="hidden"
            animate="visible"
            custom={{ delay: 1.7 }}
            variants={orbitVariant}
          />
          {/* Secondary bright front swoosh */}
          <motion.path 
            d="M 18 70 C 40 115, 85 105, 112 55" 
            fill="none" 
            stroke="#2dd4bf" 
            strokeWidth="2" 
            strokeLinecap="round"
            initial="hidden"
            animate="visible"
            custom={{ delay: 1.9 }}
            variants={orbitVariant}
          />

          {/* Dynamic dots orbiting */}
          {[
            { cx: 12, cy: 65, r: 1.5, delay: 2.2 },
            { cx: 18, cy: 42, r: 1, delay: 2.3 },
            { cx: 118, cy: 45, r: 2, delay: 2.4 },
            { cx: 108, cy: 30, r: 1.5, delay: 2.5 },
          ].map((dot, i) => (
             <motion.circle 
                key={`orb-dot-${i}`}
                cx={dot.cx} 
                cy={dot.cy} 
                r={dot.r} 
                fill="#2dd4bf"
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1, transition: { delay: dot.delay, duration: 0.4 } }}
              />
          ))}

        </svg>
      </div>
      
      {showText && (
        <motion.div
           initial={{ opacity: 0, x: -10 }}
           animate={{ opacity: 1, x: 0 }}
           transition={{ delay: 2.0, duration: 0.5 }}
           className={`font-bold tracking-tight ${textClassName}`}
         >
           <span className="text-teal-600">Fund</span><span className="text-slate-800">Sphere</span>
         </motion.div>
      )}
    </div>
  );
}
