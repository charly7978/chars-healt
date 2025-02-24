
import React from 'react';

interface VitalSignProps {
  label: string;
  value: string | number;
  unit?: string;
}

const VitalSign: React.FC<VitalSignProps> = ({ label, value, unit }) => {
  const isArrhythmiaDisplay = label === "ARRITMIAS";
  
  const getArrhythmiaDisplay = () => {
    if (!isArrhythmiaDisplay) return { text: value, color: "" };
    
    const [status, count] = String(value).split('|');
    console.log('Procesando display de arritmias:', { status, count, value });
    
    if (status === "ARRITMIA DETECTADA") {
      return {
        text: count ? `ARRITMIAS: ${count}` : "ARRITMIA DETECTADA",
        color: "text-red-500"
      };
    }
    
    return {
      text: status === "CALIBRANDO..." ? status : `ARRITMIAS: ${count || '0'}`,
      color: status === "CALIBRANDO..." ? "text-yellow-500" : "text-cyan-500"
    };
  };

  const { text, color } = getArrhythmiaDisplay();

  return (
    <div className="relative overflow-hidden group bg-gradient-to-br from-gray-800/30 to-gray-900/30 backdrop-blur-md rounded-lg p-4">
      <h3 className="text-gray-400/90 text-xs mb-2">{label}</h3>
      <div className="flex items-baseline gap-1 justify-center">
        <span 
          className={`text-lg font-bold ${color || 'text-white'}`}
        >
          {text}
        </span>
        {!isArrhythmiaDisplay && unit && (
          <span className="text-gray-400/90 text-xs">{unit}</span>
        )}
      </div>
    </div>
  );
};

export default VitalSign;
