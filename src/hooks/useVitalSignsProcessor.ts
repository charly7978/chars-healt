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

interface VitalSignsResult {
  heartRate: number;
  spo2: number;
  systolic: number;
  diastolic: number;
  respiration?: {
    rate: number;
    depth: number;
    regularity: number;
  };
  glucose?: GlucoseData;
  arrhythmiaStatus: string;
  arrhythmiaCount: number;
  lastArrhythmiaData?: {
    timestamp: number;
    rmssd: number;
    rrVariation: number;
  } | null;
}

export const useVitalSignsProcessor = () => {
  const processor = useRef<VitalSignsProcessor | null>(null);
  const arrhythmiaDetector = useRef<any>(null);
  const glucoseProcessor = useRef<any>(null);
  const respirationProcessor = useRef<RespirationProcessor | null>(null);
  
  // Importamos el hook de análisis de arritmias que también contiene análisis de respiración y glucosa
  const arrhythmiaAnalyzer = useArrhythmiaAnalyzer();
  
  // Buffer de datos PPG para análisis de respiración y glucosa
  const ppgBuffer = useRef<number[]>([]);
  const MAX_PPG_BUFFER_SIZE = 1000; // 1000 muestras (aproximadamente 30 segundos a 30fps)
  
  const [signalQuality, setSignalQuality] = useState(0);
  const [vitalSignsData, setVitalSignsData] = useState<VitalSignsResult | null>(null);
  
  useEffect(() => {
    console.log('Inicializando procesadores de signos vitales - Versión mejorada');
    
    return () => {
      console.log('Limpiando procesadores de signos vitales');
    };
  }, []);
  
  const initialize = useCallback(() => {
    if (!processor.current) {
      processor.current = new VitalSignsProcessor();
    }
    
    if (!respirationProcessor.current) {
      respirationProcessor.current = new RespirationProcessor();
    }
    
    // Inicializar el estado de vitalSignsData con valores por defecto
    setVitalSignsData({
      heartRate: 0,
      spo2: 0,
      systolic: 0,
      diastolic: 0,
      arrhythmiaStatus: '--',
      arrhythmiaCount: 0,
      lastArrhythmiaData: null,
      glucose: {
        value: 0,
        trend: 'unknown',
        confidence: 0,
        timeOffset: 0
      }
    });
    
    // Resetear analizador de arritmias, respiración y glucosa
    arrhythmiaAnalyzer.resetAnalysis();
    
    // Limpiar buffer de PPG
    ppgBuffer.current = [];
  }, [arrhythmiaAnalyzer]);
  
  const processSignal = useCallback((
    ppgValue: number, 
    quality: number,
    rrData?: { intervals: number[]; lastPeakTime: number | null; amplitudes?: number[] }
  ) => {
    if (!processor.current) {
      console.warn('useVitalSignsProcessor: Processor no inicializado');
      return null;
    }
    
    // Almacenar valores PPG para análisis de respiración y glucosa
    ppgBuffer.current.push(ppgValue);
    if (ppgBuffer.current.length > MAX_PPG_BUFFER_SIZE) {
      ppgBuffer.current.shift();
    }
    
    // Actualizar calidad de señal
    setSignalQuality(quality);
    
    // Configurar valores por defecto para resultado de arritmia
    const defaultArrhythmiaResult = {
      detected: false,
      type: 'NONE',
      severity: 0,
      confidence: 0,
      data: null
    };
    
    let arrhythmiaResult = defaultArrhythmiaResult;
    
    // Requerimos solo 1 intervalo para análisis básico (aumentada sensibilidad)
    const minIntervalsRequired = 1; // Reducido de 2 a 1 para mayor sensibilidad
    
    if (rrData && Array.isArray(rrData.intervals) && rrData.intervals.length >= minIntervalsRequired) {
      console.log('useVitalSignsProcessor: Analizando intervalos RR para arritmias:', {
        intervals: rrData.intervals.length,
        lastPeakTime: rrData.lastPeakTime
      });
      
      // Usar nuestro hook optimizado de análisis de arritmias
      const hasArrhythmia = arrhythmiaAnalyzer.analyzeHeartbeats(
        rrData.intervals,
        rrData.amplitudes
      );
      
      if (hasArrhythmia) {
        arrhythmiaResult = {
          detected: true,
          type: 'PVC',
          severity: 6,
          confidence: 0.85,
          data: {
            rmssd: 0,
            rrVariation: 0,
            prematureBeat: true,
            confidence: 0.85
          }
        };
        
        console.log('useVitalSignsProcessor: ¡¡ARRITMIA DETECTADA!!', {
          count: arrhythmiaAnalyzer.arrhythmiaCounter
        });
      }
    }
    
    // Procesar señal PPG para signos vitales básicos
    const result = processor.current.processSignal(ppgValue, rrData);
    
    // Analizar respiración cada 30 muestras (aproximadamente 1 segundo a 30fps)
    // y solo si tenemos suficientes datos y buena calidad de señal
    if (ppgBuffer.current.length > 300 && quality > 65 && rrData?.intervals.length > 3 && ppgBuffer.current.length % 30 === 0) {
      const respirationData = arrhythmiaAnalyzer.analyzeRespiration(
        ppgBuffer.current.slice(-600), // Últimos 20 segundos de datos
        rrData.intervals
      );
      
      console.log('useVitalSignsProcessor: Datos de respiración calculados:', respirationData);
      
      // Analizar glucosa cada 60 muestras (aproximadamente 2 segundos a 30fps)
      if (ppgBuffer.current.length % 60 === 0) {
        const glucoseData = arrhythmiaAnalyzer.analyzeGlucose(
          ppgBuffer.current.slice(-900), // Últimos 30 segundos de datos
          quality
        );
        
        console.log('useVitalSignsProcessor: Datos de glucosa calculados:', glucoseData);
        
        // Actualizar resultado con datos de respiración y glucosa
        if (result) {
          result.respiration = respirationData;
          result.glucose = glucoseData;
        }
      }
    }
    
    if (result) {
      // Añadir estado de arritmias al resultado
      result.arrhythmiaStatus = arrhythmiaResult.detected 
        ? `ARRITMIA DETECTADA|${arrhythmiaAnalyzer.arrhythmiaCounter}`
        : `LATIDO NORMAL|${arrhythmiaAnalyzer.arrhythmiaCounter}`;
      
      result.arrhythmiaCount = arrhythmiaAnalyzer.arrhythmiaCounter;
      
      // Añadir datos de la última arritmia si fue detectada
      if (arrhythmiaResult.detected && arrhythmiaResult.data) {
        result.lastArrhythmiaData = {
          timestamp: Date.now(),
          rmssd: arrhythmiaResult.data.rmssd || 0,
          rrVariation: arrhythmiaResult.data.rrVariation || 0
        };
      }
      
      // Actualizar estado con el resultado completo
      setVitalSignsData(result);
      return result;
    }
    
    return null;
  }, [processor, arrhythmiaAnalyzer]);

  const getCurrentRespiratoryData = useCallback(() => {
    // Si tenemos datos de respiración en vitalSignsData, los devolvemos
    if (vitalSignsData?.respiration) {
      return vitalSignsData.respiration;
    }
    
    // De lo contrario, calculamos datos frescos si es posible
    if (ppgBuffer.current.length > 300 && signalQuality > 65) {
      return arrhythmiaAnalyzer.respirationData;
    }
    
    // Si no tenemos suficientes datos, devolvemos null
    return null;
  }, [vitalSignsData, signalQuality, arrhythmiaAnalyzer]);
  
  const getCurrentGlucoseData = useCallback(() => {
    // Si tenemos datos de glucosa en vitalSignsData, los devolvemos
    if (vitalSignsData?.glucose && vitalSignsData.glucose.value > 0) {
      return vitalSignsData.glucose;
    }
    
    // De lo contrario, devolvemos los últimos datos calculados por el analizador
    if (arrhythmiaAnalyzer.glucoseData && arrhythmiaAnalyzer.glucoseData.value > 0) {
      return arrhythmiaAnalyzer.glucoseData;
    }
    
    // Si no tenemos datos válidos, devolvemos null
    return null;
  }, [vitalSignsData, arrhythmiaAnalyzer]);
  
  const reset = useCallback(() => {
    if (processor.current) {
      processor.current.reset();
    }
    
    if (respirationProcessor.current) {
      respirationProcessor.current.reset();
    }
    
    // Resetear el analizador de arritmias que también maneja respiración y glucosa
    arrhythmiaAnalyzer.resetAnalysis();
    
    // Limpiar buffer de PPG
    ppgBuffer.current = [];
    
    // Resetear estado
    setVitalSignsData(null);
    setSignalQuality(0);
    
    console.log('useVitalSignsProcessor: Todos los procesadores han sido reseteados');
  }, [processor, arrhythmiaAnalyzer]);
  
  return {
    initialize,
    processSignal,
    reset,
    vitalSignsData,
    signalQuality,
    getCurrentRespiratoryData,
    getCurrentGlucoseData
  };
};
