
import React from 'react';

interface MeasurementControlsProps {
  isMonitoring: boolean;
  onStart: () => void;
  onReset: () => void;
}

const MeasurementControls: React.FC<MeasurementControlsProps> = ({
  isMonitoring,
  onStart,
  onReset
}) => {
  return (
    <div className="fixed bottom-0 left-0 right-0 w-full h-[55px] grid grid-cols-2 gap-px z-50">
      <button 
        onClick={onStart}
        className="w-full h-full text-xl font-bold text-white transition-colors duration-200"
        style={{ 
          backgroundImage: isMonitoring 
            ? 'linear-gradient(135deg, #f87171, #dc2626, #b91c1c)' 
            : 'linear-gradient(135deg, #3b82f6, #2563eb, #1d4ed8)',
          textShadow: '0px 1px 3px rgba(0, 0, 0, 0.3)'
        }}
      >
        {isMonitoring ? 'DETENER' : 'INICIAR'}
      </button>
      <button 
        onClick={onReset}
        className="w-full h-full text-xl font-bold text-white transition-colors duration-200"
        style={{ 
          backgroundImage: 'linear-gradient(135deg, #64748b, #475569, #334155)',
          textShadow: '0px 1px 3px rgba(0, 0, 0, 0.3)'
        }}
      >
        RESET
      </button>
    </div>
  );
};

export default MeasurementControls;
