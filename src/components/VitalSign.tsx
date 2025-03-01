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
  const isSpO2 = label === "SPO2";
  const isHeartRate = label === "FRECUENCIA CARDÍACA";

  // Helper function to check if blood pressure value is unrealistic
  const isBloodPressureUnrealistic = (bpString: string): boolean => {
    if (!isBloodPressure || bpString === "--/--" || bpString === "0/0" || bpString === "EVALUANDO") return false;
    
    const [systolic, diastolic] = bpString.split('/').map(Number);
    
    // Check for extreme values that indicate measurement problems
    if (isNaN(systolic) || isNaN(diastolic)) return true;
    
    // Ranges based on published medical guidelines
    // American Heart Association and European Society of Hypertension
    if (systolic > 300 || systolic < 30) return true;
    if (diastolic > 200 || diastolic < 15) return true;
    if (systolic <= diastolic) return true;
    
    return false;
  };

  // Process blood pressure display for stable, realistic readings
  const getDisplayValue = (): string | number => {
    if (isBloodPressure && typeof value === 'string') {
      // Always show placeholder values unchanged
      if (value === "--/--" || value === "0/0" || value === "EVALUANDO") return value;
      
      // Filter out clearly unrealistic readings
      if (isBloodPressureUnrealistic(value)) {
        console.log("Medically unrealistic BP filtered:", value);
        return "--/--";
      }
      
      // This is a valid reading within medical ranges
      return value;
    }
    
    // For SpO2, ensure we don't show 0 values
    if (isSpO2 && (value === 0 || value === "0")) {
      return "--";
    }
    
    // For heart rate, ensure we don't show 0 values
    if (isHeartRate && (value === 0 || value === "0")) {
      return "--";
    }
    
    return value;
  };

  const getRiskInfo = () => {
    if (isArrhythmiaDisplay) {
      return getArrhythmiaDisplay();
    }

    // For heart rate, show real value without checking risk if no measurement
    if (isHeartRate) {
      if (value === "--" || value === 0) {
        return { color: '#FFFFFF', label: '' };
      }
      if (typeof value === 'number') {
        return VitalSignsRisk.getBPMRisk(value, isFinalReading);
      }
    }

    // For SPO2, show real value without checking risk if no measurement
    if (isSpO2) {
      if (value === "--" || value === 0) {
        return { color: '#FFFFFF', label: '' };
      }
      if (typeof value === 'number') {
        return VitalSignsRisk.getSPO2Risk(value, isFinalReading);
      }
    }

    // For blood pressure, show real value without checking risk if no measurement
    if (isBloodPressure) {
      if (value === "--/--" || value === "0/0" || value === "EVALUANDO") {
        return { color: '#FFFFFF', label: '' };
      }
      
      // Don't try to evaluate risk if measurement is unstable/unrealistic
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

  // Get the medically valid display value
  const displayValue = getDisplayValue();
  
  // Get the risk info based on the medically valid display value 
  const { text, color, label: riskLabel } = isArrhythmiaDisplay ? 
    getArrhythmiaDisplay() : 
    { text: displayValue, ...getRiskInfo() };

  console.log(`[DISPLAY DEBUG] ${label}: Recibido=${value}, Mostrado=${displayValue}, Tipo=${typeof value}`);

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
