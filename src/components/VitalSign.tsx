import React, { useEffect, useState } from 'react';
import { cn } from '../lib/utils';
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
  const [expanded, setExpanded] = useState(false);
  
  // Verificar si el valor de presión arterial es no realista
  const isBloodPressureUnrealistic = (bpString: string): boolean => {
    if (!bpString.includes('/')) return false;
    
    const [systolic, diastolic] = bpString.split('/').map(Number);
    
    // Consideramos no realista si:
    // 1. La sistólica es menor que la diastólica
    // 2. La sistólica es extremadamente alta o baja
    // 3. La diastólica es extremadamente alta o baja
    // 4. La diferencia entre sistólica y diastólica es muy pequeña
    
    return (
      isNaN(systolic) || 
      isNaN(diastolic) ||
      systolic <= diastolic || 
      systolic < 70 || 
      systolic > 220 ||
      diastolic < 40 ||
      diastolic > 120 ||
      (systolic - diastolic) < 20
    );
  };
  
  // Only apply after a valid reading
  const isValidValue = value !== '--' && value !== '...' && value !== '--/--';
  const isNumericValue = typeof value === 'number' || !isNaN(parseFloat(value as string));
  
  // Función para obtener información de riesgo basada en el tipo de signo vital
  const getRiskInfo = () => {
    if (!isValidValue) {
      return { color: 'gray-400', label: 'Sin datos' };
    }
    
    // Si es presión arterial (formato "120/80")
    if (typeof value === 'string' && value.includes('/')) {
      const isUnrealistic = isBloodPressureUnrealistic(value);
      if (isUnrealistic) {
        return { color: 'gray-400', label: 'Datos inconsistentes' };
      }
      
      return VitalSignsRisk.getBPRisk(value, isFinalReading);
    }
    
    // Si es oxígeno en sangre (SpO2)
    if (label.toLowerCase().includes('oxígeno') && isNumericValue) {
      const numValue = typeof value === 'number' ? value : parseFloat(value as string);
      return VitalSignsRisk.getSPO2Risk(numValue, isFinalReading);
    }
    
    // Si es frecuencia cardíaca (BPM)
    if (label.toLowerCase().includes('pulso') && isNumericValue) {
      const numValue = typeof value === 'number' ? value : parseFloat(value as string);
      return VitalSignsRisk.getBPMRisk(numValue, isFinalReading);
    }
    
    // NUEVO: Si es respiración (RPM)
    if (label.toLowerCase().includes('respiración') && isNumericValue) {
      const numValue = typeof value === 'number' ? value : parseFloat(value as string);
      return VitalSignsRisk.getRespiratoryRisk(numValue, isFinalReading);
    }
    
    // Valor por defecto
    return { color: 'gray-400', label: 'Sin datos' };
  };
  
  // NUEVO: Obtener el color y etiqueta de riesgo para arritmia 
  const getArrhythmiaRiskColor = (count: number): string => {
    if (count === 0) return 'green-500';
    if (count < 3) return 'yellow-500';
    if (count < 10) return 'orange-500';
    return 'red-500';
  };
  
  // NUEVO: Obtener la etiqueta de riesgo para arritmia
  const getArrhythmiaRiskLabel = (count: number): string => {
    if (count === 0) return 'Normal';
    if (count < 3) return 'Leve';
    if (count < 10) return 'Moderado';
    return 'Alto';
  };
  
  // NUEVO: Generar visualización de arritmia si es necesario
  const getArrhythmiaDisplay = () => {
    if (!label.toLowerCase().includes('pulso') || typeof value !== 'string') return null;
    
    // Extraer información de arritmia si está presente
    if (value.includes('|')) {
      const parts = value.split('|');
      const bpm = parseInt(parts[0]);
      const arrhythmiaCount = parseInt(parts[1]);
      
      if (!isNaN(bpm) && !isNaN(arrhythmiaCount)) {
        const riskColor = getArrhythmiaRiskColor(arrhythmiaCount);
        const riskLabel = getArrhythmiaRiskLabel(arrhythmiaCount);
        
        return (
          <div className="mt-1 flex items-center text-xs">
            <span className={`text-${riskColor} font-medium`}>
              {riskLabel}
            </span>
            <span className="text-gray-500 ml-1">
              ({arrhythmiaCount} eventos)
            </span>
          </div>
        );
      }
    }
    
    return null;
  };
  
  const { color, label: riskLabel } = getRiskInfo();
  const isLoading = value === '...';
  
  // Limpiar el valor de arritmias para mostrar solo BPM si está en formato "BPM|arritmias"
  let displayValue = value;
  if (typeof value === 'string' && value.includes('|')) {
    const parts = value.split('|');
    displayValue = parts[0];
  }
  
  const handleCardClick = () => {
    // Solo expandir si hay una lectura válida
    if (isValidValue && !isLoading) {
      setExpanded(!expanded);
    }
  };
  
  // Determinar el tipo de signo vital
  const getVitalSignType = () => {
    if (label.toLowerCase().includes('oxígeno')) return 'SpO2';
    if (label.toLowerCase().includes('presión')) return 'BP';
    if (label.toLowerCase().includes('pulso')) return 'HR';
    if (label.toLowerCase().includes('respiración')) return 'RR'; // NUEVO
    return '';
  };
  
  const vitalSignType = getVitalSignType();
  
  // Actualizar historial de mediciones
  useEffect(() => {
    if (isValidValue && !isLoading && isNumericValue) {
      const numValue = typeof value === 'number' ? value : parseFloat((value as string).split('|')[0]);
      
      if (!isNaN(numValue)) {
        switch (vitalSignType) {
          case 'SpO2':
            VitalSignsRisk.updateSPO2History(numValue);
            break;
          case 'HR':
            VitalSignsRisk.updateBPMHistory(numValue);
            break;
          case 'BP':
            if (typeof value === 'string' && value.includes('/')) {
              const [systolic, diastolic] = value.split('/').map(Number);
              if (!isNaN(systolic) && !isNaN(diastolic)) {
                VitalSignsRisk.updateBPHistory(systolic, diastolic);
              }
            }
            break;
          case 'RR': // NUEVO: Actualizar historial respiratorio
            VitalSignsRisk.updateRespiratoryHistory(numValue);
            break;
        }
      }
    }
  }, [value, isValidValue, isLoading, vitalSignType]);
  
  return (
    <>
      <div
        className={cn(
          "bg-white dark:bg-slate-800 rounded-lg p-4 shadow transition-all duration-200 overflow-hidden",
          isValidValue && !isLoading ? "cursor-pointer hover:shadow-md" : "",
          expanded ? "row-span-2" : ""
        )}
        onClick={handleCardClick}
      >
        <div className="flex justify-between items-start mb-2">
          <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400">
            {label}
          </h3>
          {isValidValue && !isLoading && (
            <span 
              className={cn(
                "text-xs px-2 py-1 rounded-full",
                `bg-${color}/10 text-${color}`
              )}
            >
              {riskLabel}
            </span>
          )}
        </div>
        
        <div className="flex items-baseline">
          <div className={isLoading ? "animate-pulse bg-slate-200 dark:bg-slate-700 h-8 w-16 rounded" : ""}>
            {!isLoading && (
              <span className="text-2xl font-bold dark:text-white">
                {displayValue}
              </span>
            )}
          </div>
          {unit && !isLoading && (
            <span className="ml-1 text-slate-500 dark:text-slate-400 text-sm">
              {unit}
            </span>
          )}
        </div>
        
        {getArrhythmiaDisplay()}
        
        {expanded && isValidValue && !isLoading && (
          <div className="mt-4 text-xs text-slate-500 dark:text-slate-400 space-y-1">
            {vitalSignType === 'SpO2' && (
              <>
                <p>• 95-100%: Normal</p>
                <p>• 90-94%: Leve hipoxemia</p>
                <p>• &lt;90%: Hipoxemia severa</p>
              </>
            )}
            
            {vitalSignType === 'BP' && (
              <>
                <p>• &lt;120/80 mmHg: Ideal</p>
                <p>• 120-129/80 mmHg: Elevada</p>
                <p>• 130-139/80-89 mmHg: Estadio 1</p>
                <p>• &gt;140/90 mmHg: Estadio 2</p>
              </>
            )}
            
            {vitalSignType === 'HR' && (
              <>
                <p>• 60-100 bpm: Normal</p>
                <p>• &lt;60 bpm: Bradicardia</p>
                <p>• &gt;100 bpm: Taquicardia</p>
              </>
            )}
            
            {/* NUEVO: Información para tasa respiratoria */}
            {vitalSignType === 'RR' && (
              <>
                <p>• 12-20 rpm: Normal</p>
                <p>• 8-11 rpm: Respiración lenta</p>
                <p>• &lt;8 rpm: Respiración muy lenta</p>
                <p>• 21-25 rpm: Respiración acelerada</p>
                <p>• &gt;25 rpm: Respiración muy rápida</p>
              </>
            )}
          </div>
        )}
      </div>

      {showDetail && (
        <VitalSignDetail
          title={label}
          value={displayValue as string | number}
          unit={unit}
          riskLevel={riskLabel}
          type={vitalSignType}
          onBack={() => setShowDetail(false)}
        />
      )}
    </>
  );
};

export default VitalSign;
