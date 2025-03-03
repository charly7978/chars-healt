
import { useState, useCallback, useRef } from 'react';
import { VitalSignsProcessor } from '../modules/VitalSignsProcessor';
import { useArrhythmiaAnalyzer } from './useArrhythmiaAnalyzer';
import { createBloodPressureStabilizer } from '../utils/bloodPressureStabilizer';
import { createVitalSignsDataCollector } from '../utils/vitalSignsDataCollector';
import { useSignalHistory } from './useSignalHistory';
import { VitalSignsRisk } from '../utils/vitalSignsRisk';
import { RespirationProcessor } from '../modules/RespirationProcessor';
import { GlucoseData } from '../types/signal';

export const useVitalSignsProcessor = () => {
  // Core processor
  const processorRef = useRef<VitalSignsProcessor | null>(null);
  
  // Specialized modules
  const arrhythmiaAnalyzer = useArrhythmiaAnalyzer();
  const bloodPressureStabilizer = useRef(createBloodPressureStabilizer());
  const dataCollector = useRef(createVitalSignsDataCollector());
  const signalHistory = useSignalHistory();
  const respirationProcessorRef = useRef<RespirationProcessor | null>(null);
  
  // Glucose tracking variables
  const lastGlucoseRef = useRef<GlucoseData>({ value: 0, trend: 'unknown' });
  const glucoseUpdateCountRef = useRef(0);
  
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
   * Simulates glucose measurements based on heart rate and other vital signs
   */
  const simulateGlucoseMeasurement = useCallback((heartRateData: any, respirationData: any) => {
    // Calculate glucose value based on heart rate trends and respiration
    glucoseUpdateCountRef.current++;
    
    // Base glucose level (normal range is around 70-120 mg/dL)
    let baseGlucose = 85;
    
    // Add some variation based on heart rate if available
    if (heartRateData && heartRateData.intervals && heartRateData.intervals.length > 0) {
      const avgInterval = heartRateData.intervals.reduce((sum: number, val: number) => sum + val, 0) / heartRateData.intervals.length;
      const heartRate = Math.round(60000 / avgInterval);
      
      // Higher heart rate might suggest higher glucose levels
      if (heartRate > 80) {
        baseGlucose += (heartRate - 80) * 0.5;
      }
    }
    
    // Add variation based on respiration if available
    if (respirationData && respirationData.rate > 0) {
      // Higher respiration rate might suggest higher metabolic activity
      if (respirationData.rate > 15) {
        baseGlucose += (respirationData.rate - 15) * 1.2;
      }
    }
    
    // Add some natural variation
    const randomVariation = Math.sin(glucoseUpdateCountRef.current / 10) * 8;
    
    // Calculate final glucose value
    const glucoseValue = Math.round(baseGlucose + randomVariation);
    
    // Determine trend
    let glucoseTrend: 'stable' | 'rising' | 'falling' | 'rising_rapidly' | 'falling_rapidly' | 'unknown' = 'unknown';
    
    if (lastGlucoseRef.current.value > 0) {
      const difference = glucoseValue - lastGlucoseRef.current.value;
      
      if (Math.abs(difference) < 2) {
        glucoseTrend = 'stable';
      } else if (difference > 5) {
        glucoseTrend = 'rising_rapidly';
      } else if (difference > 2) {
        glucoseTrend = 'rising';
      } else if (difference < -5) {
        glucoseTrend = 'falling_rapidly';
      } else if (difference < -2) {
        glucoseTrend = 'falling';
      }
    } else if (glucoseUpdateCountRef.current > 5) {
      glucoseTrend = 'stable';
    }
    
    // Update last glucose value
    lastGlucoseRef.current = { value: glucoseValue, trend: glucoseTrend };
    
    // Store glucose for averaging
    if (glucoseValue > 0) {
      dataCollector.current.addGlucose(glucoseValue);
    }
    
    return lastGlucoseRef.current;
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
    
    // Process glucose measurements
    const glucoseResult = simulateGlucoseMeasurement(rrData, respirationResult);
    
    // Advanced arrhythmia analysis - asegurarse de pasar los datos de amplitud si están disponibles
    if (rrData?.intervals && rrData.intervals.length >= 4) {
      // Asegurarse de pasar los datos de amplitud al analizador de arritmias si están disponibles
      const arrhythmiaResult = arrhythmiaAnalyzer.processArrhythmia(rrData);
      
      if (arrhythmiaResult.detected) {
        return {
          spo2: result.spo2,
          pressure: stabilizedBP,
          arrhythmiaStatus: arrhythmiaResult.arrhythmiaStatus,
          lastArrhythmiaData: arrhythmiaResult.lastArrhythmiaData,
          respiration: respirationResult,
          hasRespirationData: respirationProcessor.hasValidData(),
          glucose: glucoseResult
        };
      }
      
      return {
        spo2: result.spo2,
        pressure: stabilizedBP,
        arrhythmiaStatus: arrhythmiaResult.arrhythmiaStatus,
        respiration: respirationResult,
        hasRespirationData: respirationProcessor.hasValidData(),
        glucose: glucoseResult
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
      glucose: glucoseResult
    };
  }, [getProcessor, getRespirationProcessor, arrhythmiaAnalyzer, signalHistory, simulateGlucoseMeasurement]);

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
    
    // Reset glucose tracking
    lastGlucoseRef.current = { value: 0, trend: 'unknown' };
    glucoseUpdateCountRef.current = 0;
    
    VitalSignsRisk.resetHistory();
    
    console.log("Reseteo de detección de arritmias, presión arterial, respiración y glucosa");
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
    
    // Reset glucose tracking
    lastGlucoseRef.current = { value: 0, trend: 'unknown' };
    glucoseUpdateCountRef.current = 0;
    
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
