
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

    // Para frecuencia cardíaca, no mostrar riesgo si no hay medición
    if (label === "FRECUENCIA CARDÍACA") {
      if (value === "--" || value === 0) {
        return { color: '#FFFFFF', label: '' };
      }
      if (typeof value === 'number') {
        return VitalSignsRisk.getBPMRisk(value, isFinalReading);
      }
    }

    // Para SPO2, no mostrar riesgo si no hay medición
    if (label === "SPO2") {
      if (value === "--" || value === 0) {
        return { color: '#FFFFFF', label: '' };
      }
      if (typeof value === 'number') {
        return VitalSignsRisk.getSPO2Risk(value, isFinalReading);
      }
    }

    // Para presión arterial, no mostrar riesgo si no hay medición
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
    
    // MODIFICADO: Ya no se maneja estado de calibración
    // Aún si el estado original es "CALIBRANDO...", mostraremos "SIN ARRITMIA DETECTADA"
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
    <div className="relative overflow-hidden rounded-xl backdrop-blur-md bg-black/60 border border-white/20 shadow-lg">
      <div className="absolute inset-0 bg-gradient-to-br from-blue-400/10 to-teal-400/10 pointer-events-none" />
      <div className="absolute inset-0 bg-black/40 pointer-events-none" style={{
        backgroundImage: "radial-gradient(circle at top right, rgba(0, 0, 0, 0.2), transparent 70%)"
      }} />
      <div className="relative z-10 p-4">
        <h3 className="text-white text-xs font-medium tracking-wider mb-2">{label}</h3>
        <div className="flex flex-col items-center gap-1">
          <div className="flex items-baseline gap-1 justify-center">
            <span 
              className={`${isArrhythmiaDisplay ? 'text-base' : 'text-xl'} font-bold transition-colors duration-300 text-white`}
              style={{ color: color || '#FFFFFF' }}
            >
              {isArrhythmiaDisplay ? text : value}
            </span>
            {!isArrhythmiaDisplay && unit && (
              <span className="text-white text-xs">{unit}</span>
            )}
          </div>
          {riskLabel && (
            <span 
              className="text-[10px] font-semibold tracking-wider mt-1 text-white"
              style={{ color: color || '#FFFFFF' }}
            >
              {riskLabel}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default VitalSign;
