
import React, { memo, useMemo, useState } from 'react';
import { VitalSignsRisk } from '../utils/vitalSignsRisk';
import VitalSignDetail from './VitalSignDetail';

interface VitalSignProps {
  label: string;
  value: string | number;
  unit?: string;
  isFinalReading?: boolean;
}

const VitalSign: React.FC<VitalSignProps> = ({ label, value, unit, isFinalReading = false }) => {
  const [showDetail, setShowDetail] = useState(false);
  const isArrhythmiaDisplay = label === "ARRITMIAS";
  const isBloodPressure = label === "PRESIÓN ARTERIAL";

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
    if (label === "SPO2") {
      if (value === "--" || value === 0) {
        return { color: '#000000', label: '' };
      }
      if (typeof value === 'number') {
        return VitalSignsRisk.getSPO2Risk(value, isFinalReading);
      }
    }

    // For blood pressure, show real value without checking risk if no measurement
    if (label === "PRESIÓN ARTERIAL") {
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
  
  const getArrhythmiaRiskColor = (count: number): string => {
    // Colors for different risk levels
    if (count <= 0) return "#000000"; // No risk
    if (count <= 3) return "#F2FCE2"; // Minimal risk - Soft Green
    if (count <= 6) return "#FEC6A1"; // Low risk - Soft Orange
    if (count <= 8) return "#F97316"; // Moderate risk - Bright Orange
    return "#DC2626";                 // High risk - Red
  };
  
  const getArrhythmiaRiskLabel = (count: number): string => {
    // Updated thresholds based on user requirements:
    // - 1-3 arrhythmias: minimal risk
    // - 4-6 arrhythmias: low risk
    // - 6-8 arrhythmias: moderate risk
    // - More than 8 arrhythmias: high risk
    
    if (count <= 0) return "";
    if (count <= 3) return "RIESGO MÍNIMO";
    if (count <= 6) return "RIESGO BAJO";
    if (count <= 8) return "RIESGO MODERADO";
    return "RIESGO ALTO";
  };
  
  const getArrhythmiaDisplay = () => {
    if (!isArrhythmiaDisplay) return { text: value, color: "", label: "" };
    
    if (value === "--") {
      return { 
        text: "",  // Removed "ARRITMIA" text display before starting measurements
        color: "#FFFFFF",
        label: ""
      };
    }
    
    const [status, countStr] = String(value).split('|');
    const count = parseInt(countStr || "0", 10);
    
    if (status === "ARRITMIA DETECTADA") {
      // Determine risk level based on count
      const riskLabel = getArrhythmiaRiskLabel(count);
      const riskColor = getArrhythmiaRiskColor(count);
      
      return {
        text: `${count}`,
        title: "ARRITMIA DETECTADA",
        color: riskColor,
        label: riskLabel
      };
    }
    
    return {
      text: "LATIDO NORMAL",
      color: "#0EA5E9",
      label: ""
    };
  };

  // Get the risk info based on the medically valid display value 
  const { text, title, color, label: riskLabel } = isArrhythmiaDisplay ? 
    getArrhythmiaDisplay() : 
    { text: processedDisplayValue, title: undefined, ...getRiskInfo() };

  const handleCardClick = () => {
    // Solo permitir clic si hay una medición válida y es una lectura final
    if (
      (value === "--" || value === 0 || value === "--/--" || value === "0/0") ||
      !isFinalReading
    ) {
      return;
    }
    
    setShowDetail(true);
  };

  // Determinar el tipo de signo vital para la vista detallada
  const getVitalSignType = () => {
    if (label === "FRECUENCIA CARDÍACA") return "heartRate";
    if (label === "SPO2") return "spo2";
    if (label === "PRESIÓN ARTERIAL") return "bloodPressure";
    if (label === "ARRITMIAS") return "arrhythmia";
    return "heartRate"; // Default
  };

  // Simplificar el renderizado para mejorar rendimiento
  return (
    <>
      <div 
        className={`relative overflow-hidden rounded-xl bg-black shadow-lg ${
          isFinalReading ? 'active:scale-95 transition-transform cursor-pointer' : ''
        }`}
        onClick={isFinalReading ? handleCardClick : undefined}
      >
        <div className="relative z-10 p-4">
          <h3 className="text-white text-xs font-medium tracking-wider mb-2">{label}</h3>
          <div className="flex flex-col items-center gap-1">
            {isArrhythmiaDisplay && title && (
              <span className="text-base font-bold tracking-wider" style={{ color: color || '#FFFFFF' }}>
                {title}
              </span>
            )}
            <div className="flex items-baseline gap-1 justify-center">
              <span 
                className={`${isArrhythmiaDisplay ? 'text-lg' : 'text-xl'} font-bold transition-colors duration-300 text-white`}
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

        {isFinalReading && (
          <div className="absolute inset-0 bg-white/5 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="bg-white/10 rounded-full p-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white/70">
                  <path d="M9 18l6-6-6-6"/>
                </svg>
              </div>
            </div>
          </div>
        )}
      </div>

      {showDetail && (
        <VitalSignDetail
          title={label}
          value={text as string | number}
          unit={unit}
          riskLevel={riskLabel}
          type={getVitalSignType()}
          onBack={() => setShowDetail(false)}
        />
      )}
    </>
  );
};

export default memo(VitalSign);
