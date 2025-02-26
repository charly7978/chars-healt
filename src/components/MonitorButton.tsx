
import React from 'react';

interface MonitorButtonProps {
  isMonitoring: boolean;
  onClick: () => void;
}

const MonitorButton = ({ isMonitoring, onClick }: MonitorButtonProps) => {
  return (
    <button 
      onClick={onClick}
      className={`w-full h-full text-2xl font-bold active:bg-gray-800 ${
        isMonitoring 
        ? 'bg-gradient-to-b from-red-600 to-red-700 text-white shadow-inner' 
        : 'bg-gradient-to-b from-blue-500 to-blue-600 text-white shadow-md'
      }`}
      style={{
        textShadow: '0 1px 2px rgba(0,0,0,0.2)',
        boxShadow: isMonitoring 
          ? 'inset 0 1px 3px rgba(0,0,0,0.3)' 
          : '0 1px 3px rgba(0,0,0,0.2)'
      }}
    >
      {isMonitoring ? 'DETENER' : 'INICIAR'}
    </button>
  );
};

export default MonitorButton;
