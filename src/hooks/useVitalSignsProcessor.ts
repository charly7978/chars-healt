
import { useState, useCallback, useRef } from 'react';
import { VitalSignsProcessor } from '../modules/VitalSignsProcessor';
import { ArrhythmiaDetector } from '../modules/ArrhythmiaDetector';
import { createBloodPressureStabilizer } from '../utils/bloodPressureStabilizer';
import { createVitalSignsDataCollector } from '../utils/vitalSignsDataCollector';
import { useSignalHistory } from './useSignalHistory';
import { VitalSignsRisk } from '../utils/vitalSignsRisk';

export const useVitalSignsProcessor = () => {
  // Core processor
  const processorRef = useRef<VitalSignsProcessor | null>(null);
  
  // Specialized modules - IMPORTANTE: Ahora usamos directamente ArrhythmiaDetector
  const arrhythmiaDetectorRef = useRef<ArrhythmiaDetector | null>(null);
  const bloodPressureStabilizer = useRef(createBloodPressureStabilizer());
  const dataCollector = useRef(createVitalSignsDataCollector());
  const signalHistory = useSignalHistory();
  
  // Estado para el contador de arritmias
  const [arrhythmiaCounter, setArrhythmiaCounter] = useState(0);
  
  /**
   * Lazy initialization of the VitalSignsProcessor and ArrhythmiaDetector
   */
  const getProcessor = useCallback(() => {
    if (!processorRef.current) {
      console.log('useVitalSignsProcessor: Creando nueva instancia de procesador');
      processorRef.current = new VitalSignsProcessor();
    }
    return processorRef.current;
  }, []);
  
  const getArrhythmiaDetector = useCallback(() => {
    if (!arrhythmiaDetectorRef.current) {
      console.log('useVitalSignsProcessor: Creando nueva instancia de detector de arritmias');
      arrhythmiaDetectorRef.current = new ArrhythmiaDetector();
    }
    return arrhythmiaDetectorRef.current;
  }, []);
  
  /**
   * Process a new signal value and update all vitals
   */
  const processSignal = useCallback((value: number, rrData?: { intervals: number[], lastPeakTime: number | null, amplitudes?: number[] }) => {
    const processor = getProcessor();
    const arrhythmiaDetector = getArrhythmiaDetector();
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
      
      // IMPORTANTE: Actualizar los intervalos en el detector de arritmias
      if (rrData.intervals && rrData.intervals.length > 0) {
        const peakAmplitude = rrData.amplitudes && rrData.amplitudes.length > 0 
          ? rrData.amplitudes[rrData.amplitudes.length - 1] 
          : undefined;
        
        arrhythmiaDetector.updateIntervals(rrData.intervals, rrData.lastPeakTime, peakAmplitude);
      }
    }
    
    // Get base results from the core processor
    const result = processor.processSignal(value, rrData);
    
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
    
    // IMPORTANTE: Usar exclusivamente ArrhythmiaDetector para la detección de arritmias
    const arrhythmiaResult = arrhythmiaDetector.detect();
    
    // Actualizar el contador si se detectó una nueva arritmia
    if (arrhythmiaResult.detected && arrhythmiaResult.count !== arrhythmiaCounter) {
      setArrhythmiaCounter(arrhythmiaResult.count);
    }
    
    return {
      spo2: result.spo2,
      pressure: stabilizedBP,
      arrhythmiaStatus: arrhythmiaResult.status,
      lastArrhythmiaData: arrhythmiaResult.detected ? {
        timestamp: currentTime,
        rmssd: arrhythmiaResult.data?.rmssd || 0,
        rrVariation: arrhythmiaResult.data?.rrVariation || 0,
        isPrematureBeat: arrhythmiaResult.data?.prematureBeat || false,
        confidence: arrhythmiaResult.data?.confidence || 0
      } : null
    };
  }, [getProcessor, getArrhythmiaDetector, arrhythmiaCounter, signalHistory]);

  /**
   * Reset all processors and data
   */
  const reset = useCallback(() => {
    if (processorRef.current) {
      processorRef.current.reset();
    }
    
    // Reset all specialized modules
    if (arrhythmiaDetectorRef.current) {
      arrhythmiaDetectorRef.current.reset();
    }
    
    setArrhythmiaCounter(0);
    bloodPressureStabilizer.current.reset();
    dataCollector.current.reset();
    signalHistory.reset();
    VitalSignsRisk.resetHistory();
    
    console.log("Reseteo de detección de arritmias y presión arterial");
  }, [signalHistory]);
  
  /**
   * Aggressive memory cleanup
   */
  const cleanMemory = useCallback(() => {
    console.log("useVitalSignsProcessor: Limpieza agresiva de memoria");
    
    // Destroy current processor and create a new one
    if (processorRef.current) {
      processorRef.current.reset();
      processorRef.current = new VitalSignsProcessor();
    }
    
    // Reset arrhythmia detector
    if (arrhythmiaDetectorRef.current) {
      arrhythmiaDetectorRef.current.cleanMemory();
      arrhythmiaDetectorRef.current = new ArrhythmiaDetector();
    }
    
    setArrhythmiaCounter(0);
    bloodPressureStabilizer.current.reset();
    dataCollector.current.reset();
    signalHistory.reset();
    VitalSignsRisk.resetHistory();
    
    // Force garbage collection if available
    if (window.gc) {
      try {
        window.gc();
      } catch (e) {
        console.log("GC no disponible en este entorno");
      }
    }
  }, [signalHistory]);

  return {
    processSignal,
    reset,
    cleanMemory,
    arrhythmiaCounter,
    dataCollector: dataCollector.current
  };
};
