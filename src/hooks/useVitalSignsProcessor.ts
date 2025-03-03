
import { useState, useCallback, useRef } from 'react';
import { VitalSignsProcessor } from '../modules/VitalSignsProcessor';
import { useArrhythmiaAnalyzer } from './useArrhythmiaAnalyzer';
import { createBloodPressureStabilizer } from '../utils/bloodPressureStabilizer';
import { createVitalSignsDataCollector } from '../utils/vitalSignsDataCollector';
import { useSignalHistory } from './useSignalHistory';
import { VitalSignsRisk } from '../utils/vitalSignsRisk';
import { RespirationProcessor } from '../modules/RespirationProcessor';
import { BloodGlucoseData } from '../types/signal';

export const useVitalSignsProcessor = () => {
  // Core processor
  const processorRef = useRef<VitalSignsProcessor | null>(null);
  
  // Specialized modules
  const arrhythmiaAnalyzer = useArrhythmiaAnalyzer();
  const bloodPressureStabilizer = useRef(createBloodPressureStabilizer());
  const dataCollector = useRef(createVitalSignsDataCollector());
  const signalHistory = useSignalHistory();
  const respirationProcessorRef = useRef<RespirationProcessor | null>(null);
  
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
   * Lazy initialization of the RespirationProcessor
   */
  const getRespirationProcessor = useCallback(() => {
    if (!respirationProcessorRef.current) {
      console.log('useVitalSignsProcessor: Creando instancia de RespirationProcessor');
      respirationProcessorRef.current = new RespirationProcessor();
    }
    return respirationProcessorRef.current;
  }, []);
  
  /**
   * Process a new signal value and update all vitals
   */
  const processSignal = useCallback((value: number, rrData?: { intervals: number[], lastPeakTime: number | null, amplitudes?: number[] }) => {
    const processor = getProcessor();
    const respirationProcessor = getRespirationProcessor();
    const currentTime = Date.now();
    
    // Store data for analysis
    signalHistory.addSignal(value);
    
    let peakAmplitude: number | undefined;
    
    if (rrData) {
      signalHistory.addRRData(rrData);
      
      // Obtener amplitud del pico si está disponible para análisis respiratorio
      if (rrData.amplitudes && rrData.amplitudes.length > 0) {
        peakAmplitude = rrData.amplitudes[rrData.amplitudes.length - 1];
      }
      
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
    
    // Get base results from the core processor
    const result = processor.processSignal(value, rrData);
    
    // Procesar datos respiratorios
    const respirationResult = respirationProcessor.processSignal(value, peakAmplitude);
    
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
    
    if (respirationResult.rate > 0) {
      dataCollector.current.addRespirationRate(respirationResult.rate);
    }
    
    if (respirationResult.depth > 0) {
      dataCollector.current.addRespirationDepth(respirationResult.depth);
    }
    
    // Add glucose data to collector
    if (result.glucose && result.glucose.value > 0) {
      dataCollector.current.addBloodGlucose(result.glucose);
    }
    
    // Advanced arrhythmia analysis - asegurarse de pasar los datos de amplitud si están disponibles
    if (rrData?.intervals && rrData.intervals.length >= 4) {
      // Asegurarse de pasar los datos de amplitud al analizador de arritmias si están disponibles
      const arrhythmiaResult = arrhythmiaAnalyzer.processArrhythmia(rrData);
      
      const glucoseValue = result.glucose?.value || 0;
      const glucoseTrend = result.glucose?.trend || 'stable';
      const glucoseConfidence = result.glucose?.confidence || 0;
      
      if (arrhythmiaResult.detected) {
        return {
          spo2: result.spo2,
          pressure: stabilizedBP,
          arrhythmiaStatus: arrhythmiaResult.arrhythmiaStatus,
          lastArrhythmiaData: arrhythmiaResult.lastArrhythmiaData,
          respiration: respirationResult,
          hasRespirationData: respirationProcessor.hasValidData(),
          glucose: glucoseValue,
          glucoseTrend,
          glucoseConfidence
        };
      }
      
      return {
        spo2: result.spo2,
        pressure: stabilizedBP,
        arrhythmiaStatus: arrhythmiaResult.arrhythmiaStatus,
        respiration: respirationResult,
        hasRespirationData: respirationProcessor.hasValidData(),
        glucose: glucoseValue,
        glucoseTrend,
        glucoseConfidence
      };
    }
    
    // Si ya analizamos arritmias antes, usar el último estado
    const arrhythmiaStatus = `SIN ARRITMIAS|${arrhythmiaAnalyzer.arrhythmiaCounter}`;
    
    return {
      spo2: result.spo2,
      pressure: stabilizedBP,
      arrhythmiaStatus,
      respiration: respirationResult,
      hasRespirationData: respirationProcessor.hasValidData(),
      glucose: result.glucose?.value || 0,
      glucoseTrend: result.glucose?.trend || 'stable',
      glucoseConfidence: result.glucose?.confidence || 0
    };
  }, [getProcessor, getRespirationProcessor, arrhythmiaAnalyzer, signalHistory]);

  /**
   * Reset all processors
   */
  const reset = useCallback(() => {
    if (processorRef.current) {
      processorRef.current.reset();
    }
    
    // Reset all specialized modules
    arrhythmiaAnalyzer.reset();
    bloodPressureStabilizer.current.reset();
    dataCollector.current.reset();
    signalHistory.reset();
    
    if (respirationProcessorRef.current) {
      respirationProcessorRef.current.reset();
    }
    
    VitalSignsRisk.resetHistory();
    
    console.log("Reseteo de detección de arritmias, presión arterial y respiración");
  }, [arrhythmiaAnalyzer, signalHistory]);
  
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
    
    // Reset all specialized modules
    arrhythmiaAnalyzer.reset();
    bloodPressureStabilizer.current.reset();
    dataCollector.current.reset();
    signalHistory.reset();
    
    if (respirationProcessorRef.current) {
      respirationProcessorRef.current.reset();
      respirationProcessorRef.current = null;
    }
    
    VitalSignsRisk.resetHistory();
    
    // Force garbage collection if available
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
