import React from 'react';
import { VitalSignsRisk } from '../utils/vitalSignsRisk';

interface VitalSignProps {
  label: string;
  value: string | number;
  unit?: string;
  isFinalReading?: boolean;
}

const VitalSign: React.FC<VitalSignProps> = ({ label, value, unit, isFinalReading = false }) => {
  const isArrhythmiaDisplay = label === "ARRITMIAS";

  const getRiskInfo = () => {
    if (isArrhythmiaDisplay) {
      return getArrhythmiaDisplay();
    }

    // Para frecuencia cardíaca, solo mostrar riesgo si hay un valor
    if (label === "FRECUENCIA CARDÍACA") {
      if (value === "--" || value === 0) {
        return { color: '#FFFFFF', label: '' };
      }
      if (typeof value === 'number') {
        return VitalSignsRisk.getBPMRisk(value, isFinalReading);
      }
    }

    // Para SPO2, solo mostrar riesgo si hay un valor
    if (label === "SPO2") {
      if (value === "--" || value === 0) {
        return { color: '#FFFFFF', label: '' };
      }
      if (typeof value === 'number') {
        return VitalSignsRisk.getSPO2Risk(value);
      }
    }

    // Para presión arterial
    if (label === "PRESIÓN ARTERIAL") {
      if (value === "--/--" || value === "0/0") {
        return { color: '#FFFFFF', label: '' };
      }
      if (typeof value === 'string') {
        return VitalSignsRisk.getBPRisk(value, isFinalReading);
      }
    }

    return { color: '#FFFFFF', label: '' };
  };
  
  const getArrhythmiaDisplay = () => {
    if (!isArrhythmiaDisplay) return { text: value, color: "", label: "" };
    
    if (value === "--") {
      return { 
        text: "--", 
        color: "#FFFFFF",
        label: ""
      };
    }
    
    const [status, count] = String(value).split('|');
    
    if (status === "ARRITMIA DETECTADA") {
      return {
        text: count ? `ARRITMIA DETECTADA (${count})` : "ARRITMIA DETECTADA",
        color: "#DC2626",
        label: "ARRITMIA"
      };
    }
    
    if (status === "CALIBRANDO...") {
      return {
        text: status,
        color: "#F97316",
        label: "CALIBRACIÓN"
      };
    }
    
    return {
      text: "SIN ARRITMIA DETECTADA",
      color: "#0EA5E9",
      label: "NORMAL"
    };
  };

  const { text, color, label: riskLabel } = isArrhythmiaDisplay ? 
    getArrhythmiaDisplay() : 
    { text: value, ...getRiskInfo() };

  return (
    <div className="relative overflow-hidden group bg-gradient-to-b from-slate-900/95 to-slate-950/90 rounded-lg p-4 border border-slate-800/50 shadow-lg backdrop-blur-sm transform transition-all duration-200 hover:scale-[1.02]">
      <div className="absolute inset-0 bg-gradient-to-t from-blue-500/5 to-transparent pointer-events-none" />
      
      <h3 className="text-gray-400 text-xs font-medium tracking-wider mb-2">{label}</h3>
      
      <div className="flex flex-col items-center gap-1">
        <div className="flex items-baseline gap-1 justify-center">
          <span 
            className={`${isArrhythmiaDisplay ? 'text-sm' : 'text-xl'} font-bold transition-colors duration-300`}
            style={{ color }}
          >
            {isArrhythmiaDisplay ? text : value}
          </span>
          {!isArrhythmiaDisplay && unit && (
            <span className="text-gray-500 text-xs font-medium">{unit}</span>
          )}
        </div>
        {riskLabel && (
          <span 
            className="text-[10px] font-medium tracking-wide transition-colors duration-300"
            style={{ color }}
          >
            {riskLabel}
          </span>
        )}
      </div>
    </div>
  );
};

export default VitalSign;
