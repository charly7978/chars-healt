
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
  
  // Add throttling to prevent excessive processing
  const lastProcessTimeRef = useRef<number>(0);
  const throttleInterval = 100; // Increased to 100ms
  
  // Track initialization status
  const initializedRef = useRef<boolean>(false);
  
  /**
   * Lazy initialization of the VitalSignsProcessor
   */
  const getProcessor = useCallback(() => {
    if (!processorRef.current) {
      console.log('useVitalSignsProcessor: Creating new instance');
      processorRef.current = new VitalSignsProcessor();
      initializedRef.current = true;
    }
    return processorRef.current;
  }, []);
  
  /**
   * Lazy initialization of the RespirationProcessor
   */
  const getRespirationProcessor = useCallback(() => {
    if (!respirationProcessorRef.current) {
      console.log('useVitalSignsProcessor: Creating RespirationProcessor instance');
      respirationProcessorRef.current = new RespirationProcessor();
    }
    return respirationProcessorRef.current;
  }, []);
  
  /**
   * Process a new signal value and update all vitals
   */
  const processSignal = useCallback((value: number, rrData?: { intervals: number[], lastPeakTime: number | null, amplitudes?: number[] }) => {
    // Add throttling to prevent excessive processing
    const currentTime = Date.now();
    if (currentTime - lastProcessTimeRef.current < throttleInterval) {
      return null; // Skip processing if called too frequently
    }
    
    if (!initializedRef.current) {
      getProcessor(); // Ensure processor is initialized
    }
    
    lastProcessTimeRef.current = currentTime;
    
    const processor = getProcessor();
    const respirationProcessor = getRespirationProcessor();
    
    // Validate signal value
    if (isNaN(value) || !isFinite(value)) {
      console.error('useVitalSignsProcessor: Invalid signal value received:', value);
      return null;
    }
    
    // Store data for analysis
    signalHistory.addSignal(value);
    
    let peakAmplitude: number | undefined;
    
    if (rrData) {
      // Validate RR data
      if (rrData.intervals && Array.isArray(rrData.intervals)) {
        signalHistory.addRRData(rrData);
        
        // Get peak amplitude if available for respiratory analysis
        if (rrData.amplitudes && rrData.amplitudes.length > 0) {
          peakAmplitude = rrData.amplitudes[rrData.amplitudes.length - 1];
        }
        
        // Smoothing BPM here
        if (rrData.intervals.length > 0) {
          // Calculate raw BPM from intervals
          const validIntervals = rrData.intervals.filter(i => i > 200 && i < 2000);
          if (validIntervals.length > 0) {
            const avgInterval = validIntervals.reduce((sum, val) => sum + val, 0) / validIntervals.length;
            const rawBPM = Math.round(60000 / avgInterval);
            
            // Apply smoothing through processor
            if (rawBPM > 40 && rawBPM < 200) {
              const smoothedBPM = processor.smoothBPM(rawBPM);
              
              // Replace first interval with smoothed value to propagate to heart rate display
              if (smoothedBPM > 0 && validIntervals.length > 0) {
                const newInterval = Math.round(60000 / smoothedBPM);
                validIntervals[0] = newInterval;
              }
            }
          }
        }
      } else {
        console.warn('useVitalSignsProcessor: Invalid RR data:', rrData);
      }
    }
    
    // Get base results from the core processor
    const result = processor.processSignal(value, rrData);
    
    // If result is null (throttled), return previous state
    if (!result) {
      return null;
    }
    
    // Process respiratory data
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
    
    // Advanced arrhythmia analysis - ensure amplitude data is passed if available
    if (rrData?.intervals && rrData.intervals.length >= 4) {
      // Pass amplitude data to arrhythmia analyzer if available
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
    
    // If we've already analyzed arrhythmias before, use the last status
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
    console.log('useVitalSignsProcessor: Resetting all processors');
    if (processorRef.current) {
      processorRef.current.reset();
    } else {
      processorRef.current = new VitalSignsProcessor();
    }
    initializedRef.current = true;
    
    // Reset all specialized modules
    arrhythmiaAnalyzer.reset();
    bloodPressureStabilizer.current.reset();
    dataCollector.current.reset();
    signalHistory.reset();
    
    if (respirationProcessorRef.current) {
      respirationProcessorRef.current.reset();
    } else {
      respirationProcessorRef.current = new RespirationProcessor();
    }
    
    VitalSignsRisk.resetHistory();
    lastProcessTimeRef.current = 0;
    
    console.log("Reset of arrhythmia detection, blood pressure, and respiration complete");
  }, [arrhythmiaAnalyzer, signalHistory]);
  
  /**
   * Aggressive memory cleanup
   */
  const cleanMemory = useCallback(() => {
    console.log("useVitalSignsProcessor: Aggressive memory cleanup");
    
    // Destroy current processor and create a new one
    if (processorRef.current) {
      processorRef.current.reset();
      processorRef.current = null;
    }
    initializedRef.current = false;
    
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
    lastProcessTimeRef.current = 0;
    
    // Force garbage collection if available
    if (window.gc) {
      try {
        window.gc();
      } catch (e) {
        console.log("GC not available in this environment");
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
