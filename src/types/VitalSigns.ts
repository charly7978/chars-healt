
export interface VitalSigns {
  spo2: number;
  pressure: string;
  arrhythmiaStatus: string;
  respiration: {
    rate: number;
    depth: number;
    regularity: number;
  };
  hasRespirationData: boolean;
  glucose: {
    value: number;
    trend: 'stable' | 'rising' | 'falling' | 'rising_rapidly' | 'falling_rapidly' | 'unknown';
  };
  lipids: {
    totalCholesterol: number;
    hdl: number;
    ldl: number;
    triglycerides: number;
    confidence?: number;
  } | null;
  lastArrhythmiaData: {
    timestamp: number;
    rmssd: number;
    rrVariation: number;
  } | null;
  hemoglobin: {
    value: number;
    confidence: number;
  };
  cholesterol?: {
    totalCholesterol: number;
    hdl: number;
    ldl: number;
    triglycerides: number;
    confidence?: number;
  };
}

export const initialVitalSigns: VitalSigns = {
  spo2: 0,
  pressure: "--/--",
  arrhythmiaStatus: "--",
  respiration: { rate: 0, depth: 0, regularity: 0 },
  hasRespirationData: false,
  glucose: { value: 0, trend: 'unknown' },
  lipids: null,
  lastArrhythmiaData: null,
  hemoglobin: { value: 0, confidence: 0 },
  cholesterol: null
};
