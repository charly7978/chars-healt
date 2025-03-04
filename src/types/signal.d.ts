
/**
 * ESTA APPS ES DE MEDICION ULTRA REAL - PROHIBIDA CUALQUIER SIMULACION - NO ESTA PERMITIDO HACER MOVIMIENTOS POR CUENTA DE LA I.A SIN AUTORIZACION DEL USUARIO
 */
import { HeartBeatProcessor } from '../modules/HeartBeatProcessor';

export interface ProcessedSignal {
  timestamp: number;
  rawValue: number;
  filteredValue: number;
  quality: number;
  fingerDetected: boolean;
  roi: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  rawPixelData?: {
    r: number;
    g: number;
    b: number;
    ir?: number;
  };
  advancedMetrics?: {
    acComponent?: number;
    dcComponent?: number;
    perfusionIndex?: number;
    signalToNoiseRatio?: number;
    spectralPurity?: number;
  };
}

export interface ProcessingError {
  code: string;
  message: string;
  timestamp: number;
}

export interface SignalProcessor {
  initialize: () => Promise<void>;
  start: () => void;
  stop: () => void;
  calibrate: () => Promise<boolean>;
  onSignalReady?: (signal: ProcessedSignal) => void;
  onError?: (error: ProcessingError) => void;
}

export interface RespirationData {
  rate: number;      // Respiraciones por minuto
  depth: number;     // Profundidad (0-100)
  regularity: number; // Regularidad (0-100)
}

export interface GlucoseData {
  value: number;     // Valor de glucosa en mg/dL
  trend: 'stable' | 'rising' | 'falling' | 'rising_rapidly' | 'falling_rapidly' | 'unknown';
  confidence: number; // Nivel de confianza de la medición (0-100)
  timeOffset: number; // Tiempo desde la última calibración (minutos)
}

export interface HemoglobinData {
  value: number;     // Valor de hemoglobina en g/dL
  confidence: number; // Nivel de confianza (0-100)
  lastUpdated: number; // Timestamp de la última actualización
}

// Tipos para colesterol y temperatura
export interface CholesterolData {
  totalCholesterol: number;   // Colesterol total en mg/dL
  hdl: number;                // HDL (colesterol bueno) en mg/dL
  ldl: number;                // LDL (colesterol malo) en mg/dL
  triglycerides: number;      // Triglicéridos en mg/dL
  confidence: number;         // Nivel de confianza (0-100)
  lastUpdated: number;        // Timestamp de la última actualización
}

export interface BodyTemperatureData {
  value: number;              // Temperatura en °C
  location: 'forehead' | 'wrist' | 'finger'; // Ubicación de la medición
  trend: 'rising' | 'falling' | 'stable';    // Tendencia
  confidence: number;         // Nivel de confianza (0-100)
  lastUpdated: number;        // Timestamp de la última actualización
}

export interface HeartBeatResult {
  bpm: number;
  confidence: number;
  isPeak: boolean;
  filteredValue: number;
  arrhythmiaCount: number;
  amplitude?: number;
  isLearningPhase?: boolean;
}

// Nuevos tipos para procesamiento de señal avanzado
export interface AdvancedSignalMetrics {
  acComponent: number;         // Componente AC de la señal PPG
  dcComponent: number;         // Componente DC de la señal PPG
  perfusionIndex: number;      // Índice de perfusión (PI = AC/DC * 100)
  signalToNoiseRatio: number;  // Relación señal-ruido
  spectralPurity: number;      // Pureza espectral (0-1)
  harmonicDistortion: number;  // Distorsión armónica total
}

export interface WaveletAnalysisResult {
  coefficients: number[];      // Coeficientes wavelet
  energyDistribution: number[];// Distribución de energía por banda
  dominantFrequency: number;   // Frecuencia dominante
  scale: number;               // Escala de análisis
}

export interface AdaptiveFilterParameters {
  convergenceRate: number;     // Tasa de convergencia del filtro
  filterOrder: number;         // Orden del filtro
  weights: number[];           // Pesos del filtro
  errorSignal: number[];       // Señal de error
}

/**
 * ESTA APPS ES DE MEDICION ULTRA REAL - PROHIBIDA CUALQUIER SIMULACION - NO ESTA PERMITIDO HACER MOVIMIENTOS POR CUENTA DE LA I.A SIN AUTORIZACION DEL USUARIO
 */
declare global {
  interface Window {
    heartBeatProcessor: HeartBeatProcessor;
    vitalSignsProcessor: any; // Add this to make it available globally
    gc?: () => void; // Añadir definición para garbage collector
  }
}
