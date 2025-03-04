
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
  isPeak?: boolean; // Added isPeak property
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

export interface HeartBeatResult {
  bpm: number;
  confidence: number;
  isPeak: boolean;
  filteredValue: number;
  arrhythmiaCount: number;
  amplitude?: number;
  isLearningPhase?: boolean;
  perfusionIndex?: number; // Added perfusion index
  pulsePressure?: number;  // Added pulse pressure
  rrData?: {
    intervals: number[];
    lastPeakTime: number | null;
    amplitudes?: number[];
    advancedRRIntervals?: number[]; // Advanced RR intervals
  };
}

export interface HemoglobinData {
  value: number;     // Valor de hemoglobina en g/dL
  confidence: number; // Nivel de confianza de la medición (0-100)
  lastUpdated: number; // Timestamp de la última actualización
}

export interface CholesterolData {
  totalCholesterol: number; // mg/dL
  hdl: number;             // mg/dL (high-density lipoprotein - "good" cholesterol)
  ldl: number;             // mg/dL (low-density lipoprotein - "bad" cholesterol)
  triglycerides: number;   // mg/dL
}

// Advanced PPG processing types
export interface PPGPeakInfo {
  index: number;      // Index in the signal array
  timestamp: number;  // Timestamp of peak
  amplitude: number;  // Peak height
  confidence: number; // Confidence level (0-100)
}

export interface PPGProcessedResult {
  filteredValue: number;
  quality: number;
  peaks: PPGPeakInfo[];
  bpm: number;
  signalToNoiseRatio: number;
  fingerDetected: boolean;
}

// New advanced cardiac analysis types
export interface CardiacAnalysisResult {
  heartRate: number;
  rrIntervals: number[];
  peakIndices: number[];
  valleyIndices: number[];
  signalQuality: number;
  pulsePressure?: number;
  perfusionIndex?: number;
  hrvMetrics?: HeartRateVariabilityMetrics;
}

export interface HeartRateVariabilityMetrics {
  sdnn: number;    // Standard deviation of NN intervals
  rmssd: number;   // Root mean square of successive differences
  pnn50: number;   // Proportion of NN50 divided by total number of NNs
  lf: number;      // Low frequency power
  hf: number;      // High frequency power
  lfHfRatio: number; // LF/HF ratio
}

declare global {
  interface Window {
    heartBeatProcessor: HeartBeatProcessor;
    gc?: () => void; // Garbage collector definition
  }
}
