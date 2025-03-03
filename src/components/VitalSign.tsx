
import React, { memo, useMemo, useState } from 'react';
import { VitalSignsRisk } from '../utils/vitalSignsRisk';
import VitalSignDetail from './VitalSignDetail';

interface VitalSignProps {
  label: string;
  value: string | number;
  unit?: string;
  isFinalReading?: boolean;
  secondaryValue?: string | number;
  secondaryUnit?: string;
  trend?: 'stable' | 'rising' | 'falling' | 'rising_rapidly' | 'falling_rapidly' | 'unknown';
}

const VitalSign: React.FC<VitalSignProps> = ({ 
  label, 
  value, 
  unit, 
  isFinalReading = false,
  secondaryValue,
  secondaryUnit,
  trend
}) => {
  const [showDetail, setShowDetail] = useState(false);
  const isArrhythmiaDisplay = label === "ARRITMIAS";
  const isBloodPressure = label === "PRESIÓN ARTERIAL";
  const isRespiration = label === "RESPIRACIÓN";
  const isGlucose = label === "GLUCOSA";

  const isBloodPressureUnrealistic = (bpString: string): boolean => {
    if (!isBloodPressure || bpString === "--/--" || bpString === "0/0") return false;
    
    const [systolic, diastolic] = bpString.split('/').map(Number);
    
    if (isNaN(systolic) || isNaN(diastolic)) return true;
    
    if (systolic > 300 || systolic < 60) return true;
    if (diastolic > 200 || diastolic < 30) return true;
    if (systolic <= diastolic) return true;
    
    return false;
  };

  const displayValueCache = new Map<string, string | number>();
  
  const processedDisplayValue = useMemo(() => {
    const cacheKey = `${label}-${value}`;
    if (displayValueCache.has(cacheKey)) {
      return displayValueCache.get(cacheKey);
    }
    
    let result = value;
    if (isBloodPressure && typeof value === 'string') {
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

    if (label === "FRECUENCIA CARDÍACA") {
      if (value === "--" || value === 0) {
        return { color: '#000000', label: '' };
      }
      if (typeof value === 'number') {
        return VitalSignsRisk.getBPMRisk(value, isFinalReading);
      }
    }

    if (label === "SPO2") {
      if (value === "--" || value === 0) {
        return { color: '#000000', label: '' };
      }
      if (typeof value === 'number') {
        return VitalSignsRisk.getSPO2Risk(value, isFinalReading);
      }
    }

    if (isRespiration) {
      if (value === "--" || value === 0) {
        return { color: '#000000', label: '' };
      }
      if (typeof value === 'number') {
        return getRespirationRiskDisplay(value);
      }
    }
    
    if (isGlucose) {
      if (value === "--" || value === 0) {
        return { color: '#000000', label: '' };
      }
      if (typeof value === 'number') {
        return getGlucoseRiskDisplay(value, trend);
      }
    }

    if (label === "PRESIÓN ARTERIAL") {
      if (value === "--/--" || value === "0/0") {
        return { color: '#000000', label: '' };
      }
      
      if (typeof value === 'string' && !isBloodPressureUnrealistic(value)) {
        return VitalSignsRisk.getBPRisk(value, isFinalReading);
      }
      
      return { color: '#000000', label: '' };
    }

    return { color: '#000000', label: '' };
  };

  const getRespirationRiskDisplay = (rate: number) => {
    if (rate < 8) return { color: '#DC2626', label: 'BRADIPNEA' };
    if (rate < 12) return { color: '#F97316', label: 'LEVE BRADIPNEA' };
    if (rate <= 20) return { color: '#22C55E', label: 'NORMAL' };
    if (rate <= 25) return { color: '#F97316', label: 'LEVE TAQUIPNEA' };
    return { color: '#DC2626', label: 'TAQUIPNEA' };
  };

  const getGlucoseRiskDisplay = (
    value: number, 
    trend?: 'stable' | 'rising' | 'falling' | 'rising_rapidly' | 'falling_rapidly' | 'unknown'
  ) => {
    let riskColor = '';
    let riskLabel = '';
    
    if (value < 70) {
      riskColor = '#DC2626';
      riskLabel = 'HIPOGLUCEMIA';
    } else if (value < 100) {
      riskColor = '#22C55E';
      riskLabel = 'NORMAL';
    } else if (value < 126) {
      riskColor = '#F97316';
      riskLabel = 'PREDIABETES';
    } else if (value < 180) {
      riskColor = '#EF4444';
      riskLabel = 'DIABETES';
    } else if (value < 250) {
      riskColor = '#DC2626';
      riskLabel = 'HIPERGLUCEMIA';
    } else {
      riskColor = '#991B1B';
      riskLabel = 'HIPERGLUCEMIA SEVERA';
    }
    
    if (trend === 'rising_rapidly' && value > 180) {
      riskLabel = 'HIPERGLUCEMIA CRECIENTE';
    } else if (trend === 'falling_rapidly' && value < 90) {
      riskLabel = 'HIPOGLUCEMIA DECRECIENTE';
    }
    
    return { color: riskColor, label: riskLabel };
  };

  const getArrhythmiaRiskColor = (count: number): string => {
    if (count <= 0) return "#000000";
    if (count <= 3) return "#F2FCE2";
    if (count <= 6) return "#FEC6A1";
    if (count <= 8) return "#F97316";
    return "#DC2626";
  };

  const getArrhythmiaRiskLabel = (count: number): string => {
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
        text: "", 
        color: "#FFFFFF",
        label: ""
      };
    }
    
    const [status, countStr] = String(value).split('|');
    const count = parseInt(countStr || "0", 10);
    
    if (status === "ARRITMIA DETECTADA") {
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

  const renderGlucoseTrend = (trend?: string) => {
    if (!trend || trend === 'unknown' || trend === 'stable') return null;
    
    let icon = '';
    let color = '';
    
    switch (trend) {
      case 'rising':
        icon = '↗';
        color = '#F97316';
        break;
      case 'falling':
        icon = '↘';
        color = '#3B82F6';
        break;
      case 'rising_rapidly':
        icon = '⇑';
        color = '#DC2626';
        break;
      case 'falling_rapidly':
        icon = '⇓';
        color = '#DC2626';
        break;
    }
    
    return (
      <span className="text-lg font-bold ml-1" style={{ color }}>
        {icon}
      </span>
    );
  };

  const handleCardClick = () => {
    if (
      (value === "--" || value === 0 || value === "--/--" || value === "0/0") ||
      !isFinalReading
    ) {
      return;
    }
    
    setShowDetail(true);
  };

  const getVitalSignType = () => {
    if (label === "FRECUENCIA CARDÍACA") return "heartRate";
    if (label === "SPO2") return "spo2";
    if (label === "PRESIÓN ARTERIAL") return "bloodPressure";
    if (label === "ARRITMIAS") return "arrhythmia";
    if (label === "RESPIRACIÓN") return "respiration";
    if (label === "GLUCOSA") return "glucose";
    return "heartRate";
  };

  const { text, title, color, label: riskLabel } = isArrhythmiaDisplay ? 
    getArrhythmiaDisplay() : 
    { text: processedDisplayValue, title: undefined, ...getRiskInfo() };

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
              <span className="text-sm font-bold tracking-wider" style={{ color: color || '#FFFFFF' }}>
                {title}
              </span>
            )}
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
              {isGlucose && renderGlucoseTrend(trend)}
            </div>
            
            {secondaryValue !== undefined && (
              <div className="flex items-baseline gap-1 justify-center mt-1">
                <span className="text-sm font-medium text-white/80">
                  {secondaryValue}
                </span>
                {secondaryUnit && (
                  <span className="text-white/70 text-[10px]">{secondaryUnit}</span>
                )}
              </div>
            )}
            
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
          secondaryValue={secondaryValue as string | number}
          secondaryUnit={secondaryUnit}
          trend={isGlucose ? trend : undefined}
        />
      )}
    </>
  );
};

export default memo(VitalSign);
