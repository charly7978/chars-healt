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
    // Procesamiento normal de signos vitales
    console.log('useVitalSignsProcessor: Procesando señal con datos:', {
      ppgValue,
      rrIntervals: rrData?.intervals?.length || 0,
      amplitudes: rrData?.amplitudes?.length || 0
    });
    
    const vitalSignsResult = processor.processSignal(ppgValue, rrData);
    
    console.log('Estado de arritmia del procesador:', vitalSignsResult.arrhythmiaStatus);
    
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
      // Sólo necesitamos 2 intervalos para la detección de latidos prematuros
      const minIntervalsRequired = 2;
      
      console.log('useVitalSignsProcessor: Analizando intervalos RR para latidos prematuros:', {
        intervals: rrData.intervals.length,
        intervalsData: rrData.intervals,
        amplitudes: Array.isArray(rrData.amplitudes) ? rrData.amplitudes.length : 0
      });
      
      try {
        // Intentamos usar amplitudes si existen
        let amplitudesToUse = Array(rrData.intervals.length).fill(100);
        
        if (Array.isArray(rrData.amplitudes) && rrData.amplitudes.length > 0) {
          if (rrData.amplitudes.length === rrData.intervals.length) {
            amplitudesToUse = rrData.amplitudes;
          } else {
            amplitudesToUse = Array(rrData.intervals.length).fill(0).map((_, i) => {
              return i < rrData.amplitudes.length ? rrData.amplitudes[i] : 100;
            });
          }
        }
        
        // MEJORA: Utilizamos todos los intervalos disponibles, sólo validando que sean números
        const validIntervals = rrData.intervals.filter(i => 
          typeof i === 'number' && !isNaN(i) && i > 200 && i < 2000 // Rango más amplio
        );
        
        if (validIntervals.length >= minIntervalsRequired) {
          // Forzar actualización del detector si hay tiempo de pico
          if (rrData.lastPeakTime !== null) {
            arrhythmiaDetector.setLastPeakTime(rrData.lastPeakTime);
          }
          
          // Procesar los intervalos para detección de latidos prematuros
          arrhythmiaResult = arrhythmiaDetector.processRRIntervals(
            validIntervals,
            amplitudesToUse
          );
          
          // Log detallado del resultado para depuración
          console.log('useVitalSignsProcessor: Resultado análisis latidos prematuros:', {
            detected: arrhythmiaResult.detected,
            type: arrhythmiaResult.type,
            severity: arrhythmiaResult.severity,
            confidence: arrhythmiaResult.confidence
          });
          
          if (arrhythmiaResult.detected) {
            console.log('useVitalSignsProcessor: ¡¡LATIDO PREMATURO DETECTADO!!', {
              type: arrhythmiaResult.type,
              severity: arrhythmiaResult.severity,
              confidence: arrhythmiaResult.confidence,
              timestamp: arrhythmiaResult.timestamp
            });
          }
        } else {
          console.log(`useVitalSignsProcessor: Intervalos válidos insuficientes (${validIntervals.length}/${minIntervalsRequired})`);
        }
      } catch (error) {
        console.error('useVitalSignsProcessor: Error al procesar arritmias:', error);
      }
    } else {
      console.log('useVitalSignsProcessor: No hay intervalos RR para procesar');
    }
    
    // Construir el resultado final con los datos de latido prematuro
    const result: VitalSignsResult = {
      spo2: vitalSignsResult.spo2,
      pressure: vitalSignsResult.pressure,
      arrhythmiaStatus: vitalSignsResult.arrhythmiaStatus, // Este incluye el contador de latidos prematuros
      lastArrhythmiaData: arrhythmiaResult.detected ? {
        timestamp: arrhythmiaResult.timestamp,
        rmssd: 0, // Ya no usamos RMSSD para latidos prematuros
        rrVariation: 0, // Ya no usamos variación RR para latidos prematuros
        prematureBeat: true, // Marcamos explícitamente como latido prematuro
        confidence: arrhythmiaResult.confidence
      } : null,
      respiratoryRate: vitalSignsResult.respiratoryRate,
      respiratoryPattern: vitalSignsResult.respiratoryPattern,
      respiratoryConfidence: vitalSignsResult.respiratoryConfidence
    };
    
    // Actualizar el estado con los nuevos datos
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
