
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
  const isBloodPressure = label === "PRESIÓN ARTERIAL";

  // Helper function to check if blood pressure value is unrealistic
  const isBloodPressureUnrealistic = (bpString: string): boolean => {
    if (!isBloodPressure || bpString === "--/--" || bpString === "0/0") return false;
    
    const [systolic, diastolic] = bpString.split('/').map(Number);
    
    // Check for extreme values that indicate measurement problems
    // Note: These are not limits on the measurement, just display validation
    if (isNaN(systolic) || isNaN(diastolic)) return true;
    if (systolic > 300 || systolic < 60) return true; 
    if (diastolic > 200 || diastolic < 30) return true;
    if (systolic <= diastolic) return true;
    
    return false;
  };

  // Stabilize blood pressure display for unrealistic readings
  const getDisplayValue = (): string | number => {
    if (isBloodPressure && typeof value === 'string') {
      if (value === "--/--" || value === "0/0") return value;
      
      // If the reading is unrealistic, show "--/--" instead of flickering values
      if (isBloodPressureUnrealistic(value)) {
        return "--/--";
      }
    }
    
    return value;
  };

  const getRiskInfo = () => {
    if (isArrhythmiaDisplay) {
      return getArrhythmiaDisplay();
    }

    // Para frecuencia cardíaca, mostrar valor real sin comprobar riesgo si no hay medición
    if (label === "FRECUENCIA CARDÍACA") {
      if (value === "--" || value === 0) {
        return { color: '#FFFFFF', label: '' };
      }
      if (typeof value === 'number') {
        return VitalSignsRisk.getBPMRisk(value, isFinalReading);
      }
    }

    // Para SPO2, mostrar valor real sin comprobar riesgo si no hay medición
    if (label === "SPO2") {
      if (value === "--" || value === 0) {
        return { color: '#FFFFFF', label: '' };
      }
      if (typeof value === 'number') {
        return VitalSignsRisk.getSPO2Risk(value, isFinalReading);
      }
    }

    // Para presión arterial, mostrar valor real sin comprobar riesgo si no hay medición
    if (label === "PRESIÓN ARTERIAL") {
      if (value === "--/--" || value === "0/0") {
        return { color: '#FFFFFF', label: '' };
      }
      
      // No intentar evaluar el riesgo si la medición es inestable/irreal
      if (typeof value === 'string' && !isBloodPressureUnrealistic(value)) {
        return VitalSignsRisk.getBPRisk(value, isFinalReading);
      }
      
      return { color: '#FFFFFF', label: '' };
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
    
    return {
      text: "SIN ARRITMIA DETECTADA",
      color: "#0EA5E9",
      label: "NORMAL"
    };
  };

  const displayValue = getDisplayValue();
  const { text, color, label: riskLabel } = isArrhythmiaDisplay ? 
    getArrhythmiaDisplay() : 
    { text: displayValue, ...getRiskInfo() };

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
              {isArrhythmiaDisplay ? text : displayValue}
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
