import React, { memo, useMemo } from 'react';
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
  const isSpO2Display = label === "SPO2";

  // Helper function to check if blood pressure value is unrealistic
  const isBloodPressureUnrealistic = (bpString: string): boolean => {
    if (!isBloodPressure || bpString === "--/--" || bpString === "0/0") return false;
    
    const [systolic, diastolic] = bpString.split('/').map(Number);
    
    // Check for extreme values that indicate measurement problems
    if (isNaN(systolic) || isNaN(diastolic)) return true;
    
    // Ranges based on published medical guidelines
    // American Heart Association and European Society of Hypertension
    if (systolic > 300 || systolic < 60) return true;
    if (diastolic > 200 || diastolic < 30) return true;
    if (systolic <= diastolic) return true;
    
    return false;
  };

  // Cache para optimizar procesamiento de valores repetidos
  const displayValueCache = new Map<string, string | number>();
  
  // Process blood pressure display for stable, realistic readings
  const processedDisplayValue = useMemo(() => {
    const cacheKey = `${label}-${value}`;
    if (displayValueCache.has(cacheKey)) {
      return displayValueCache.get(cacheKey);
    }
    
    let result = value;
    if (isBloodPressure && typeof value === 'string') {
      // Always show placeholder values unchanged
      if (value === "--/--" || value === "0/0") {
        result = value;
      } else if (isBloodPressureUnrealistic(value)) {
        result = "--/--";
      }
    }
    
    displayValueCache.set(cacheKey, result);
    return result;
  }, [value, isBloodPressure, label]);

  const getRiskInfo = () => {
    if (isArrhythmiaDisplay) {
      return getArrhythmiaDisplay();
    }

    // For heart rate, show real value without checking risk if no measurement
    if (label === "FRECUENCIA CARDÍACA") {
      if (value === "--" || value === 0) {
        return { color: '#000000', label: '' };
      }
      if (typeof value === 'number') {
        return VitalSignsRisk.getBPMRisk(value, isFinalReading);
      }
    }

    // For SPO2, show real value without checking risk if no measurement
    if (isSpO2Display) {
      if (value === "--" || value === 0) {
        return { color: '#000000', label: '' };
      }
      if (typeof value === 'number') {
        return VitalSignsRisk.getSPO2Risk(value, isFinalReading);
      }
    }

    // For blood pressure, show real value without checking risk if no measurement
    if (isBloodPressure) {
      if (value === "--/--" || value === "0/0") {
        return { color: '#000000', label: '' };
      }
      
      // Don't try to evaluate risk if measurement is unstable/unrealistic
      if (typeof value === 'string' && !isBloodPressureUnrealistic(value)) {
        return VitalSignsRisk.getBPRisk(value, isFinalReading);
      }
      
      return { color: '#000000', label: '' };
    }

    return { color: '#000000', label: '' };
  };
  
  const getArrhythmiaDisplay = () => {
    if (!isArrhythmiaDisplay) return { text: value, color: "", label: "" };
    
    if (value === "--") {
      return { 
        text: "--", 
        color: "#000000",
        label: ""
      };
    }
    
    const [status, count] = String(value).split('|');
    
    if (status === "ARRITMIA DETECTADA") {
      return {
        text: count ? `LATIDOS PREMATUROS (${count})` : "LATIDOS PREMATUROS",
        color: "#DC2626",
        label: "PREMATUROS"
      };
    }
    
    return {
      text: "RITMO NORMAL",
      color: "#0EA5E9",
      label: "NORMAL"
    };
  };

  // Get the risk info based on the medically valid display value 
  const { text, color, label: riskLabel } = isArrhythmiaDisplay ? 
    getArrhythmiaDisplay() : 
    { text: processedDisplayValue, ...getRiskInfo() };

  // Simplificar el renderizado para mejorar rendimiento
  return (
    <div className="relative overflow-hidden rounded-xl bg-black shadow-lg">
      <div className="relative z-10 p-4">
        <h3 className="text-white text-xs font-medium tracking-wider mb-2">{label}</h3>
        <div className="flex flex-col items-center gap-1">
          <div className="flex items-baseline gap-1 justify-center">
            <span 
              className={`${isArrhythmiaDisplay ? 'text-base' : 'text-xl'} font-bold transition-colors duration-300 text-white`}
              style={{ color: color || '#000000' }}
            >
              {text}
            </span>
            {!isArrhythmiaDisplay && unit && (
              <span className="text-white text-xs">{unit}</span>
            )}
          </div>
          {riskLabel && (
            <span 
              className="text-[10px] font-semibold tracking-wider mt-1 text-white"
              style={{ color: color || '#000000' }}
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
