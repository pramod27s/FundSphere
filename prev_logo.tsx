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
    <div className={`flex items-center gap-3`}>
      <div className={`relative shrink-0 ${className}`}>
        <svg viewBox="0 0 120 120" className="w-full h-full drop-shadow-md">
          <defs>
            <linearGradient id="blueGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#3b82f6" />
              <stop offset="100%" stopColor="#1e3a8a" />
            </linearGradient>
            <linearGradient id="orangeGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#fbbf24" />
              <stop offset="100%" stopColor="#ea580c" />
            </linearGradient>
            <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#60a5fa" />
              <stop offset="50%" stopColor="#ffffff" />
              <stop offset="100%" stopColor="#f59e0b" />
            </linearGradient>
          </defs>

          {/* Left Brain Half */}
          <motion.path
            d="M 58 20 A 38 38 0 0 0 58 96 Z"
            fill="url(#blueGrad)"
            initial={{ x: -20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          />

          {/* Right Dollar Half */}
          <motion.path
            d="M 62 20 A 38 38 0 0 1 62 96 Z"
            fill="url(#orangeGrad)"
            initial={{ x: 20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          />

          {/* Circuit Nodes (Left) */}
          <motion.g
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8, duration: 0.6 }}
            stroke="white" strokeWidth="2" fill="white"
          >
            {/* Top node */}
            <circle cx="42" cy="40" r="3" />
            <path d="M 42 40 L 58 40" />
            
            {/* Middle node */}
            <circle cx="32" cy="58" r="4" />
            <path d="M 32 58 L 58 58" />
            
            {/* Bottom node */}
            <circle cx="42" cy="76" r="3" />
            <path d="M 42 76 L 48 76 L 54 70 L 58 70" fill="none"/>
          </motion.g>

          {/* Dollar Sign (Right) */}
          <motion.text
            x="81" y="70"
            fontSize="38"
            fontWeight="bold"
            fontFamily="sans-serif"
            fill="white"
            textAnchor="middle"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.8, type: "spring", stiffness: 200 }}
          >
            $
          </motion.text>

          {/* Orbit Ring Front */}
          <motion.path
            d="M 12 65 Q 60 110 108 50"
            fill="none"
            stroke="url(#ringGrad)"
            strokeWidth="5"
            strokeLinecap="round"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ delay: 0.5, duration: 1.2, ease: "easeInOut" }}
          />
          {/* Orbit Ring Back */}
          <motion.path
            d="M 12 65 Q 60 20 108 50"
            fill="none"
            stroke="url(#ringGrad)"
            strokeWidth="2"
            strokeDasharray="4 4"
            strokeLinecap="round"
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.4 }}
            transition={{ delay: 1.5, duration: 0.8, ease: "easeInOut" }}
          />
        </svg>
      </div>
      
      {showText && (
        <motion.div
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 1.2, duration: 0.5 }}
          className={`font-bold text-brand-900 tracking-tight ${textClassName}`}
        >
          Fund<span className="text-primary-600">Sphere</span>
        </motion.div>
      )}
    </div>
  );
}
