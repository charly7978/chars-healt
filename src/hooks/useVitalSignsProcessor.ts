
import { useState, useCallback, useEffect } from 'react';
import { VitalSignsProcessor } from '../modules/VitalSignsProcessor';
import { GlucoseProcessor } from '../modules/GlucoseProcessor';
import { ArrhythmiaDetector } from '../modules/ArrhythmiaDetector';
import { ArrhythmiaResult } from '../types/signal';

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
    
    // Define arrhythmiaResult con valores predeterminados explícitamente tipados como ArrhythmiaResult
    const defaultArrhythmiaResult: ArrhythmiaResult = {
      detected: false,
      severity: 0,
      confidence: 0,
      type: 'NONE',
      timestamp: Date.now(),
      rmssd: 0,
      rrVariation: 0
    };
    
    let arrhythmiaResult: ArrhythmiaResult = defaultArrhythmiaResult;
    
    // Mejora para Android: asegurarse de que los intervalos son arrays válidos
    // y que tienen una longitud adecuada para el análisis
    if (rrData && Array.isArray(rrData.intervals) && rrData.intervals.length >= 3) {
      console.log('useVitalSignsProcessor: Analizando intervalos RR para arritmias:', {
        intervals: rrData.intervals.length,
        amplitudes: Array.isArray(rrData.amplitudes) ? rrData.amplitudes.length : 0,
        plataforma: navigator.userAgent
      });
      
      try {
        // Intentamos usar amplitudes si existen, sino creamos un array del mismo tamaño
        const amplitudesToUse = Array.isArray(rrData.amplitudes) && rrData.amplitudes.length > 0 
          ? rrData.amplitudes 
          : Array(rrData.intervals.length).fill(100); // Valor predeterminado si no hay amplitudes
        
        arrhythmiaResult = arrhythmiaDetector.processRRIntervals(
          rrData.intervals,
          amplitudesToUse
        );
        
        if (arrhythmiaResult.detected) {
          console.log('useVitalSignsProcessor: ¡ARRITMIA DETECTADA!', {
            type: arrhythmiaResult.type,
            severity: arrhythmiaResult.severity,
            confidence: arrhythmiaResult.confidence,
            rmssd: arrhythmiaResult.rmssd || 0,
            rrVariation: arrhythmiaResult.rrVariation || 0,
            timestamp: arrhythmiaResult.timestamp
          });
        }
      } catch (error) {
        console.error('useVitalSignsProcessor: Error al procesar arritmias:', error);
        // Mantener el valor predeterminado en caso de error
      }
    } else {
      console.log('useVitalSignsProcessor: Datos RR insuficientes para análisis de arritmias', {
        intervalos: rrData?.intervals?.length || 0
      });
    }
    
    const arrhythmiaStatus = arrhythmiaDetector.getStatusText();
    
    const combinedResult: VitalSignsResult = {
      ...vitalSignsResult,
      glucose: glucoseData,
      arrhythmiaStatus: arrhythmiaStatus
    };
    
    // Verificación adicional para dispositivos Android
    const lastArrhythmia = arrhythmiaDetector.getLastArrhythmia();
    const isAndroid = /android/i.test(navigator.userAgent);
    
    if (lastArrhythmia && lastArrhythmia.detected) {
      // Asegurarse de que siempre tenemos valores para rmssd y rrVariation
      combinedResult.lastArrhythmiaData = {
        timestamp: lastArrhythmia.timestamp,
        rmssd: lastArrhythmia.rmssd || 0,
        rrVariation: lastArrhythmia.rrVariation || 0
      };
      
      console.log('useVitalSignsProcessor: Datos de arritmia agregados:', 
        JSON.stringify(combinedResult.lastArrhythmiaData));
      
      // Forzar la actualización para dispositivos Android con más información de log
      if (isAndroid) {
        console.log('useVitalSignsProcessor: Forzando actualización para Android', {
          arrhythmiaStatus: combinedResult.arrhythmiaStatus,
          type: lastArrhythmia.type,
          timestamp: lastArrhythmia.timestamp,
          datos: combinedResult.lastArrhythmiaData
        });
        
        // Asegurar que el estado siempre refleje correctamente la arritmia en Android
        if (!combinedResult.arrhythmiaStatus.includes("ARRITMIA DETECTADA")) {
          combinedResult.arrhythmiaStatus = `ARRITMIA DETECTADA (${lastArrhythmia.type})|1`;
          console.log('useVitalSignsProcessor: Estado de arritmia forzado para Android');
        }
      }
    }
    
    if (combinedResult.arrhythmiaStatus.includes("ARRITMIA DETECTADA")) {
      console.log('useVitalSignsProcessor: ¡ARRITMIA DETECTADA EN RESULTADO FINAL!', {
        status: combinedResult.arrhythmiaStatus,
        data: combinedResult.lastArrhythmiaData ? JSON.stringify(combinedResult.lastArrhythmiaData) : 'null',
        type: lastArrhythmia?.type || 'desconocido'
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
