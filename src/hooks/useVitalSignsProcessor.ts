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
    console.log('useVitalSignsProcessor: Procesando señal', { rrData: !!rrData });
    
    // PASO 1: Procesar la señal PPG para obtener signos vitales básicos
    const vitalSignsResult = processor.processSignal(ppgValue, rrData);
    
    // PASO 2: Procesar glucosa
    const glucoseResult = glucoseProcessor.processSignal(ppgValue);
    
    // PASO 3: Detección especial de arritmias usando intervalos RR
    let arrhythmiaResult: ArrhythmiaResult = {
      detected: false,
      severity: 0,
      confidence: 0,
      type: "NONE" as ArrhythmiaType,
      timestamp: Date.now()
    };
    
    // Verificar si tenemos datos RR válidos para análisis
    if (rrData && Array.isArray(rrData.intervals) && rrData.intervals.length > 0) {
      const minIntervalsRequired = 2; // Mínimo necesario para latidos prematuros
      
      console.log('useVitalSignsProcessor: Analizando RR para latidos prematuros:', {
        intervals: rrData.intervals.length
      });
      
      try {
        // Procesar amplitudes si están disponibles
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
        
        // Filtrar intervalos para usar sólo los que estén en rango fisiológico
        const validIntervals = rrData.intervals.filter(i => 
          typeof i === 'number' && !isNaN(i) && i > 200 && i < 2000
        );
        
        // Sólo procesar si tenemos suficientes intervalos válidos
        if (validIntervals.length >= minIntervalsRequired) {
          // Actualizar tiempo de pico si está disponible
          if (rrData.lastPeakTime !== null) {
            arrhythmiaDetector.setLastPeakTime(rrData.lastPeakTime);
          }
          
          // Detectar latidos prematuros con el detector especializado
          arrhythmiaResult = arrhythmiaDetector.processRRIntervals(
            validIntervals,
            amplitudesToUse
          );
          
          // Máximo detalle cuando se detecta un latido prematuro
          if (arrhythmiaResult.detected) {
            console.log('useVitalSignsProcessor: ¡LATIDO PREMATURO DETECTADO!', {
              type: arrhythmiaResult.type,
              severity: arrhythmiaResult.severity,
              confidence: arrhythmiaResult.confidence
            });
          }
        } else {
          console.log(`useVitalSignsProcessor: Intervalos insuficientes: ${validIntervals.length}/${minIntervalsRequired}`);
        }
      } catch (error) {
        console.error('useVitalSignsProcessor: Error procesando arritmias:', error);
      }
    }
    
    // PASO 4: Construir el resultado final integrando todos los datos
    const result: VitalSignsResult = {
      spo2: vitalSignsResult.spo2,
      pressure: vitalSignsResult.pressure,
      arrhythmiaStatus: arrhythmiaDetector.getStatusText(), // Obtener estado directamente del detector
      lastArrhythmiaData: arrhythmiaResult.detected ? {
        timestamp: arrhythmiaResult.timestamp,
        rmssd: 0,
        rrVariation: 0,
        prematureBeat: true, // Siempre true porque solo detectamos latidos prematuros
        confidence: arrhythmiaResult.confidence
      } : null,
      respiratoryRate: vitalSignsResult.respiratoryRate,
      respiratoryPattern: vitalSignsResult.respiratoryPattern,
      respiratoryConfidence: vitalSignsResult.respiratoryConfidence
    };
    
    // Actualizar estado y devolver resultado
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
