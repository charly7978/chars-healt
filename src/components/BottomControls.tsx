
import React from 'react';

interface BottomControlsProps {
  startMonitoring: () => void;
  handleReset: () => void;
  permissionsGranted: boolean;
  isMonitoring: boolean;
}

const BottomControls: React.FC<BottomControlsProps> = ({
  startMonitoring,
  handleReset,
  permissionsGranted,
  isMonitoring
}) => {
  return (
    <div className="grid grid-cols-2 gap-px w-full h-full">
      <button 
        onClick={startMonitoring}
        className="w-full h-full text-xl font-bold text-white transition-colors duration-200"
        disabled={!permissionsGranted}
        style={{ 
          backgroundImage: !permissionsGranted 
            ? 'linear-gradient(135deg, #64748b, #475569, #334155)'
            : isMonitoring 
              ? 'linear-gradient(135deg, #f87171, #dc2626, #b91c1c)' 
              : 'linear-gradient(135deg, #3b82f6, #2563eb, #1d4ed8)',
          textShadow: '0px 1px 3px rgba(0, 0, 0, 0.3)',
          opacity: !permissionsGranted ? 0.7 : 1
        }}
      >
        {!permissionsGranted ? 'PERMISOS REQUERIDOS' : (isMonitoring ? 'DETENER' : 'INICIAR')}
      </button>
      <button 
        onClick={handleReset}
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

export default BottomControls;
