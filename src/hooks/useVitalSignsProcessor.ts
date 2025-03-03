import { useState, useCallback, useEffect } from 'react';
import { VitalSignsProcessor } from '../modules/VitalSignsProcessor';
import { GlucoseProcessor } from '../modules/GlucoseProcessor';

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
  
  useEffect(() => {
    console.log('Inicializando procesadores de signos vitales');
    
    return () => {
      console.log('Limpiando procesadores de signos vitales');
    };
  }, []);

  const processSignal = useCallback((ppgValue: number, rrData?: any) => {
    const amplitudes = rrData?.amplitudes || [];
    const amplitude = amplitudes.length > 0 ? amplitudes[0] : null;
    
    if (amplitude !== null) {
      console.log("useVitalSignsProcessor: Processing signal with amplitude:", amplitude);
    }
    
    const vitalSignsResult = processor.processSignal(ppgValue, {
      intervals: rrData?.intervals || [],
      lastPeakTime: rrData?.lastPeakTime || null,
      amplitudes: rrData?.amplitudes || []
    });
    
    const glucoseResult = glucoseProcessor.processSignal(ppgValue);
    
    const glucoseData = {
      value: glucoseResult.value || 0,
      trend: glucoseResult.trend || 'unknown',
      confidence: glucoseResult.confidence || 0
    };
    
    const combinedResult: VitalSignsResult = {
      ...vitalSignsResult,
      glucose: glucoseData
    };
    
    if (vitalSignsResult.lastArrhythmiaData) {
      combinedResult.lastArrhythmiaData = vitalSignsResult.lastArrhythmiaData;
    }
    
    combinedResult.arrhythmiaStatus = vitalSignsResult.arrhythmiaStatus;
    
    if (vitalSignsResult.arrhythmiaStatus?.includes('ARRITMIA DETECTADA')) {
      console.log('useVitalSignsProcessor: ¡ARRITMIA DETECTADA!', {
        status: vitalSignsResult.arrhythmiaStatus,
        data: vitalSignsResult.lastArrhythmiaData,
        amplitude
      });
    }
    
    setVitalSignsData(combinedResult);
    return combinedResult;
  }, [processor, glucoseProcessor]);

  const reset = useCallback(() => {
    processor.reset();
    glucoseProcessor.reset();
    setVitalSignsData(null);
    console.log('Procesadores reiniciados');
  }, [processor, glucoseProcessor]);

  const getCurrentRespiratoryData = useCallback(() => {
    return null;
  }, []);

  const calibrateGlucose = useCallback((referenceValue: number) => {
    if (glucoseProcessor && typeof referenceValue === 'number' && referenceValue > 0) {
      glucoseProcessor.calibrateWithReference(referenceValue);
      console.log('Glucosa calibrada con valor de referencia:', referenceValue);
      return true;
    }
    return false;
  }, [glucoseProcessor]);

  const cleanMemory = useCallback(() => {
    console.log('useVitalSignsProcessor: Realizando limpieza de memoria');
    
    processor.reset();
    glucoseProcessor.reset();
    
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
    cleanMemory
  };
};
