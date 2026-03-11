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
  return (
    <div className="flex items-center gap-3">
      <div className={`relative shrink-0 ${className}`}>

        {/* Stage 1: Glowing ring draws in behind the logo */}
        <svg
          viewBox="0 0 100 100"
          className="absolute inset-0 w-full h-full"
        >
          <defs>
            <linearGradient id="logoRingGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#3b82f6" />
              <stop offset="50%" stopColor="#8b5cf6" />
              <stop offset="100%" stopColor="#f59e0b" />
            </linearGradient>
          </defs>
          <motion.circle
            cx="50"
            cy="50"
            r="46"
            fill="none"
            stroke="url(#logoRingGrad)"
            strokeWidth="2"
            strokeLinecap="round"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: [0, 1, 1, 0] }}
            transition={{
              pathLength: { duration: 1, ease: "easeInOut" },
              opacity: { duration: 2, times: [0, 0.2, 0.7, 1] },
            }}
          />
        </svg>

        {/* Stage 2: Burst particles that fly out on logo reveal */}
        {[...Array(8)].map((_, i) => {
          const angle = (i / 8) * 360;
          const rad = (angle * Math.PI) / 180;
          const x = Math.cos(rad) * 35;
          const y = Math.sin(rad) * 35;
          return (
            <motion.div
              key={i}
              className="absolute left-1/2 top-1/2 w-1.5 h-1.5 rounded-full"
              style={{
                background: i % 2 === 0 ? '#3b82f6' : '#f59e0b',
                marginLeft: '-3px',
                marginTop: '-3px',
              }}
              initial={{ x: 0, y: 0, opacity: 0, scale: 0 }}
              animate={{
                x: [0, x, x],
                y: [0, y, y],
                opacity: [0, 1, 0],
                scale: [0, 1.5, 0],
              }}
              transition={{
                duration: 0.8,
                delay: 0.6,
                ease: "easeOut",
                times: [0, 0.5, 1],
              }}
            />
          );
        })}

        {/* Stage 3: The actual logo with spring scale-up */}
        <motion.div
          className="relative z-10 w-full h-full"
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{
            type: "spring",
            stiffness: 260,
            damping: 20,
            delay: 0.4,
          }}
        >
          {/* Stage 4: Continuous subtle float */}
          <motion.img
            src="/logo1.png"
            alt="FundSphere"
            className="w-full h-full object-contain drop-shadow-lg"
            animate={{
              y: [0, -3, 0, 3, 0],
            }}
            transition={{
              duration: 4,
              repeat: Infinity,
              ease: "easeInOut",
            }}
            draggable={false}
          />
        </motion.div>
      </div>

      {showText && (
        <motion.div
          initial={{ opacity: 0, x: -15 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 1, duration: 0.5, ease: "easeOut" }}
          className={`font-bold text-brand-900 tracking-tight ${textClassName}`}
        >
          Fund<span className="text-primary-600">Sphere</span>
        </motion.div>
      )}
    </div>
  );
}
