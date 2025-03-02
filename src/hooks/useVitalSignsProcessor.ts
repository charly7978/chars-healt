
import { useState, useCallback, useRef } from 'react';
import { VitalSignsProcessor } from '../modules/VitalSignsProcessor';
import { useArrhythmiaAnalyzer } from './useArrhythmiaAnalyzer';
import { createBloodPressureStabilizer } from '../utils/bloodPressureStabilizer';
import { createVitalSignsDataCollector } from '../utils/vitalSignsDataCollector';
import { useSignalHistory } from './useSignalHistory';
import { VitalSignsRisk } from '../utils/vitalSignsRisk';
import { analyzeCardiacWaveform } from '../utils/signalProcessingUtils';

export const useVitalSignsProcessor = () => {
  // Core processor
  const processorRef = useRef<VitalSignsProcessor | null>(null);
  const [cardiacWaveformAnalysis, setCardiacWaveformAnalysis] = useState<ReturnType<typeof analyzeCardiacWaveform> | null>(null);
  
  // Specialized modules
  const arrhythmiaAnalyzer = useArrhythmiaAnalyzer();
  const bloodPressureStabilizer = useRef(createBloodPressureStabilizer());
  const dataCollector = useRef(createVitalSignsDataCollector());
  const signalHistory = useSignalHistory();
  
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
  const processSignal = useCallback((value: number, rrData?: { intervals: number[], lastPeakTime: number | null, amplitudes?: number[] }) => {
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
    
    // Analizar forma de onda cardíaca periódicamente (cada ~2 segundos)
    const signalValues = signalHistory.signalHistory.current;
    if (signalValues.length > 60 && currentTime % 2000 < 100) {
      const waveformAnalysis = analyzeCardiacWaveform(signalValues.slice(-100));
      if (waveformAnalysis.waveQuality > 0.3) {
        setCardiacWaveformAnalysis(waveformAnalysis);
      }
    }
    
    // Advanced arrhythmia analysis - asegurarse de pasar los datos de amplitud si están disponibles
    if (rrData?.intervals && rrData.intervals.length >= 4) {
      // Asegurarse de pasar los datos de amplitud al analizador de arritmias si están disponibles
      const arrhythmiaResult = arrhythmiaAnalyzer.processArrhythmia(rrData);
      
      // Incluir información sobre la fase de entrenamiento (calibración) si está disponible
      const isCalibrating = arrhythmiaResult.isInWarmup === true;
      const calibrationProgress = arrhythmiaResult.warmupProgress || 0;
      
      // Incluir análisis de forma de onda si está disponible
      if (cardiacWaveformAnalysis && cardiacWaveformAnalysis.waveQuality > 0.3) {
        if (arrhythmiaResult.detected) {
          return {
            spo2: result.spo2,
            pressure: stabilizedBP,
            arrhythmiaStatus: arrhythmiaResult.arrhythmiaStatus,
            lastArrhythmiaData: arrhythmiaResult.lastArrhythmiaData,
            isCalibrating,
            calibrationProgress,
            cardiacWaveform: cardiacWaveformAnalysis
          };
        }
        
        return {
          spo2: result.spo2,
          pressure: stabilizedBP,
          arrhythmiaStatus: arrhythmiaResult.arrhythmiaStatus,
          isCalibrating,
          calibrationProgress,
          cardiacWaveform: cardiacWaveformAnalysis
        };
      }
      
      // Sin análisis de forma de onda
      if (arrhythmiaResult.detected) {
        return {
          spo2: result.spo2,
          pressure: stabilizedBP,
          arrhythmiaStatus: arrhythmiaResult.arrhythmiaStatus,
          lastArrhythmiaData: arrhythmiaResult.lastArrhythmiaData,
          isCalibrating,
          calibrationProgress
        };
      }
      
      return {
        spo2: result.spo2,
        pressure: stabilizedBP,
        arrhythmiaStatus: arrhythmiaResult.arrhythmiaStatus,
        isCalibrating,
        calibrationProgress
      };
    }
    
    // Si ya analizamos arritmias antes, usar el último estado
    const arrhythmiaStatus = `SIN ARRITMIAS|${arrhythmiaAnalyzer.arrhythmiaCounter}`;
    
    // Incluir análisis de forma de onda si está disponible
    if (cardiacWaveformAnalysis && cardiacWaveformAnalysis.waveQuality > 0.3) {
      return {
        spo2: result.spo2,
        pressure: stabilizedBP,
        arrhythmiaStatus,
        cardiacWaveform: cardiacWaveformAnalysis
      };
    }
    
    return {
      spo2: result.spo2,
      pressure: stabilizedBP,
      arrhythmiaStatus
    };
  }, [getProcessor, arrhythmiaAnalyzer, signalHistory, cardiacWaveformAnalysis]);

  /**
   * Reset all processors and data
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
    VitalSignsRisk.resetHistory();
    setCardiacWaveformAnalysis(null);
    
    console.log("Reseteo de detección de arritmias y presión arterial");
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
    VitalSignsRisk.resetHistory();
    setCardiacWaveformAnalysis(null);
    
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
    dataCollector: dataCollector.current,
    cardiacWaveformAnalysis
  };
};
