
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
    
    // Requerimos al menos 2 intervalos para un análisis
    const minIntervalsRequired = 2;
    
    if (rrData && Array.isArray(rrData.intervals) && rrData.intervals.length >= minIntervalsRequired) {
      console.log('useVitalSignsProcessor: Analizando intervalos RR para arritmias:', {
        intervals: rrData.intervals.length,
        amplitudes: Array.isArray(rrData.amplitudes) ? rrData.amplitudes.length : 0
      });
      
      try {
        // Intentamos usar amplitudes si existen, sino creamos un array del mismo tamaño
        let amplitudesToUse = Array(rrData.intervals.length).fill(100); // Valor predeterminado
        
        if (Array.isArray(rrData.amplitudes) && rrData.amplitudes.length > 0) {
          // Si hay amplitudes disponibles, las usamos
          if (rrData.amplitudes.length === rrData.intervals.length) {
            amplitudesToUse = rrData.amplitudes;
          } else {
            // Si las longitudes no coinciden, rellenamos o recortamos
            amplitudesToUse = Array(rrData.intervals.length).fill(0).map((_, i) => {
              return i < rrData.amplitudes.length ? rrData.amplitudes[i] : 100;
            });
          }
        }
        
        // Validación adicional de intervalos
        const validIntervals = rrData.intervals.filter(i => typeof i === 'number' && !isNaN(i));
        
        if (validIntervals.length >= minIntervalsRequired) {
          arrhythmiaResult = arrhythmiaDetector.processRRIntervals(
            validIntervals,
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
        } else {
          console.log(`useVitalSignsProcessor: Intervalos válidos insuficientes para análisis (${validIntervals.length}/${minIntervalsRequired} requeridos)`);
        }
      } catch (error) {
        console.error('useVitalSignsProcessor: Error al procesar arritmias:', error);
        // Mantener el valor predeterminado en caso de error
      }
    } else {
      console.log('useVitalSignsProcessor: Datos RR insuficientes para análisis de arritmias', {
        intervalos: rrData?.intervals?.length || 0,
        requeridos: minIntervalsRequired
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
    
    if (lastArrhythmia && lastArrhythmia.detected) {
      // Asegurarse de que siempre tenemos valores para rmssd y rrVariation
      combinedResult.lastArrhythmiaData = {
        timestamp: lastArrhythmia.timestamp,
        rmssd: lastArrhythmia.rmssd || 0,
        rrVariation: lastArrhythmia.rrVariation || 0
      };
      
      console.log('useVitalSignsProcessor: Datos de arritmia agregados:', 
        JSON.stringify(combinedResult.lastArrhythmiaData));
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
