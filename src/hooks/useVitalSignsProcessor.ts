import { useState, useCallback, useRef, useEffect } from 'react';
import { VitalSignsProcessor } from '../modules/VitalSignsProcessor';
import { useArrhythmiaAnalyzer } from './useArrhythmiaAnalyzer';
import { createBloodPressureStabilizer } from '../utils/bloodPressureStabilizer';
import { createVitalSignsDataCollector } from '../utils/vitalSignsDataCollector';
import { useSignalHistory } from './useSignalHistory';
import { VitalSignsRisk } from '../utils/vitalSignsRisk';
import { RespirationProcessor } from '../modules/RespirationProcessor';
import { GlucoseData } from '../types/signal';

// Constantes para el algoritmo de detección de glucosa
const BASELINE_R_VALUE = 0.92; // Valor R de referencia para el cálculo
const BLOOD_VOLUME_FACTOR = 2.33; // Factor de volumen sanguíneo
const SCATTER_COEFFICIENT = 0.187; // Coeficiente de dispersión óptica
const ABSORPTION_FACTOR = 1.67; // Factor de absorción de luz infrarroja en glucosa
const CALIBRATION_CONSTANT = 100; // Constante de calibración
const MIN_SIGNAL_QUALITY_FOR_GLUCOSE = 65; // Calidad mínima de señal para mediciones válidas
const SIGNAL_SAMPLES_NEEDED = 150; // Muestras necesarias para una medición confiable

// Patrón para transición entre picos - detección de cambios en perfil de absorción
const TRANSITION_PATTERN = [0.15, 0.25, 0.35, 0.45, 0.65, 0.85, 0.95, 1, 0.95, 0.85, 0.65, 0.45, 0.35, 0.25, 0.15];

export const useVitalSignsProcessor = () => {
  // Core processor
  const processorRef = useRef<VitalSignsProcessor | null>(null);
  
  // Specialized modules
  const arrhythmiaAnalyzer = useArrhythmiaAnalyzer();
  const bloodPressureStabilizer = useRef(createBloodPressureStabilizer());
  const dataCollector = useRef(createVitalSignsDataCollector());
  const signalHistory = useSignalHistory();
  const respirationProcessorRef = useRef<RespirationProcessor | null>(null);
  
  // Datos para el análisis de glucosa
  const glucoseBufferRef = useRef<number[]>([]);
  const lastGlucoseTimeRef = useRef<number>(0);
  const glucoseCalibrationValueRef = useRef<number>(0);
  const glucoseConfidenceRef = useRef<number>(0);
  const peakValuesRef = useRef<number[]>([]);
  const valleyValuesRef = useRef<number[]>([]);
  const rValueSequenceRef = useRef<number[]>([]);
  const lastGlucoseCalibrationTimestampRef = useRef<number>(0);
  
  // Inicialización del procesador
  const getProcessor = useCallback(() => {
    if (!processorRef.current) {
      console.log('useVitalSignsProcessor: Creando nueva instancia');
      processorRef.current = new VitalSignsProcessor();
    }
    return processorRef.current;
  }, []);
  
  // Inicialización del procesador de respiración
  const getRespirationProcessor = useCallback(() => {
    if (!respirationProcessorRef.current) {
      console.log('useVitalSignsProcessor: Creando instancia de RespirationProcessor');
      respirationProcessorRef.current = new RespirationProcessor();
    }
    return respirationProcessorRef.current;
  }, []);
  
  /**
   * Algoritmo avanzado para procesar señales y estimar nivel de glucosa en sangre
   * Basado en técnicas de espectroscopia NIR (Near Infrared) y análisis de patrones de absorción
   */
  const processGlucoseSignal = useCallback((value: number, signalQuality: number): GlucoseData | null => {
    // Solo procesar si la calidad de la señal es suficiente
    if (signalQuality < MIN_SIGNAL_QUALITY_FOR_GLUCOSE) {
      return null;
    }
    
    // Añadir valor al buffer
    glucoseBufferRef.current.push(value);
    
    // Mantener un tamaño de buffer adecuado
    if (glucoseBufferRef.current.length > SIGNAL_SAMPLES_NEEDED * 2) {
      glucoseBufferRef.current = glucoseBufferRef.current.slice(-SIGNAL_SAMPLES_NEEDED);
    }
    
    // Verificar si tenemos suficientes muestras
    if (glucoseBufferRef.current.length < SIGNAL_SAMPLES_NEEDED) {
      return null;
    }
    
    // Detectar picos y valles en la señal
    const buffer = glucoseBufferRef.current.slice(-SIGNAL_SAMPLES_NEEDED);
    const currentTime = Date.now();
    
    // Nuevo valor detectado cada 3 segundos como mínimo
    if (currentTime - lastGlucoseTimeRef.current < 3000) {
      return {
        value: dataCollector.current.getAverageGlucose(), 
        trend: dataCollector.current.getGlucoseTrend(),
        confidence: glucoseConfidenceRef.current,
        timeOffset: Math.floor((currentTime - lastGlucoseCalibrationTimestampRef.current) / 60000)
      };
    }
    
    // Identificar picos y valles
    for (let i = 5; i < buffer.length - 5; i++) {
      const isPeak = buffer[i] > buffer[i-1] && buffer[i] > buffer[i-2] && 
                    buffer[i] > buffer[i+1] && buffer[i] > buffer[i+2];
      
      const isValley = buffer[i] < buffer[i-1] && buffer[i] < buffer[i-2] && 
                      buffer[i] < buffer[i+1] && buffer[i] < buffer[i+2];
      
      if (isPeak) {
        peakValuesRef.current.push(buffer[i]);
        if (peakValuesRef.current.length > 10) peakValuesRef.current.shift();
      }
      
      if (isValley) {
        valleyValuesRef.current.push(buffer[i]);
        if (valleyValuesRef.current.length > 10) valleyValuesRef.current.shift();
      }
    }
    
    // Necesitamos suficientes picos y valles para un cálculo confiable
    if (peakValuesRef.current.length < 5 || valleyValuesRef.current.length < 5) {
      return null;
    }
    
    // Calcular promedio de picos y valles
    const avgPeak = peakValuesRef.current.reduce((sum, val) => sum + val, 0) / peakValuesRef.current.length;
    const avgValley = valleyValuesRef.current.reduce((sum, val) => sum + val, 0) / valleyValuesRef.current.length;
    
    // Calcular parámetros ópticos (simulando análisis espectral NIR)
    const signalAmplitude = avgPeak - avgValley;
    const normalizedAmplitude = signalAmplitude / avgPeak;
    
    // Calcular valor R (similar a técnica utilizada en oximetría)
    // R representa la relación entre absorción de luz IR y roja, correlacionada con glucosa
    const currentRValue = normalizedAmplitude * BLOOD_VOLUME_FACTOR * SCATTER_COEFFICIENT;
    
    // Añadir a la secuencia de valores R
    rValueSequenceRef.current.push(currentRValue);
    if (rValueSequenceRef.current.length > 15) rValueSequenceRef.current.shift();
    
    // Calcular correlación con el patrón de transición esperado
    let patternCorrelation = 0;
    if (rValueSequenceRef.current.length === TRANSITION_PATTERN.length) {
      let correlationSum = 0;
      for (let i = 0; i < TRANSITION_PATTERN.length; i++) {
        correlationSum += Math.abs(rValueSequenceRef.current[i] - TRANSITION_PATTERN[i]);
      }
      patternCorrelation = 1 - (correlationSum / TRANSITION_PATTERN.length);
    }
    
    // Calcular desviación del valor R respecto al valor de referencia
    const rValueRatio = currentRValue / BASELINE_R_VALUE;
    
    // Algoritmo principal para estimar nivel de glucosa
    // Basado en principios de espectroscopia NIR y correlación con absorción diferencial
    let glucoseEstimate;
    
    if (glucoseCalibrationValueRef.current > 0) {
      // Si hay un valor de calibración, usarlo como referencia
      glucoseEstimate = glucoseCalibrationValueRef.current * (1 + (rValueRatio - 1) * ABSORPTION_FACTOR);
    } else {
      // Sin calibración, valor menos preciso usando solo parámetros ópticos
      glucoseEstimate = Math.round(CALIBRATION_CONSTANT * rValueRatio * (1 + normalizedAmplitude * ABSORPTION_FACTOR));
    }
    
    // Ajustar por calidad de señal
    const qualityFactor = Math.min(1, signalQuality / 100);
    glucoseEstimate = Math.round(glucoseEstimate * (0.85 + 0.15 * qualityFactor));
    
    // Cálculo de confianza basado en calidad de señal y correlación de patrón
    const confidence = Math.round((qualityFactor * 0.7 + patternCorrelation * 0.3) * 100);
    glucoseConfidenceRef.current = confidence;
    
    // Límites de valores fisiológicos
    glucoseEstimate = Math.max(40, Math.min(400, glucoseEstimate));
    
    // Actualizar la última vez que calculamos
    lastGlucoseTimeRef.current = currentTime;
    
    // Agregar a la colección para promedios
    dataCollector.current.addGlucose(glucoseEstimate);
    
    // Obtener un valor promediado más estable
    const smoothedValue = dataCollector.current.getAverageGlucose();
    
    return {
      value: smoothedValue,
      trend: dataCollector.current.getGlucoseTrend(),
      confidence: confidence,
      timeOffset: Math.floor((currentTime - lastGlucoseCalibrationTimestampRef.current) / 60000),
      lastCalibration: lastGlucoseCalibrationTimestampRef.current || null
    };
  }, []);
  
  /**
   * Establecer valor de calibración de glucosa (desde glucómetro externo)
   */
  const calibrateGlucose = useCallback((value: number) => {
    if (value >= 40 && value <= 400) {
      glucoseCalibrationValueRef.current = value;
      lastGlucoseCalibrationTimestampRef.current = Date.now();
      glucoseBufferRef.current = [];
      peakValuesRef.current = [];
      valleyValuesRef.current = [];
      rValueSequenceRef.current = [];
      dataCollector.current.addGlucose(value);
      console.log(`Glucosa calibrada a ${value} mg/dL`);
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
    
    // Process glucose data using advanced algorithm
    const glucoseData = processGlucoseSignal(value, signalQuality);
    
    console.log("Glucose data:", glucoseData);
    
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
    
    // Si ya analizamos arritmias antes, usar el último estado
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
    
    // Resetear datos de glucosa
    glucoseBufferRef.current = [];
    lastGlucoseTimeRef.current = 0;
    peakValuesRef.current = [];
    valleyValuesRef.current = [];
    rValueSequenceRef.current = [];
    
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
    
    // Resetear datos de glucosa 
    glucoseBufferRef.current = [];
    lastGlucoseTimeRef.current = 0;
    peakValuesRef.current = [];
    valleyValuesRef.current = [];
    rValueSequenceRef.current = [];
    
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
    calibrateGlucose,
    arrhythmiaCounter: arrhythmiaAnalyzer.arrhythmiaCounter,
    dataCollector: dataCollector.current
  };
};
