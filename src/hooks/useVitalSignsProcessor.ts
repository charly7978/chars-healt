
import { useState, useCallback, useEffect } from 'react';
import { VitalSignsProcessor } from '../modules/VitalSignsProcessor';
import { GlucoseProcessor } from '../modules/GlucoseProcessor';
import { ArrhythmiaDetector } from '../modules/ArrhythmiaDetector';

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
  const [arrhythmiaDetector] = useState(() => new ArrhythmiaDetector());
  const [vitalSignsData, setVitalSignsData] = useState<VitalSignsResult | null>(null);
  
  useEffect(() => {
    console.log('Inicializando procesadores de signos vitales');
    
    return () => {
      console.log('Limpiando procesadores de signos vitales');
    };
  }, []);

  const processSignal = useCallback((ppgValue: number, rrData?: any) => {
    const intervals = rrData?.intervals || [];
    const amplitudes = rrData?.amplitudes || [];
    
    // Process vital signs with PPG signal
    const vitalSignsResult = processor.processSignal(ppgValue, {
      intervals: intervals,
      lastPeakTime: rrData?.lastPeakTime || null,
      amplitudes: amplitudes
    });
    
    // Process glucose data
    const glucoseResult = glucoseProcessor.processSignal(ppgValue);
    
    const glucoseData = {
      value: glucoseResult.value || 0,
      trend: glucoseResult.trend || 'unknown',
      confidence: glucoseResult.confidence || 0
    };
    
    // Process arrhythmia detection with RR intervals and amplitudes
    let arrhythmiaResult = null;
    if (intervals.length > 0) {
      arrhythmiaResult = arrhythmiaDetector.processRRIntervals(intervals, amplitudes);
      
      if (arrhythmiaResult.detected) {
        console.log('useVitalSignsProcessor: Arrhythmia detection update', {
          detected: arrhythmiaResult.detected,
          type: arrhythmiaResult.type,
          severity: arrhythmiaResult.severity,
          confidence: arrhythmiaResult.confidence,
          rmssd: arrhythmiaResult.rmssd,
          rrVariation: arrhythmiaResult.rrVariation
        });
      }
    }
    
    // Combine all results
    const combinedResult: VitalSignsResult = {
      ...vitalSignsResult,
      glucose: glucoseData,
      arrhythmiaStatus: arrhythmiaDetector.getStatusText()
    };
    
    // Add arrhythmia data if available
    const lastArrhythmia = arrhythmiaDetector.getLastArrhythmia();
    if (lastArrhythmia && lastArrhythmia.detected) {
      combinedResult.lastArrhythmiaData = {
        timestamp: lastArrhythmia.timestamp,
        rmssd: lastArrhythmia.rmssd || 0,
        rrVariation: lastArrhythmia.rrVariation || 0
      };
    }
    
    // Log if arrhythmia is detected
    if (combinedResult.arrhythmiaStatus.includes('ARRITMIA DETECTADA')) {
      console.log('useVitalSignsProcessor: ¡ARRITMIA DETECTADA!', {
        status: combinedResult.arrhythmiaStatus,
        data: combinedResult.lastArrhythmiaData,
        type: lastArrhythmia?.type
      });
    }
    
    setVitalSignsData(combinedResult);
    return combinedResult;
  }, [processor, glucoseProcessor, arrhythmiaDetector]);

  const reset = useCallback(() => {
    processor.reset();
    glucoseProcessor.reset();
    arrhythmiaDetector.reset();
    setVitalSignsData(null);
    console.log('Procesadores reiniciados');
  }, [processor, glucoseProcessor, arrhythmiaDetector]);

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
    arrhythmiaDetector.reset();
    
    setVitalSignsData(null);
    
    console.log('useVitalSignsProcessor: Memoria liberada');
    
    return true;
  }, [processor, glucoseProcessor, arrhythmiaDetector]);

  return {
    vitalSignsData,
    processSignal,
    reset,
    getCurrentRespiratoryData,
    calibrateGlucose,
    cleanMemory
  };
};
