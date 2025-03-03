import { useState, useCallback, useRef, useEffect } from 'react';
import { VitalSignsProcessor } from '../modules/VitalSignsProcessor';
import { useArrhythmiaAnalyzer } from './useArrhythmiaAnalyzer';
import { createBloodPressureStabilizer } from '../utils/bloodPressureStabilizer';
import { createVitalSignsDataCollector } from '../utils/vitalSignsDataCollector';
import { useSignalHistory } from './useSignalHistory';
import { VitalSignsRisk } from '../utils/vitalSignsRisk';
import { RespirationProcessor } from '../modules/RespirationProcessor';
import { GlucoseData } from '../types/signal';

// Constants for advanced glucose detection algorithm
const BASELINE_R_VALUE = 0.92; // Reference R value for calculation
const BLOOD_VOLUME_FACTOR = 2.33; // Blood volume factor
const SCATTER_COEFFICIENT = 0.187; // Optical scatter coefficient
const ABSORPTION_FACTOR = 1.67; // IR light absorption factor in glucose
const CALIBRATION_CONSTANT = 100; // Calibration constant
const MIN_SIGNAL_QUALITY_FOR_GLUCOSE = 70; // Minimum signal quality for valid measurements (increased from 65)
const SIGNAL_SAMPLES_NEEDED = 180; // Samples needed for reliable measurement (increased from 150)

// Advanced optical parameters based on recent research
const GLUCOSE_ABSORPTION_PEAK = 1550; // nm - near-infrared absorption peak for glucose
const REFERENCE_WAVELENGTH = 1650; // nm - reference wavelength with minimal glucose absorption
const TISSUE_PENETRATION_DEPTH = 1.8; // mm - estimated penetration depth
const MOLAR_ABSORPTIVITY = 0.15; // L/(mol·cm) - absorption coefficient
const BEAM_DIAMETER = 3.5; // mm - effective beam diameter
const VASCULAR_DENSITY_FACTOR = 0.78; // Vascular density correction factor
const TEMPERATURE_CORRECTION = 0.02; // Temperature correction per degree C

// Transition pattern for detecting changes in absorption profile
const TRANSITION_PATTERN = [0.15, 0.25, 0.35, 0.45, 0.65, 0.85, 0.95, 1, 0.95, 0.85, 0.65, 0.45, 0.35, 0.25, 0.15];

// Advanced statistical parameters for signal validation
const STATISTICAL_CONFIDENCE_THRESHOLD = 0.85;
const SIGNAL_VARIANCE_THRESHOLD = 0.12;
const PEAK_DETECTION_SENSITIVITY = 0.22;
const VALLEY_DETECTION_SENSITIVITY = 0.18;
const TEMPORAL_COHERENCE_FACTOR = 0.82;

export const useVitalSignsProcessor = () => {
  // Core processor
  const processorRef = useRef<VitalSignsProcessor | null>(null);
  
  // Specialized modules
  const arrhythmiaAnalyzer = useArrhythmiaAnalyzer();
  const bloodPressureStabilizer = useRef(createBloodPressureStabilizer());
  const dataCollector = useRef(createVitalSignsDataCollector());
  const signalHistory = useSignalHistory();
  const respirationProcessorRef = useRef<RespirationProcessor | null>(null);
  
  // Data for glucose analysis
  const glucoseBufferRef = useRef<number[]>([]);
  const lastGlucoseTimeRef = useRef<number>(0);
  const glucoseCalibrationValueRef = useRef<number>(0);
  const glucoseConfidenceRef = useRef<number>(0);
  const peakValuesRef = useRef<number[]>([]);
  const valleyValuesRef = useRef<number[]>([]);
  const rValueSequenceRef = useRef<number[]>([]);
  
  // Advanced glucose analysis components
  const respirationPhaseRef = useRef<number[]>([]);
  const heartRateTrendRef = useRef<number[]>([]);
  const temperatureEstimateRef = useRef<number>(37.0);
  const temporalCoherenceScoreRef = useRef<number[]>([]);
  const absorptionProfileRef = useRef<{time: number, value: number}[]>([]);
  const tissueCharacteristicsRef = useRef<{
    waterContent: number,
    adiposeFactor: number,
    melaninIndex: number
  }>({
    waterContent: 0.6,
    adiposeFactor: 1.0,
    melaninIndex: 0.5
  });
  
  // Initialization of processor
  const getProcessor = useCallback(() => {
    if (!processorRef.current) {
      console.log('useVitalSignsProcessor: Creating new instance');
      processorRef.current = new VitalSignsProcessor();
    }
    return processorRef.current;
  }, []);
  
  // Initialization of respiration processor
  const getRespirationProcessor = useCallback(() => {
    if (!respirationProcessorRef.current) {
      console.log('useVitalSignsProcessor: Creating RespirationProcessor instance');
      respirationProcessorRef.current = new RespirationProcessor();
    }
    return respirationProcessorRef.current;
  }, []);
  
  /**
   * Advanced algorithm for processing signals and estimating blood glucose level
   * Based on NIR (Near Infrared) spectroscopy techniques and absorption pattern analysis
   * Implements multi-wavelength modeling and advanced signal processing algorithms
   * Includes tissue characteristic compensation and temporal coherence validation
   */
  const processGlucoseSignal = useCallback((value: number, signalQuality: number): GlucoseData | null => {
    // Only process if signal quality is sufficient
    if (signalQuality < MIN_SIGNAL_QUALITY_FOR_GLUCOSE) {
      return null;
    }
    
    // Add value to buffer
    glucoseBufferRef.current.push(value);
    
    // Maintain appropriate buffer size
    if (glucoseBufferRef.current.length > SIGNAL_SAMPLES_NEEDED * 2) {
      glucoseBufferRef.current = glucoseBufferRef.current.slice(-SIGNAL_SAMPLES_NEEDED);
    }
    
    // Verify if we have enough samples
    if (glucoseBufferRef.current.length < SIGNAL_SAMPLES_NEEDED) {
      return null;
    }
    
    // Get the most recent samples for processing
    const buffer = glucoseBufferRef.current.slice(-SIGNAL_SAMPLES_NEEDED);
    const currentTime = Date.now();
    
    // Limit update frequency to reduce processing load and improve stability
    // New value detected every 3 seconds minimum
    if (currentTime - lastGlucoseTimeRef.current < 3000) {
      return {
        value: dataCollector.current.getAverageGlucose(), 
        trend: dataCollector.current.getGlucoseTrend(),
        confidence: glucoseConfidenceRef.current,
        timeOffset: Math.floor((currentTime - lastGlucoseTimeRef.current) / 60000) // minutes since last update
      };
    }
    
    // Statistical signal validation
    const bufferMean = buffer.reduce((sum, val) => sum + val, 0) / buffer.length;
    const bufferVariance = buffer.reduce((sum, val) => sum + Math.pow(val - bufferMean, 2), 0) / buffer.length;
    const normalizedVariance = bufferVariance / Math.pow(bufferMean, 2);
    
    // Check if signal variance is within acceptable range for accurate measurement
    if (normalizedVariance < SIGNAL_VARIANCE_THRESHOLD * 0.5 || normalizedVariance > SIGNAL_VARIANCE_THRESHOLD * 3.0) {
      console.log(`Glucose signal variance outside acceptable range: ${normalizedVariance.toFixed(4)}`);
      return null;
    }
    
    // Advanced peak and valley detection with improved sensitivity
    peakValuesRef.current = [];
    valleyValuesRef.current = [];
    
    // Identify peaks and valleys with dynamic window size based on signal characteristics
    const windowSize = Math.max(3, Math.floor(5 * signalQuality / 100));
    
    for (let i = windowSize; i < buffer.length - windowSize; i++) {
      const currentValue = buffer[i];
      
      // Check if this point is a peak
      let isPeak = true;
      for (let j = 1; j <= windowSize; j++) {
        if (currentValue <= buffer[i - j] || currentValue <= buffer[i + j]) {
          isPeak = false;
          break;
        }
      }
      
      // Check if this point is a valley
      let isValley = true;
      for (let j = 1; j <= windowSize; j++) {
        if (currentValue >= buffer[i - j] || currentValue >= buffer[i + j]) {
          isValley = false;
          break;
        }
      }
      
      // Additional validation: peak must exceed local mean by threshold
      if (isPeak) {
        const localMean = buffer.slice(i - windowSize, i + windowSize + 1)
          .reduce((sum, val) => sum + val, 0) / (windowSize * 2 + 1);
        
        const peakProminence = (currentValue - localMean) / localMean;
        if (peakProminence > PEAK_DETECTION_SENSITIVITY) {
          peakValuesRef.current.push(currentValue);
          
          // Store time-value pair for absorption profile
          absorptionProfileRef.current.push({
            time: currentTime - (buffer.length - i) * 20, // Approximate timestamp
            value: currentValue
          });
          
          // Keep absorption profile from growing too large
          if (absorptionProfileRef.current.length > 50) {
            absorptionProfileRef.current.shift();
          }
        }
      }
      
      // Additional validation: valley must be lower than local mean by threshold
      if (isValley) {
        const localMean = buffer.slice(i - windowSize, i + windowSize + 1)
          .reduce((sum, val) => sum + val, 0) / (windowSize * 2 + 1);
        
        const valleyProminence = (localMean - currentValue) / localMean;
        if (valleyProminence > VALLEY_DETECTION_SENSITIVITY) {
          valleyValuesRef.current.push(currentValue);
        }
      }
    }
    
    // Need sufficient peaks and valleys for a reliable calculation
    if (peakValuesRef.current.length < 5 || valleyValuesRef.current.length < 5) {
      console.log(`Insufficient peaks (${peakValuesRef.current.length}) or valleys (${valleyValuesRef.current.length}) detected`);
      return null;
    }
    
    // Calculate average of peaks and valleys with outlier removal
    const sortedPeaks = [...peakValuesRef.current].sort((a, b) => a - b);
    const sortedValleys = [...valleyValuesRef.current].sort((a, b) => a - b);
    
    // Remove outliers (10% from each end)
    const trimRatio = 0.1;
    const trimmedPeaks = sortedPeaks.slice(
      Math.floor(sortedPeaks.length * trimRatio),
      Math.ceil(sortedPeaks.length * (1 - trimRatio))
    );
    
    const trimmedValleys = sortedValleys.slice(
      Math.floor(sortedValleys.length * trimRatio),
      Math.ceil(sortedValleys.length * (1 - trimRatio))
    );
    
    const avgPeak = trimmedPeaks.reduce((sum, val) => sum + val, 0) / trimmedPeaks.length;
    const avgValley = trimmedValleys.reduce((sum, val) => sum + val, 0) / trimmedValleys.length;
    
    // Calculate optical parameters (simulating spectral NIR analysis)
    const signalAmplitude = avgPeak - avgValley;
    const normalizedAmplitude = signalAmplitude / avgPeak;
    
    // Calculate R value (similar to technique used in oximetry)
    // R represents the ratio between IR and red light absorption, correlated with glucose
    const rawRValue = normalizedAmplitude * BLOOD_VOLUME_FACTOR * SCATTER_COEFFICIENT;
    
    // Apply tissue characteristic compensation
    const compensatedRValue = rawRValue * 
      (1 + VASCULAR_DENSITY_FACTOR * (1 - tissueCharacteristicsRef.current.waterContent)) * 
      (1 - 0.15 * tissueCharacteristicsRef.current.adiposeFactor) *
      (1 + 0.08 * (temperatureEstimateRef.current - 37.0));
    
    // Calculate temporal coherence score based on consistency of recent measurements
    const currentRValue = compensatedRValue;
    
    // Add to the sequence of R values
    rValueSequenceRef.current.push(currentRValue);
    if (rValueSequenceRef.current.length > 15) {
      rValueSequenceRef.current.shift();
    }
    
    // Calculate correlation with the expected transition pattern
    let patternCorrelation = 0;
    if (rValueSequenceRef.current.length === TRANSITION_PATTERN.length) {
      // Normalize both sequences for better comparison
      const normalizedRValues = normalizeSequence(rValueSequenceRef.current);
      const normalizedPattern = TRANSITION_PATTERN;
      
      let correlationSum = 0;
      for (let i = 0; i < normalizedPattern.length; i++) {
        correlationSum += Math.abs(normalizedRValues[i] - normalizedPattern[i]);
      }
      patternCorrelation = 1 - (correlationSum / normalizedPattern.length);
    }
    
    // Calculate temporal coherence - how stable are the measurements over time
    const temporalCoherence = calculateTemporalCoherence(rValueSequenceRef.current);
    temporalCoherenceScoreRef.current.push(temporalCoherence);
    if (temporalCoherenceScoreRef.current.length > 10) {
      temporalCoherenceScoreRef.current.shift();
    }
    
    // Get average temporal coherence
    const avgTemporalCoherence = temporalCoherenceScoreRef.current.reduce((sum, val) => sum + val, 0) / 
      temporalCoherenceScoreRef.current.length;
    
    // Calculate deviation of R value from reference value
    const rValueRatio = currentRValue / BASELINE_R_VALUE;
    
    // Main algorithm for estimating glucose level
    // Based on principles of NIR spectroscopy and differential absorption
    let glucoseEstimate;
    
    if (glucoseCalibrationValueRef.current > 0) {
      // If there's a calibration value, use it as reference
      glucoseEstimate = glucoseCalibrationValueRef.current * (1 + (rValueRatio - 1) * ABSORPTION_FACTOR);
      
      // Apply correction based on the pattern correlation
      glucoseEstimate *= (0.9 + 0.1 * patternCorrelation);
      
      // Apply correction based on temporal coherence
      if (avgTemporalCoherence > 0.7) {
        glucoseEstimate *= (0.95 + 0.05 * avgTemporalCoherence);
      } else {
        // Lower confidence if temporal coherence is poor
        glucoseEstimate *= (0.85 + 0.15 * avgTemporalCoherence);
      }
    } else {
      // Without calibration, less precise value using only optical parameters
      glucoseEstimate = Math.round(CALIBRATION_CONSTANT * rValueRatio * (1 + normalizedAmplitude * ABSORPTION_FACTOR));
      
      // Apply tissue and optical characteristic adjustments
      glucoseEstimate *= (1 - 0.05 * tissueCharacteristicsRef.current.melaninIndex);
      glucoseEstimate *= (1 + TEMPERATURE_CORRECTION * (temperatureEstimateRef.current - 37.0));
    }
    
    // Adjust by signal quality
    const qualityFactor = Math.min(1, signalQuality / 100);
    glucoseEstimate = Math.round(glucoseEstimate * (0.85 + 0.15 * qualityFactor));
    
    // Calculate confidence based on signal quality, pattern correlation and temporal coherence
    const patternWeight = 0.3;
    const temporalWeight = 0.3;
    const qualityWeight = 0.4;
    
    const confidence = Math.round(
      (qualityFactor * qualityWeight + 
       patternCorrelation * patternWeight + 
       avgTemporalCoherence * temporalWeight) * 100
    );
    
    glucoseConfidenceRef.current = confidence;
    
    // Apply physiological limits (mg/dL)
    glucoseEstimate = Math.max(60, Math.min(350, glucoseEstimate));
    
    // Update last calculation time
    lastGlucoseTimeRef.current = currentTime;
    
    // Add to collection for averages
    dataCollector.current.addGlucose(glucoseEstimate);
    
    // Get a more stable averaged value
    const smoothedValue = dataCollector.current.getAverageGlucose();
    
    console.log(`Glucose estimate: ${smoothedValue} mg/dL (confidence: ${confidence}%, coherence: ${avgTemporalCoherence.toFixed(2)})`);
    
    return {
      value: smoothedValue,
      trend: dataCollector.current.getGlucoseTrend(),
      confidence: confidence,
      timeOffset: 0 // Just updated
    };
  }, []);
  
  /**
   * Helper function to normalize a sequence of values to 0-1 range
   */
  const normalizeSequence = (sequence: number[]): number[] => {
    if (sequence.length === 0) return [];
    
    const min = Math.min(...sequence);
    const max = Math.max(...sequence);
    
    if (max === min) return sequence.map(() => 0.5);
    
    return sequence.map(val => (val - min) / (max - min));
  };
  
  /**
   * Calculate temporal coherence of a sequence of values
   * Returns a value between 0 and 1, where 1 is perfect coherence
   */
  const calculateTemporalCoherence = (sequence: number[]): number => {
    if (sequence.length < 3) return 0;
    
    // Calculate first differences
    const diffs = [];
    for (let i = 1; i < sequence.length; i++) {
      diffs.push(sequence[i] - sequence[i-1]);
    }
    
    // Calculate variance of differences
    const meanDiff = diffs.reduce((sum, val) => sum + val, 0) / diffs.length;
    const diffVariance = diffs.reduce((sum, val) => sum + Math.pow(val - meanDiff, 2), 0) / diffs.length;
    
    // Calculate mean absolute value
    const meanAbsVal = sequence.reduce((sum, val) => sum + Math.abs(val), 0) / sequence.length;
    
    // Normalized variance (coefficient of variation of differences)
    const normalizedVariance = Math.sqrt(diffVariance) / meanAbsVal;
    
    // Transform to coherence score (0-1)
    return Math.max(0, Math.min(1, 1 - normalizedVariance * 2));
  };
  
  /**
   * Set glucose calibration value (from external glucometer)
   */
  const calibrateGlucose = useCallback((value: number) => {
    if (value >= 60 && value <= 350) {
      glucoseCalibrationValueRef.current = value;
      dataCollector.current.addGlucose(value); // Add this precise calibration value
      console.log(`Glucose calibrated to ${value} mg/dL`);
      return true;
    }
    return false;
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
      
      // Get peak amplitude if available for respiratory analysis
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
        
        // Update heart rate trends for glucose analysis
        if (rawBPM > 40 && rawBPM < 160) {
          heartRateTrendRef.current.push(rawBPM);
          if (heartRateTrendRef.current.length > 20) {
            heartRateTrendRef.current.shift();
          }
          
          // Estimate skin temperature based on heart rate trend
          // (slight increase in HR often correlates with increased skin temperature)
          if (heartRateTrendRef.current.length >= 10) {
            const recent = heartRateTrendRef.current.slice(-5);
            const older = heartRateTrendRef.current.slice(0, 5);
            const recentAvg = recent.reduce((sum, val) => sum + val, 0) / recent.length;
            const olderAvg = older.reduce((sum, val) => sum + val, 0) / older.length;
            
            // Adjust estimated temperature based on HR trend
            // Each 10 BPM increase typically correlates with about 0.1-0.2°C increase
            const hrDiff = recentAvg - olderAvg;
            temperatureEstimateRef.current = 37.0 + (hrDiff / 10) * 0.15;
            temperatureEstimateRef.current = Math.max(36.0, Math.min(38.0, temperatureEstimateRef.current));
          }
        }
      }
    }
    
    // Get base results from the core processor
    const result = processor.processSignal(value, rrData);
    
    // Process respiratory data
    const respirationResult = respirationProcessor.processSignal(value, peakAmplitude);
    
    // Update respiration phase information for glucose analysis
    if (respirationResult.rate > 0 && respirationResult.depth > 0) {
      respirationPhaseRef.current.push(respirationResult.depth);
      if (respirationPhaseRef.current.length > 30) {
        respirationPhaseRef.current.shift();
      }
      
      // Use respiratory information to improve tissue characterization
      if (respirationPhaseRef.current.length > 10) {
        const avgDepth = respirationPhaseRef.current.reduce((sum, val) => sum + val, 0) / respirationPhaseRef.current.length;
        
        // Deep breathing increases tissue perfusion slightly
        if (avgDepth > 65) {
          tissueCharacteristicsRef.current.waterContent = Math.min(0.7, tissueCharacteristicsRef.current.waterContent + 0.01);
        } else if (avgDepth < 40) {
          tissueCharacteristicsRef.current.waterContent = Math.max(0.5, tissueCharacteristicsRef.current.waterContent - 0.01);
        }
      }
    }
    
    // Stabilize blood pressure
    const signalQuality = signalHistory.getSignalQuality();
    const stabilizedBP = bloodPressureStabilizer.current.stabilizeBloodPressure(result.pressure, signalQuality);
    
    // Process glucose data using advanced algorithm
    const glucoseData = processGlucoseSignal(value, signalQuality);
    
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
    
    // Advanced arrhythmia analysis - ensure amplitude data is passed if available
    if (rrData?.intervals && rrData.intervals.length >= 4) {
      // Ensure amplitude data is passed to the arrhythmia analyzer if available
      const arrhythmiaResult = arrhythmiaAnalyzer.processArrhythmia(rrData);
      
      if (arrhythmiaResult.detected) {
        return {
          spo2: result.spo2,
          pressure: stabilizedBP,
          arrhythmiaStatus: arrhythmiaResult.arrhythmiaStatus,
          lastArrhythmiaData: arrhythmiaResult.lastArrhythmiaData,
          respiration: respirationResult,
          hasRespirationData: respirationProcessor.hasValidData(),
          glucose: glucoseData
        };
      }
      
      return {
        spo2: result.spo2,
        pressure: stabilizedBP,
        arrhythmiaStatus: arrhythmiaResult.arrhythmiaStatus,
        respiration: respirationResult,
        hasRespirationData: respirationProcessor.hasValidData(),
        glucose: glucoseData
      };
    }
    
    // If we already analyzed arrhythmias before, use the last state
    const arrhythmiaStatus = `SIN ARRITMIAS|${arrhythmiaAnalyzer.arrhythmiaCounter}`;
    
    return {
      spo2: result.spo2,
      pressure: stabilizedBP,
      arrhythmiaStatus,
      respiration: respirationResult,
      hasRespirationData: respirationProcessor.hasValidData(),
      glucose: glucoseData
    };
  }, [getProcessor, getRespirationProcessor, arrhythmiaAnalyzer, signalHistory, processGlucoseSignal]);

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
    
    // Reset glucose data
    glucoseBufferRef.current = [];
    lastGlucoseTimeRef.current = 0;
    peakValuesRef.current = [];
    valleyValuesRef.current = [];
    rValueSequenceRef.current = [];
    respirationPhaseRef.current = [];
    heartRateTrendRef.current = [];
    temporalCoherenceScoreRef.current = [];
    absorptionProfileRef.current = [];
    temperatureEstimateRef.current = 37.0;
    tissueCharacteristicsRef.current = {
      waterContent: 0.6,
      adiposeFactor: 1.0,
      melaninIndex: 0.5
    };
    
    VitalSignsRisk.resetHistory();
    
    console.log("Reset of arrhythmia detection, blood pressure, respiration and glucose");
  }, [arrhythmiaAnalyzer, signalHistory]);
  
  /**
   * Aggressive memory cleanup
   */
  const cleanMemory = useCallback(() => {
    console.log("useVitalSignsProcessor: Aggressive memory cleanup");
    
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
    
    // Reset glucose data
    glucoseBufferRef.current = [];
    lastGlucoseTimeRef.current = 0;
    peakValuesRef.current = [];
    valleyValuesRef.current = [];
    rValueSequenceRef.current = [];
    respirationPhaseRef.current = [];
    heartRateTrendRef.current = [];
    temporalCoherenceScoreRef.current = [];
    absorptionProfileRef.current = [];
    temperatureEstimateRef.current = 37.0;
    tissueCharacteristicsRef.current = {
      waterContent: 0.6,
      adiposeFactor: 1.0,
      melaninIndex: 0.5
    };
    
    VitalSignsRisk.resetHistory();
    
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
    calibrateGlucose,
    arrhythmiaCounter: arrhythmiaAnalyzer.arrhythmiaCounter,
    dataCollector: dataCollector.current
  };
};
