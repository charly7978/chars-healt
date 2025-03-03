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
    console.log('useVitalSignsProcessor: Procesando señal con datos:', {
      ppgValue,
      rrIntervals: rrData?.intervals?.length || 0,
      amplitudes: rrData?.amplitudes?.length || 0
    });
    
    const vitalSignsResult = processor.processSignal(ppgValue, rrData);
    
    const glucoseResult = glucoseProcessor.processSignal(ppgValue);
    
    const glucoseData = {
      value: glucoseResult.value || 0,
      trend: glucoseResult.trend || 'unknown',
      confidence: glucoseResult.confidence || 0
    };
    
    let arrhythmiaResult = {
      detected: false,
      severity: 0,
      confidence: 0,
      type: 'NONE',
      timestamp: Date.now(),
      rmssd: 0,
      rrVariation: 0
    };
    
    if (rrData && rrData.intervals && rrData.intervals.length > 0) {
      console.log('useVitalSignsProcessor: Enviando datos a detector de arritmias:', {
        intervals: rrData.intervals.length,
        amplitudes: (rrData.amplitudes || []).length
      });
      
      arrhythmiaResult = arrhythmiaDetector.processRRIntervals(
        rrData.intervals,
        rrData.amplitudes || []
      );
      
      if (arrhythmiaResult.detected) {
        console.log('useVitalSignsProcessor: ¡ARRITMIA DETECTADA!', {
          type: arrhythmiaResult.type,
          severity: arrhythmiaResult.severity,
          confidence: arrhythmiaResult.confidence,
          rmssd: arrhythmiaResult.rmssd,
          rrVariation: arrhythmiaResult.rrVariation
        });
      }
    }
    
    const arrhythmiaStatus = arrhythmiaDetector.getStatusText();
    
    const combinedResult: VitalSignsResult = {
      ...vitalSignsResult,
      glucose: glucoseData,
      arrhythmiaStatus: arrhythmiaStatus
    };
    
    const lastArrhythmia = arrhythmiaDetector.getLastArrhythmia();
    if (lastArrhythmia && lastArrhythmia.detected) {
      combinedResult.lastArrhythmiaData = {
        timestamp: lastArrhythmia.timestamp,
        rmssd: lastArrhythmia.rmssd || 0,
        rrVariation: lastArrhythmia.rrVariation || 0
      };
      
      console.log('useVitalSignsProcessor: Datos de arritmia agregados:', combinedResult.lastArrhythmiaData);
    }
    
    if (combinedResult.arrhythmiaStatus.includes("ARRITMIA DETECTADA")) {
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
