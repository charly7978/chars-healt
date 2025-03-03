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
  
  // Asegurar que el procesador de glucosa se inicialice correctamente
  useEffect(() => {
    console.log('Inicializando procesadores de signos vitales');
    
    // Inicialización opcional si es necesario
    
    return () => {
      console.log('Limpiando procesadores de signos vitales');
    };
  }, []);

  const processSignal = useCallback((ppgValue: number, rrData?: any) => {
    // Procesar signos vitales regulares
    const result = processor.processSignal(ppgValue, rrData);
    
    // Procesar datos de glucosa (asegurarse de que es un valor numérico válido)
    const rawPpgValue = typeof ppgValue === 'number' ? ppgValue : 0;
    const glucoseResult = glucoseProcessor.processSignal(rawPpgValue);
    
    // Asegurar que los datos de glucosa tienen la estructura correcta
    const glucoseData = {
      value: glucoseResult.value || 0,
      trend: glucoseResult.trend || 'unknown',
      confidence: glucoseResult.confidence || 0
    };
    
    // Combinar resultados
    const combinedResult: VitalSignsResult = {
      ...result,
      glucose: glucoseData
    };
    
    // Guardar datos combinados en estado
    setVitalSignsData(combinedResult);
    
    // Log ocasional para diagnóstico (reducido para no saturar consola)
    if (Math.random() < 0.01) { // Solo loguea aproximadamente 1% de las veces
      console.log('Datos de glucosa procesados:', {
        value: glucoseData.value,
        trend: glucoseData.trend
      });
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
    // En versiones futuras, esto debería recuperar datos respiratorios reales
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

  return {
    vitalSignsData,
    processSignal,
    reset,
    getCurrentRespiratoryData,
    calibrateGlucose
  };
};
