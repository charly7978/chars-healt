import { useState, useCallback, useEffect } from 'react';
import { VitalSignsProcessor } from '../modules/VitalSignsProcessor';
import { GlucoseProcessor } from '../modules/GlucoseProcessor';
import { ArrhythmiaDetector } from '../modules/ArrhythmiaDetector';
import { ArrhythmiaResult, ArrhythmiaType } from '../types/signal';

type VitalSignsResult = {
  spo2: number;
  pressure: string;
  arrhythmiaStatus: string;
  lastArrhythmiaData?: {
    timestamp: number;
    rmssd: number;
    rrVariation: number;
    prematureBeat?: boolean;
    confidence?: number;
  } | null;
  respiratoryRate?: number;
  respiratoryPattern?: string;
  respiratoryConfidence?: number;
  // Mantenemos la propiedad glucose para compatibilidad
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
    console.log('Inicializando procesadores de signos vitales - Versión mejorada');
    
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
    
    // Procesar arritmias si tenemos datos RR
    let arrhythmiaResult: ArrhythmiaResult = {
      detected: false,
      severity: 0,
      confidence: 0,
      type: "NONE" as ArrhythmiaType,
      timestamp: Date.now()
    };
    
    if (rrData && Array.isArray(rrData.intervals) && rrData.intervals.length > 0) {
      const minIntervalsRequired = 4; // Mínimo para detección básica
      
      console.log('useVitalSignsProcessor: Procesando arritmias con datos:', {
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
            console.log('useVitalSignsProcessor: ¡¡ARRITMIA DETECTADA!!', {
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
      console.log('useVitalSignsProcessor: No hay intervalos RR para procesar');
    }
    
    // Construir el resultado final
    const result: VitalSignsResult = {
      spo2: vitalSignsResult.spo2,
      pressure: vitalSignsResult.pressure,
      arrhythmiaStatus: vitalSignsResult.arrhythmiaStatus,
      lastArrhythmiaData: arrhythmiaResult.detected ? {
        timestamp: arrhythmiaResult.timestamp,
        rmssd: arrhythmiaResult.rmssd || 0,
        rrVariation: arrhythmiaResult.rrVariation || 0,
        prematureBeat: false,
        confidence: arrhythmiaResult.confidence
      } : null,
      respiratoryRate: vitalSignsResult.respiratoryRate,
      respiratoryPattern: vitalSignsResult.respiratoryPattern,
      respiratoryConfidence: vitalSignsResult.respiratoryConfidence
    };
    
    setVitalSignsData(result);
    return result;
  }, [processor, glucoseProcessor, arrhythmiaDetector]);

  const reset = useCallback(() => {
    processor.reset();
    glucoseProcessor.reset();
    arrhythmiaDetector.reset();
    setVitalSignsData(null);
    console.log('Procesadores reiniciados');
  }, [processor, glucoseProcessor, arrhythmiaDetector]);

  const getCurrentRespiratoryData = useCallback(() => {
    // Respiratory data is currently not implemented
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
