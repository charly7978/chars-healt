import React, { memo, useMemo } from 'react';
import { VitalSignsRisk } from '../utils/vitalSignsRisk';

interface VitalSignProps {
  label: string;
  value: string | number;
  unit?: string;
  isFinalReading?: boolean;
}

// Cache para resultados de riesgo
const riskCache = new Map<string, {color: string, label: string}>();
const arrhythmiaCache = new Map<string, {text: string, color: string, label: string}>();
const displayValueCache = new Map<string, string | number>();

// Helper functions fuera del componente para evitar recreaciones
const isBloodPressureUnrealistic = (bpString: string): boolean => {
  if (bpString === "--/--" || bpString === "0/0") return false;
  
  const [systolic, diastolic] = bpString.split('/').map(Number);
  
  if (isNaN(systolic) || isNaN(diastolic)) return true;
  if (systolic > 300 || systolic < 60) return true;
  if (diastolic > 200 || diastolic < 30) return true;
  if (systolic <= diastolic) return true;
  
  return false;
};

// Función para obtener la información de arritmia con caché
function getArrhythmiaDisplay(value: string | number) {
  // Usar caché para mejorar rendimiento
  const cacheKey = String(value);
  if (arrhythmiaCache.has(cacheKey)) {
    return arrhythmiaCache.get(cacheKey)!;
  }
  
  let result;
  if (value === "--") {
    result = { 
      text: "--", 
      color: "#FFFFFF",
      label: ""
    };
  } else {
    const [status, count] = String(value).split('|');
    
    if (status === "ARRITMIA DETECTADA") {
      result = {
        text: count ? `ARR (${count})` : "ARR",
        color: "#DC2626",
        label: "ARR"
      };
    } else {
      result = {
        text: "OK",
        color: "#0EA5E9",
        label: "OK"
      };
    }
  }
  
  arrhythmiaCache.set(cacheKey, result);
  return result;
}

const VitalSign: React.FC<VitalSignProps> = memo(({ label, value, unit, isFinalReading = false }) => {
  const isArrhythmiaDisplay = label === "ARRITMIAS";
  const isBloodPressure = label === "PRESIÓN ARTERIAL";
  const shortLabel = useMemo(() => {
    if (label === "FRECUENCIA CARDÍACA") return "FC";
    if (label === "PRESIÓN ARTERIAL") return "PA";
    if (label === "ARRITMIAS") return "ARR";
    if (label === "SPO2") return "SPO2";
    return label;
  }, [label]);

  // Process blood pressure display for stable, realistic readings
  const displayValue = useMemo(() => {
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

  const riskInfo = useMemo(() => {
    if (isArrhythmiaDisplay) {
      return getArrhythmiaDisplay(value);
    }

    // Usar caché para mejorar rendimiento
    const cacheKey = `${label}-${value}-${isFinalReading ? 1 : 0}`;
    if (riskCache.has(cacheKey)) {
      return riskCache.get(cacheKey)!;
    }

    let result = { color: '#FFFFFF', label: '' };

    // For heart rate
    if (label === "FRECUENCIA CARDÍACA") {
      if (value === "--" || value === 0) {
        result = { color: '#FFFFFF', label: '' };
      } else if (typeof value === 'number') {
        result = VitalSignsRisk.getBPMRisk(value, isFinalReading);
      }
    }
    // For SPO2
    else if (label === "SPO2") {
      if (value === "--" || value === 0) {
        result = { color: '#FFFFFF', label: '' };
      } else if (typeof value === 'number') {
        result = VitalSignsRisk.getSPO2Risk(value, isFinalReading);
      }
    }
    // For blood pressure
    else if (label === "PRESIÓN ARTERIAL") {
      if (value === "--/--" || value === "0/0") {
        result = { color: '#FFFFFF', label: '' };
      } else if (typeof value === 'string' && !isBloodPressureUnrealistic(value)) {
        result = VitalSignsRisk.getBPRisk(value, isFinalReading);
      }
    }

    riskCache.set(cacheKey, result);
    return result;
  }, [label, value, isArrhythmiaDisplay, isFinalReading]);
  
  const arrhythmiaDisplay = useMemo(() => {
    if (!isArrhythmiaDisplay) return { text: displayValue, color: "", label: "" };
    return getArrhythmiaDisplay(value);
  }, [displayValue, value, isArrhythmiaDisplay]);

  // Get the risk info based on the medically valid display value 
  const { text, color, label: riskLabel } = isArrhythmiaDisplay ? 
    arrhythmiaDisplay : 
    { text: displayValue, ...riskInfo };

  // Simplificar el renderizado para mejorar rendimiento
  return (
    <div className="relative overflow-hidden rounded-lg bg-black/60 border border-white/20 vital-sign-container hardware-accelerated">
      <div className="relative z-10 p-4">
        <h3 className="text-white text-xs font-medium mb-1">{shortLabel}</h3>
        <div className="flex flex-col items-center">
          <div className="flex items-baseline gap-1 justify-center">
            <span 
              className="text-base font-bold text-white text-optimized"
              style={{ color: color || '#FFFFFF' }}
            >
              {text}
            </span>
            {!isArrhythmiaDisplay && unit && (
              <span className="text-white text-xs text-optimized">{unit}</span>
            )}
          </div>
          {riskLabel && (
            <span 
              className="text-[9px] font-medium text-white text-optimized"
              style={{ color: color || '#FFFFFF' }}
            >
              {riskLabel}
            </span>
          )}
        </div>
      </div>
    </div>
  );
});

VitalSign.displayName = 'VitalSign';

export default VitalSign;
