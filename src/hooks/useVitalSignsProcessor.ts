import { useState, useCallback, useRef } from 'react';
import { VitalSignsProcessor } from '../modules/VitalSignsProcessor';
import { useArrhythmiaAnalyzer } from './useArrhythmiaAnalyzer';
import { createBloodPressureStabilizer } from '../utils/bloodPressureStabilizer';
import { createVitalSignsDataCollector } from '../utils/vitalSignsDataCollector';
import { useSignalHistory } from './useSignalHistory';
import { VitalSignsRisk } from '../utils/vitalSignsRisk';

export const useVitalSignsProcessor = () => {
  // Core processor
  const processorRef = useRef<VitalSignsProcessor | null>(null);
  
  // Specialized modules
  const arrhythmiaAnalyzer = useArrhythmiaAnalyzer();
  const bloodPressureStabilizer = useRef(createBloodPressureStabilizer());
  const dataCollector = useRef(createVitalSignsDataCollector());
  const signalHistory = useSignalHistory();
  
  // Estado para trackear la última detección de arritmia
  const lastArrhythmiaStatusRef = useRef<string>("SIN ARRITMIAS|0");
  const lastArrhythmiaDataRef = useRef<any>(null);
  
  // Constants
  const MAX_ARRHYTHMIAS_PER_SESSION = 15; // Máximo razonable para 30 segundos
  
  /**
   * Lazy initialization of the VitalSignsProcessor
   */
  const getProcessor = useCallback(() => {
    if (!processorRef.current) {
      console.log('useVitalSignsProcessor: Creando nueva instancia');
      processorRef.current = new VitalSignsProcessor();
    }
    return processorRef.current;
  }, []);
  
  /**
   * Process a new signal value and update all vitals
   */
  const processSignal = useCallback((value: number, rrData?: { intervals: number[], lastPeakTime: number | null, amplitude?: number }) => {
    const processor = getProcessor();
    const currentTime = Date.now();
    
    // Store data for analysis
    signalHistory.addSignal(value);
    
    if (rrData) {
      signalHistory.addRRData(rrData);
      
      // Smoothing BPM here
      if (rrData.intervals && rrData.intervals.length > 0) {
        // Calculate raw BPM from intervals
        const avgInterval = rrData.intervals.reduce((sum, val) => sum + val, 0) / rrData.intervals.length;
        const rawBPM = Math.round(60000 / avgInterval);
        
        // Apply smoothing through processor
        const smoothedBPM = processor.smoothBPM(rawBPM);
        
        // Replace first interval with smoothed value to propagate to heart rate display
        if (rrData.intervals.length > 0 && smoothedBPM > 0) {
          const newInterval = Math.round(60000 / smoothedBPM);
          rrData.intervals[0] = newInterval;
        }
      }
    }
    
    // IMPORTANTE: Asegurar que pasamos la amplitud al procesador de signos vitales
    const result = processor.processSignal(
      value, 
      rrData
    );
    
    // Stabilize blood pressure
    const signalQuality = signalHistory.getSignalQuality();
    const stabilizedBP = bloodPressureStabilizer.current.stabilizeBloodPressure(result.pressure, signalQuality);
    
    // Collect data for final averages
    if (result.spo2 > 0) {
      dataCollector.current.addSpO2(result.spo2);
    }
    
    if (stabilizedBP !== "--/--" && stabilizedBP !== "0/0") {
      dataCollector.current.addBloodPressure(stabilizedBP);
    }
    
    // ESQUEMA COORDINADO DE DETECCIÓN DE ARRITMIAS:
    // 1. Primero revisamos el resultado del detector interno del VitalSignsProcessor
    // 2. Si no detectó arritmias, permitimos que el arrhythmiaAnalyzer independiente lo intente
    // 3. Combinamos los resultados de manera coherente
    
    // Actualizar la detección del procesador interno
    let finalArrhythmiaStatus = result.arrhythmiaStatus || "SIN ARRITMIAS|0";
    let finalArrhythmiaData = result.lastArrhythmiaData || null;
    let arrhythmiaDetected = result.arrhythmiaStatus?.includes("ARRITMIA DETECTADA");
    
    // Si el detector principal no detectó arritmias, permitimos que el analizador independiente lo intente
    if (!arrhythmiaDetected && rrData?.intervals && rrData.intervals.length >= 4) {
      const arrhythmiaResult = arrhythmiaAnalyzer.processArrhythmia(rrData, MAX_ARRHYTHMIAS_PER_SESSION);
      
      // Si el analizador independiente detectó una arritmia, usamos su resultado
      if (arrhythmiaResult.detected) {
        finalArrhythmiaStatus = arrhythmiaResult.arrhythmiaStatus;
        finalArrhythmiaData = arrhythmiaResult.lastArrhythmiaData;
        arrhythmiaDetected = true;
        
        console.log("useVitalSignsProcessor: Arritmia detectada por analizador independiente", {
          status: finalArrhythmiaStatus,
          time: new Date().toISOString()
        });
      }
    }
    
    // Actualizar referencias de estado
    lastArrhythmiaStatusRef.current = finalArrhythmiaStatus;
    if (finalArrhythmiaData) {
      lastArrhythmiaDataRef.current = finalArrhythmiaData;
    }
    
    // Devolver los resultados combinados
    return {
      spo2: result.spo2,
      pressure: stabilizedBP,
      arrhythmiaStatus: finalArrhythmiaStatus,
      lastArrhythmiaData: finalArrhythmiaData
    };
  }, [getProcessor, signalHistory, arrhythmiaAnalyzer]);

  /**
   * Reset all processors and data
   */
  const reset = useCallback(() => {
    console.log("useVitalSignsProcessor: Reset iniciado");
    
    // Reset main processor
    if (processorRef.current) {
      try {
        processorRef.current.reset();
      } catch (err) {
        console.error("useVitalSignsProcessor: Error al resetear procesador, creando nueva instancia", err);
        processorRef.current = new VitalSignsProcessor();
      }
    } else {
      processorRef.current = new VitalSignsProcessor();
    }
    
    // Reset all specialized modules
    arrhythmiaAnalyzer.reset(); // Resetear también el analizador independiente
    bloodPressureStabilizer.current.reset();
    dataCollector.current.reset();
    signalHistory.reset();
    VitalSignsRisk.resetHistory();
    
    // Reset arrhythmia tracking
    lastArrhythmiaStatusRef.current = "SIN ARRITMIAS|0";
    lastArrhythmiaDataRef.current = null;
    
    console.log("useVitalSignsProcessor: Reset completo");
  }, [signalHistory, arrhythmiaAnalyzer]);
  
  /**
   * Aggressive memory cleanup
   */
  const cleanMemory = useCallback(() => {
    console.log("useVitalSignsProcessor: Limpieza agresiva de memoria");
    
    // First reset all state
    reset();
    
    // Then destroy and recreate everything
    processorRef.current = new VitalSignsProcessor();
    bloodPressureStabilizer.current = createBloodPressureStabilizer();
    dataCollector.current = createVitalSignsDataCollector();
    
    // Reset arrhythmia tracking
    lastArrhythmiaStatusRef.current = "SIN ARRITMIAS|0";
    lastArrhythmiaDataRef.current = null;
    
    // Force garbage collection if available
    if (window.gc) {
      try {
        window.gc();
      } catch (e) {
        console.log("GC no disponible en este entorno");
      }
    }
    
    console.log("useVitalSignsProcessor: Limpieza de memoria completada");
  }, [reset]);

  // Obtener el contador combinado de arritmias
  const getArrhythmiaCounter = useCallback(() => {
    // Intentar extraer el conteo del estado actual
    const status = lastArrhythmiaStatusRef.current;
    const parts = status.split('|');
    
    let count = 0;
    if (parts.length > 1) {
      const statusCount = parseInt(parts[1], 10);
      if (!isNaN(statusCount)) {
        count = statusCount;
      }
    }
    
    // Combinar con el contador del analizador independiente
    const analyzerCount = arrhythmiaAnalyzer.arrhythmiaCounter || 0;
    
    // Usar el contador mayor de los dos
    return Math.max(count, analyzerCount);
  }, [arrhythmiaAnalyzer]);

  return {
    processSignal,
    reset,
    cleanMemory,
    arrhythmiaCounter: getArrhythmiaCounter(),
    dataCollector: dataCollector.current
  };
};
