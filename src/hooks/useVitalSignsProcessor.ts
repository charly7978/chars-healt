
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
    // IMPORTANTE: primero procesar la señal principal con el procesador original
    // sin ninguna modificación para mantener la detección de arritmias intacta
    const vitalSignsResult = processor.processSignal(ppgValue, rrData);
    
    // DESPUÉS, como paso separado, procesar los datos de glucosa
    // sin interferir con el procesamiento principal
    const glucoseResult = glucoseProcessor.processSignal(ppgValue);
    
    // Preparar datos de glucosa
    const glucoseData = {
      value: glucoseResult.value || 0,
      trend: glucoseResult.trend || 'unknown',
      confidence: glucoseResult.confidence || 0
    };
    
    // Combinar resultados PRESERVANDO todos los datos originales
    // especialmente los relacionados con arritmias
    const combinedResult: VitalSignsResult = {
      ...vitalSignsResult,
      glucose: glucoseData
    };
    
    // Asegurarse de que lastArrhythmiaData se preserve exactamente como viene del procesador original
    if (vitalSignsResult.lastArrhythmiaData) {
      combinedResult.lastArrhythmiaData = vitalSignsResult.lastArrhythmiaData;
    }
    
    // Asegurarse de que arrhythmiaStatus se preserve exactamente
    combinedResult.arrhythmiaStatus = vitalSignsResult.arrhythmiaStatus;
    
    // Guardar datos combinados en estado
    setVitalSignsData(combinedResult);
    
    // Importante: verificamos si hay arritmias en el resultado
    if (vitalSignsResult.arrhythmiaStatus && vitalSignsResult.arrhythmiaStatus.includes('ARRITMIA DETECTADA')) {
      console.log('¡ARRITMIA DETECTADA!', vitalSignsResult.arrhythmiaStatus);
    }
    
    return combinedResult;
  }, [processor, glucoseProcessor]);

  const reset = useCallback(() => {
    processor.reset();
    glucoseProcessor.reset();
    setVitalSignsData(null);
    console.log('Procesadores reiniciados');
  }, [processor, glucoseProcessor]);

  const getCurrentRespiratoryData = useCallback(() => {
    // Por ahora, retornamos null ya que no tenemos datos respiratorios directos
    return null;
  }, []);
  
  // Función para calibrar el medidor de glucosa
  const calibrateGlucose = useCallback((referenceValue: number) => {
    if (glucoseProcessor && typeof referenceValue === 'number' && referenceValue > 0) {
      glucoseProcessor.calibrateWithReference(referenceValue);
      console.log('Glucosa calibrada con valor de referencia:', referenceValue);
      return true;
    }
    return false;
  }, [glucoseProcessor]);

  // Añadir el método cleanMemory que falta
  const cleanMemory = useCallback(() => {
    console.log('useVitalSignsProcessor: Realizando limpieza de memoria');
    
    // Reiniciar procesadores
    processor.reset();
    glucoseProcessor.reset();
    
    // Limpiar el estado
    setVitalSignsData(null);
    
    console.log('useVitalSignsProcessor: Memoria liberada');
    
    return true;
  }, [processor, glucoseProcessor]);

  return {
    vitalSignsData,
    processSignal,
    reset,
    getCurrentRespiratoryData,
    calibrateGlucose,
    cleanMemory  // Exportamos el nuevo método
  };
};
