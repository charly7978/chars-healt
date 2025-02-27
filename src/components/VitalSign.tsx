
import React from 'react';
import { VitalSignsRisk } from '../utils/vitalSignsRisk';

interface VitalSignProps {
  label: string;
  value: string | number;
  unit?: string;
}

const VitalSign: React.FC<VitalSignProps> = ({ label, value, unit }) => {
  const isArrhythmiaDisplay = label === "ARRITMIAS";

  const getValueColor = () => {
    if (isArrhythmiaDisplay) {
      return getArrhythmiaDisplay().color;
    }

    if (label === "FRECUENCIA CARDÍACA" && typeof value === 'number') {
      return VitalSignsRisk.getBPMRisk(value).color;
    }

    if (label === "SPO2" && typeof value === 'number') {
      return VitalSignsRisk.getSPO2Risk(value).color;
    }

    return '#FFFFFF';
  };
  
  const getArrhythmiaDisplay = () => {
    if (!isArrhythmiaDisplay) return { text: value, color: "" };
    
    if (value === "--") {
      return { 
        text: "--/--", 
        color: "#FFFFFF"
      };
    }
    
    const [status, count] = String(value).split('|');
    
    if (status === "ARRITMIA DETECTADA") {
      return {
        text: count ? `ARRITMIA DETECTADA (${count})` : "ARRITMIA DETECTADA",
        color: "#DC2626"
      };
    }
    
    if (status === "CALIBRANDO...") {
      return {
        text: status,
        color: "#F97316"
      };
    }
    
    return {
      text: "SIN ARRITMIA DETECTADA",
      color: "#0EA5E9"
    };
  };

  const { text, color } = getArrhythmiaDisplay();
  const valueColor = isArrhythmiaDisplay ? color : getValueColor();

  return (
    <div className="relative overflow-hidden group bg-gradient-to-br from-gray-800/30 to-gray-900/30 backdrop-blur-md rounded-lg p-4 transition-all duration-300 hover:from-gray-800/40 hover:to-gray-900/40">
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent animate-[progress_2s_ease-in-out_infinite] opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      <h3 className="text-gray-400/90 text-xs mb-2">{label}</h3>
      <div className="flex items-baseline gap-1 justify-center">
        <span 
          className={`${isArrhythmiaDisplay ? 'text-sm' : 'text-lg'} font-bold transition-colors duration-300`}
          style={{ color: valueColor }}
        >
          {isArrhythmiaDisplay ? text : value}
        </span>
        {!isArrhythmiaDisplay && unit && (
          <span className="text-gray-400/90 text-xs">{unit}</span>
        )}
      </div>
    </div>
  );
};

export default VitalSign;
