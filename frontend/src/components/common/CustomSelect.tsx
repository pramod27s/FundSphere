import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Check } from 'lucide-react';

export interface SelectOption {
  value: string | number;
  label: string;
}

interface CustomSelectProps {
  value: string | number;
  onChange: (value: string | number) => void;
  options: SelectOption[];
  icon?: React.ReactNode;
  width?: string;
  size?: 'sm' | 'md';
}

export default function CustomSelect({
  value,
  onChange,
  options,
  icon,
  width = 'w-48',
  size = 'sm',
}: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((opt) => opt.value === value) || options[0];

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isOpen]);

  const isSmall = size === 'sm';

  return (
    <div className={`relative ${width}`} ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full flex items-center justify-between bg-white border border-brand-200/90 hover:border-primary-300 hover:bg-brand-50/60 font-semibold text-brand-700 transition-all shadow-2xs focus:outline-none focus:ring-2 focus:ring-primary-500/20 cursor-pointer ${
          isSmall
            ? 'h-7.5 px-2.5 py-1 text-xs rounded-lg'
            : 'h-9 px-3 py-2 text-sm rounded-xl'
        }`}
      >
        <div className="flex items-center gap-1.5 truncate">
          {icon && <span className="text-brand-400">{icon}</span>}
          <span className="truncate">{selectedOption.label}</span>
        </div>
        <motion.div
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.15, ease: 'easeInOut' }}
          className="text-brand-400 ml-1.5 shrink-0"
        >
          <ChevronDown className={isSmall ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
        </motion.div>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.12, ease: 'easeOut' }}
            className={`absolute z-50 w-full mt-1.5 bg-white border border-brand-200/90 shadow-lg shadow-brand-900/5 p-1 overflow-hidden ${
              isSmall ? 'rounded-lg' : 'rounded-xl'
            }`}
          >
            {options.map((option) => {
              const isSelected = option.value === value;
              return (
                <button
                  type="button"
                  key={option.value}
                  onClick={() => {
                    onChange(option.value);
                    setIsOpen(false);
                  }}
                  className={`w-full flex items-center justify-between text-left transition-colors cursor-pointer rounded-md ${
                    isSmall ? 'px-2.5 py-1.5 text-xs' : 'px-3.5 py-2 text-sm'
                  } ${
                    isSelected
                      ? 'bg-primary-50 text-primary-700 font-semibold'
                      : 'text-brand-600 hover:bg-brand-50 hover:text-brand-900'
                  }`}
                >
                  <span className="truncate">{option.label}</span>
                  {isSelected && (
                    <Check className={`${isSmall ? 'w-3 h-3' : 'w-3.5 h-3.5'} text-primary-600 shrink-0 ml-1.5`} />
                  )}
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
