import { VitalSigns } from './VitalSigns';

export interface ProcessedSignal {
  timestamp: number;
  rawValue: number;
  filteredValue: number;
  quality: number;
  fingerDetected: boolean;
  roi?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  isPeak?: boolean;
}

export interface ProcessingError {
  code: string;
  message: string;
}

export interface HeartBeatResult {
  bpm: number;
  confidence: number;
  isPeak: boolean;
  rrData: {
    intervals: number[];
    lastPeakTime: number | null;
    amplitudes?: number[];
    advancedRRIntervals?: number[];
  };
  amplitude?: number;
  perfusionIndex?: number;
  pulsePressure?: number;
}

export interface GlucoseData {
  value: number;
  trend: 'stable' | 'rising' | 'falling' | 'rising_rapidly' | 'falling_rapidly' | 'unknown';
  confidence: number;
  timeOffset: number;
}

export interface HemoglobinData {
  value: number;
  confidence: number;
}

export interface VitalSignsProcessorResult {
  spo2: number;
  pressure: string;
  arrhythmiaStatus: string;
  respiration: {
    rate: number;
    depth: number;
    regularity: number;
  };
  hasRespirationData: boolean;
  glucose: GlucoseData | null;
  hemoglobin: HemoglobinData | null;
  lastArrhythmiaData: {
    timestamp: number;
    rmssd: number;
    rrVariation: number;
  } | null;
  cholesterol: {
    totalCholesterol: number;
    hdl: number;
    ldl: number;
    triglycerides: number;
    confidence?: number;
  };
} 