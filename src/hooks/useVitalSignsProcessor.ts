import { useState, useCallback, useEffect } from 'react';
import { VitalSignsProcessor } from '../modules/VitalSignsProcessor';
import { GlucoseProcessor } from '../modules/GlucoseProcessor';

// Tipo para los datos devueltos por el procesador
type VitalSignsResult = {
  spo2: number;
  pressure: string;
  arrhythmiaStatus: string;
  lastArrhythmiaData?: {
    timestamp: number;
    rmssd: number;
    rrVariation: number;
  } | null;
  glucose?: {
    value: number;
    trend: 'stable' | 'rising' | 'falling' | 'rising_rapidly' | 'falling_rapidly' | 'unknown';
    confidence: number;
  };
};

export const useVitalSignsProcessor = () => {
  const [processor] = useState(() => new VitalSignsProcessor());
  const [glucoseProcessor] = useState(() => new GlucoseProcessor());
  const [vitalSignsData, setVitalSignsData] = useState<VitalSignsResult | null>(null);
  
  // Asegurar que los procesadores se inicialicen correctamente
  useEffect(() => {
    console.log('Inicializando procesadores de signos vitales');
    
    return () => {
      console.log('Limpiando procesadores de signos vitales');
    };
  }, []);

  const processSignal = useCallback((ppgValue: number, rrData?: any) => {
    // CRUCIAL: Primero procesar con el procesador original exactamente como antes
    // Esto es crítico para mantener la detección de arritmias intacta
    const originalResult = processor.processSignal(ppgValue, rrData);
    
    // DESPUÉS, y como paso SEPARADO, procesar glucosa (este era el error - antes estábamos
    // combinando resultados de forma incorrecta)
    const glucoseResult = glucoseProcessor.processSignal(ppgValue);
    
    // Combinar resultados preservando EXACTAMENTE todos los datos de arritmias
    const result = {
      ...originalResult,  // Mantener TODOS los datos originales exactamente como estaban
      // Agregar glucosa como dato adicional sin alterar ninguna otra propiedad
      glucose: {
        value: glucoseResult.value || 0,
        trend: glucoseResult.trend || 'unknown',
        confidence: glucoseResult.confidence || 0
      }
    };
    
    // Actualizar el estado con el resultado combinado
    setVitalSignsData(result);
    
    // Retornar el resultado combinado
    return result;
  }, [processor, glucoseProcessor]);

  const reset = useCallback(() => {
    // Resetear ambos procesadores
    processor.reset();
    glucoseProcessor.reset();
    setVitalSignsData(null);
  }, [processor, glucoseProcessor]);

  const getCurrentRespiratoryData = useCallback(() => {
    if (!vitalSignsData) return null;
    
    return {
      rate: vitalSignsData.respiratoryRate,
      pattern: vitalSignsData.respiratoryPattern,
      confidence: vitalSignsData.respiratoryConfidence
    };
  }, [vitalSignsData]);
  
  // Función para calibrar el medidor de glucosa
  const calibrateGlucose = useCallback((referenceValue: number) => {
    if (glucoseProcessor && typeof referenceValue === 'number' && referenceValue > 0) {
      glucoseProcessor.calibrateWithReference(referenceValue);
      return true;
    }
    return false;
  }, [glucoseProcessor]);

  return {
    vitalSignsData,
    processSignal,
    reset,
    getCurrentRespiratoryData,
    calibrateGlucose
  };
};
