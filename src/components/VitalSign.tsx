
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
    
    if (value === "--") {
      return { 
        text: "--/--", 
        color: "text-white" 
      };
    }
    
    const [status, count] = String(value).split('|');
    console.log('Procesando display de arritmias:', { status, count, value });
    
    if (status === "ARRITMIA DETECTADA") {
      return {
        text: count ? `ARRITMIA DETECTADA (${count})` : "ARRITMIA DETECTADA",
        color: "text-red-500"
      };
    }
    
    if (status === "CALIBRANDO...") {
      return {
        text: status,
        color: "text-yellow-500"
      };
    }
    
    return {
      text: "SIN ARRITMIA DETECTADA",
      color: "text-cyan-500"
    };
  };

  const { text, color } = getArrhythmiaDisplay();

  return (
    <div className="bg-black rounded-lg p-4">
      <div className="relative">
        <h3 className="text-gray-400/90 text-xs mb-2">{label}</h3>
        <div className="flex items-baseline gap-1 justify-center">
          <span 
            className={`${isArrhythmiaDisplay ? 'text-sm' : 'text-lg'} font-bold ${color || 'text-white'}`}
          >
            {text}
          </span>
          {!isArrhythmiaDisplay && unit && (
            <span className="text-gray-400 text-xs">{unit}</span>
          )}
        </div>
      </div>
    </div>
  );
};

export default VitalSign;
