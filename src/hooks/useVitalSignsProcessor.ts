
import { useState, useCallback, useRef } from 'react';
import { VitalSignsProcessor } from '../modules/VitalSignsProcessor';
import { useArrhythmiaAnalyzer } from './useArrhythmiaAnalyzer';
import { createBloodPressureStabilizer } from '../utils/bloodPressureStabilizer';
import { createVitalSignsDataCollector } from '../utils/vitalSignsDataCollector';
import { useSignalHistory } from './useSignalHistory';
import { VitalSignsRisk } from '../utils/vitalSignsRisk';

export const useVitalSignsProcessor = () => {
  // Procesador principal
  const processorRef = useRef<VitalSignsProcessor | null>(null);
  
  // Módulos especializados
  const arrhythmiaAnalyzer = useArrhythmiaAnalyzer();
  const bloodPressureStabilizer = useRef(createBloodPressureStabilizer());
  const dataCollector = useRef(createVitalSignsDataCollector());
  const signalHistory = useSignalHistory();
  
  // Constantes
  const MAX_ARRHYTHMIAS_PER_SESSION = 15; // Máximo razonable para 30 segundos
  
  /**
   * Inicialización perezosa del VitalSignsProcessor
   */
  const getProcessor = useCallback(() => {
    if (!processorRef.current) {
      console.log('useVitalSignsProcessor: Creando nueva instancia');
      processorRef.current = new VitalSignsProcessor();
    }
    return processorRef.current;
  }, []);
  
  /**
   * Procesar un nuevo valor de señal y actualizar todos los vitales
   */
  const processSignal = useCallback((value: number, rrData?: { intervals: number[], lastPeakTime: number | null }) => {
    const processor = getProcessor();
    const currentTime = Date.now();
    
    // Almacenar datos para análisis
    signalHistory.addSignal(value);
    
    if (rrData) {
      signalHistory.addRRData(rrData);
      
      // Suavizado de BPM aquí
      if (rrData.intervals && rrData.intervals.length > 0) {
        // Calcular BPM crudo desde intervalos
        const avgInterval = rrData.intervals.reduce((sum, val) => sum + val, 0) / rrData.intervals.length;
        const rawBPM = Math.round(60000 / avgInterval);
        
        // Aplicar suavizado mínimo a través del procesador
        const smoothedBPM = processor.smoothBPM(rawBPM);
        
        // Reemplazar primer intervalo con valor suavizado para propagar a la visualización
        if (rrData.intervals.length > 0 && smoothedBPM > 0) {
          const newInterval = Math.round(60000 / smoothedBPM);
          rrData.intervals[0] = newInterval;
        }
      }
    }
    
    // Obtener resultados base del procesador principal
    const result = processor.processSignal(value, rrData);
    console.log("useVitalSignsProcessor: Resultados brutos:", 
                { spo2: result.spo2, pressure: result.pressure });
    
    // Estabilizar presión arterial pasándola directamente
    const signalQuality = signalHistory.getSignalQuality();
    const stabilizedBP = bloodPressureStabilizer.current.stabilizeBloodPressure(result.pressure, signalQuality);
    console.log("useVitalSignsProcessor: BP estabilizada:", stabilizedBP);
    
    // Recopilar datos para promedios finales solo si son valores válidos
    if (result.spo2 > 90 && result.spo2 <= 100) {
      dataCollector.current.addSpO2(result.spo2);
      console.log("useVitalSignsProcessor: SpO2 añadido al colector:", result.spo2);
    }
    
    if (stabilizedBP !== "--/--" && stabilizedBP !== "0/0" && stabilizedBP !== "EVALUANDO") {
      dataCollector.current.addBloodPressure(stabilizedBP);
      console.log("useVitalSignsProcessor: BP añadida al colector:", stabilizedBP);
    }
    
    // Análisis avanzado de arritmias
    if (rrData?.intervals && rrData.intervals.length >= 4) {
      const arrhythmiaResult = arrhythmiaAnalyzer.processArrhythmia(rrData, MAX_ARRHYTHMIAS_PER_SESSION);
      
      if (arrhythmiaResult.detected) {
        return {
          spo2: result.spo2,
          pressure: stabilizedBP,
          arrhythmiaStatus: arrhythmiaResult.arrhythmiaStatus,
          lastArrhythmiaData: arrhythmiaResult.lastArrhythmiaData
        };
      }
      
      return {
        spo2: result.spo2,
        pressure: stabilizedBP,
        arrhythmiaStatus: arrhythmiaResult.arrhythmiaStatus
      };
    }
    
    // Si ya analizamos arritmias antes, usar el último estado
    const arrhythmiaStatus = `SIN ARRITMIAS|${arrhythmiaAnalyzer.arrhythmiaCounter}`;
    
    return {
      spo2: result.spo2,
      pressure: stabilizedBP,
      arrhythmiaStatus
    };
  }, [getProcessor, arrhythmiaAnalyzer, signalHistory]);

  /**
   * Resetear todos los procesadores y datos
   */
  const reset = useCallback(() => {
    if (processorRef.current) {
      processorRef.current.reset();
    }
    
    // Resetear todos los módulos especializados
    arrhythmiaAnalyzer.reset();
    bloodPressureStabilizer.current.reset();
    dataCollector.current.reset();
    signalHistory.reset();
    VitalSignsRisk.resetHistory();
    
    console.log("Reseteo de detección de arritmias y presión arterial");
  }, [arrhythmiaAnalyzer, signalHistory]);
  
  /**
   * Limpieza agresiva de memoria
   */
  const cleanMemory = useCallback(() => {
    console.log("useVitalSignsProcessor: Limpieza agresiva de memoria");
    
    // Destruir procesador actual y crear uno nuevo
    if (processorRef.current) {
      processorRef.current.reset();
      processorRef.current = new VitalSignsProcessor();
    }
    
    // Resetear todos los módulos especializados
    arrhythmiaAnalyzer.reset();
    bloodPressureStabilizer.current.reset();
    dataCollector.current.reset();
    signalHistory.reset();
    VitalSignsRisk.resetHistory();
    
    // Forzar la recolección de basura si está disponible
    if (window.gc) {
      try {
        window.gc();
      } catch (e) {
        console.log("GC no disponible en este entorno");
      }
    }
  }, [arrhythmiaAnalyzer, signalHistory]);

  return {
    processSignal,
    reset,
    cleanMemory,
    arrhythmiaCounter: arrhythmiaAnalyzer.arrhythmiaCounter,
    dataCollector: dataCollector.current
  };
};
