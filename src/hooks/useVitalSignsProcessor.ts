import { useState, useCallback, useRef } from 'react';
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
  const processorRef = useRef<VitalSignsProcessor | null>(null);
  const glucoseProcessorRef = useRef<GlucoseProcessor | null>(null);
  const [vitalSignsData, setVitalSignsData] = useState<VitalSignsResult | null>(null);
  
  // Asegurar que los procesadores estén inicializados
  const getProcessors = useCallback(() => {
    if (!processorRef.current) {
      console.log('Inicializando VitalSignsProcessor');
      processorRef.current = new VitalSignsProcessor();
    }
    if (!glucoseProcessorRef.current) {
      console.log('Inicializando GlucoseProcessor');
      glucoseProcessorRef.current = new GlucoseProcessor();
    }
    return {
      vitalSigns: processorRef.current,
      glucose: glucoseProcessorRef.current
    };
  }, []);

  const processSignal = useCallback((ppgValue: number, rrData?: any) => {
    const processors = getProcessors();
    
    // IMPORTANTE: Procesar primero los signos vitales para mantener la detección de arritmias intacta
    const vitalSignsResult = processors.vitalSigns.processSignal(ppgValue, rrData);
    
    // Procesar glucosa de forma independiente
    const glucoseResult = processors.glucose.processSignal(ppgValue);
    
    // Combinar resultados manteniendo la integridad de los datos de arritmia
    const combinedResult: VitalSignsResult = {
      ...vitalSignsResult,
      glucose: {
        value: glucoseResult.value || 0,
        trend: glucoseResult.trend || 'unknown',
        confidence: glucoseResult.confidence || 0
      }
    };
    
    // Verificar explícitamente que los datos de arritmia se mantienen
    if (vitalSignsResult.lastArrhythmiaData) {
      console.log('Arritmia detectada:', vitalSignsResult.arrhythmiaStatus);
    }
    
    setVitalSignsData(combinedResult);
    return combinedResult;
  }, [getProcessors]);

  const reset = useCallback(() => {
    const processors = getProcessors();
    processors.vitalSigns.reset();
    processors.glucose.reset();
    setVitalSignsData(null);
  }, [getProcessors]);

  const calibrateGlucose = useCallback((referenceValue: number) => {
    const processors = getProcessors();
    if (processors.glucose && typeof referenceValue === 'number' && referenceValue > 0) {
      processors.glucose.calibrateWithReference(referenceValue);
      return true;
    }
    return false;
  }, [getProcessors]);

  const cleanMemory = useCallback(() => {
    console.log('Limpiando memoria de procesadores');
    if (processorRef.current) {
      processorRef.current.reset();
      processorRef.current = null;
    }
    if (glucoseProcessorRef.current) {
      glucoseProcessorRef.current.reset();
      glucoseProcessorRef.current = null;
    }
    setVitalSignsData(null);
  }, []);

  return {
    vitalSignsData,
    processSignal,
    reset,
    calibrateGlucose,
    cleanMemory
  };
};
