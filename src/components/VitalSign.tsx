
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
    <div className="relative overflow-hidden group bg-gradient-to-br from-gray-800/30 to-gray-900/30 backdrop-blur-md rounded-lg p-4 transition-all duration-300 hover:from-gray-800/40 hover:to-gray-900/40">
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent animate-[progress_2s_ease-in-out_infinite] opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      <h3 className="text-gray-400/90 text-xs mb-2">{label}</h3>
      <div className="flex items-baseline gap-1 justify-center">
        <span 
          className={`text-lg font-bold ${color || 'text-white'} transition-colors duration-300`}
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
