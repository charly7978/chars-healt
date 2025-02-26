
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
        text: "--", 
        color: "text-white" 
      };
    }
    
    const [status, count] = String(value).split('|');
    
    if (status === "ARRITMIA DETECTADA") {
      return {
        text: count ? `ARRITMIA (${count})` : "ARRITMIA",
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
      text: "NORMAL",
      color: "text-cyan-500"
    };
  };

  const { text, color } = getArrhythmiaDisplay();

  return (
    <div className="bg-black rounded-lg p-3 border border-gray-800">
      <h3 className="text-gray-300 text-xs font-medium mb-1">{label}</h3>
      <div className="flex items-baseline gap-1 justify-center">
        <span 
          className={`text-xl font-bold ${color || 'text-white'}`}
        >
          {text}
        </span>
        {!isArrhythmiaDisplay && unit && (
          <span className="text-gray-400 text-sm">{unit}</span>
        )}
      </div>
    </div>
  );
};

export default VitalSign;
