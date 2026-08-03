import React, { useState } from 'react';
import { HelpCircle } from 'lucide-react';

interface AudioTooltipProps {
  label: string;
  description: string;
  children?: React.ReactNode;
}

export function AudioTooltip({ label, description, children }: AudioTooltipProps) {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <div className="relative inline-flex items-center gap-1 group">
      {children}
      <button
        type="button"
        onMouseEnter={() => setIsVisible(true)}
        onMouseLeave={() => setIsVisible(false)}
        onClick={() => setIsVisible(!isVisible)}
        className="text-gray-500 hover:text-amber-400 transition-colors p-0.5 rounded focus:outline-none"
        title="Parameter Explanation"
      >
        <HelpCircle size={10} />
      </button>

      {isVisible && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 w-48 p-2 bg-[#121217] border border-[#2d2d38] rounded-lg shadow-2xl z-50 text-[10px] text-gray-200 pointer-events-none leading-normal">
          <div className="font-bold text-amber-400 mb-0.5 uppercase font-mono">{label}</div>
          <div>{description}</div>
          <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-[#121217]" />
        </div>
      )}
    </div>
  );
}
