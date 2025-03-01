
import React, { memo, useMemo } from 'react';
import { VitalSignsRisk } from '../utils/vitalSignsRisk';

interface VitalSignProps {
  label: string;
  value: string | number;
  unit?: string;
  isFinalReading?: boolean;
}

const VitalSign: React.FC<VitalSignProps> = memo(({ label, value, unit, isFinalReading = false }) => {
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

  // Process blood pressure display for stable, realistic readings
  const getDisplayValue = (): string | number => {
    if (isBloodPressure && typeof value === 'string') {
      // Always show placeholder values unchanged
      if (value === "--/--" || value === "0/0") return value;
      
      // Filter out clearly unrealistic readings
      if (isBloodPressureUnrealistic(value)) {
        console.log("Medically unrealistic BP filtered:", value);
        return "--/--";
      }
      
      // This is a valid reading within medical ranges
      return value;
    }
    
    return value;
  };

  // Function to handle arrhythmia display - defined before it's used in riskInfo
  const getArrhythmiaDisplay = () => {
    if (!isArrhythmiaDisplay) return { text: value, color: "", label: "" };
    
    if (value === "--") {
      return { 
        text: "--", 
        color: "#D3E4FD",
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

  // Memoized risk information calculation to optimize rendering
  const riskInfo = useMemo(() => {
    if (isArrhythmiaDisplay) {
      return getArrhythmiaDisplay();
    }

    // For heart rate, show real value without checking risk if no measurement
    if (label === "FRECUENCIA CARDÍACA") {
      if (value === "--" || value === 0) {
        return { color: '#D3E4FD', label: '' };
      }
      if (typeof value === 'number') {
        return VitalSignsRisk.getBPMRisk(value, isFinalReading);
      }
    }

    // For SPO2, show real value without checking risk if no measurement
    if (label === "SPO2") {
      if (value === "--" || value === 0) {
        return { color: '#D3E4FD', label: '' };
      }
      if (typeof value === 'number') {
        return VitalSignsRisk.getSPO2Risk(value, isFinalReading);
      }
    }

    // For blood pressure, show real value without checking risk if no measurement
    if (label === "PRESIÓN ARTERIAL") {
      if (value === "--/--" || value === "0/0") {
        return { color: '#D3E4FD', label: '' };
      }
      
      // Don't try to evaluate risk if measurement is unstable/unrealistic
      if (typeof value === 'string' && !isBloodPressureUnrealistic(value)) {
        return VitalSignsRisk.getBPRisk(value, isFinalReading);
      }
      
      return { color: '#D3E4FD', label: '' };
    }

    return { color: '#D3E4FD', label: '' };
  }, [label, value, isArrhythmiaDisplay, isBloodPressure, isFinalReading]);
  
  // Memoized display value calculation to optimize rendering
  const displayValue = useMemo(() => getDisplayValue(), [value, isBloodPressure]);
  
  // Get the risk info based on the medically valid display value 
  const { text, color, label: riskLabel } = isArrhythmiaDisplay ? 
    getArrhythmiaDisplay() : 
    { text: displayValue, ...riskInfo };

  return (
    <div className="relative overflow-hidden rounded-xl backdrop-blur-md shadow-lg p-2">
      {/* Fondo expandido que cubre más área */}
      <div className="absolute inset-0 bg-black/90 pointer-events-none" style={{ margin: "-8px" }} />
      <div className="absolute inset-0 bg-gradient-to-br from-[#102A4C]/40 to-[#061629]/90 pointer-events-none" style={{ margin: "-8px" }} />
      <div className="absolute inset-0 pointer-events-none" style={{
        backgroundImage: "radial-gradient(circle at top right, rgba(13, 148, 218, 0.25), transparent 70%)",
        margin: "-8px"
      }} />
      <div className="absolute inset-0 border border-[#D3E4FD]/30 rounded-xl pointer-events-none" style={{ margin: "-8px" }} />
      
      <div className="relative z-10 p-2">
        <h3 className="text-[#D3E4FD] text-[10px] font-medium tracking-wider mb-1">{label}</h3>
        <div className="flex flex-col items-center">
          <div className="flex items-baseline gap-1 justify-center">
            <span 
              className={`${isArrhythmiaDisplay ? 'text-sm' : 'text-lg'} font-bold transition-colors duration-300 text-[#D3E4FD]`}
              style={{ color: color || '#D3E4FD' }}
            >
              {isArrhythmiaDisplay ? text : displayValue}
            </span>
            {!isArrhythmiaDisplay && unit && (
              <span className="text-[#D3E4FD] text-[9px]">{unit}</span>
            )}
          </div>
          {riskLabel && (
            <span 
              className="text-[9px] font-semibold tracking-wider mt-0.5 text-[#D3E4FD]"
              style={{ color: color || '#D3E4FD' }}
            >
              {riskLabel}
            </span>
          )}
        </div>
      </div>
    </div>
  );
});

export default VitalSign;
