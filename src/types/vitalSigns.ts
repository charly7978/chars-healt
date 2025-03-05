
// Definir un único conjunto de tipos para toda la aplicación
export type VitalSignType = 
  | "heartRate" 
  | "bloodPressure" 
  | "respiration" 
  | "oxygenSaturation"
  | "glucose"
  | "arrhythmia"
  | "hemoglobin";

// Definir interfaces comunes
export interface VitalSigns {
  heartRate: number | null;
  bloodPressure: { systolic: number; diastolic: number } | null;
  respiration: number | null;
  oxygenSaturation: number | null;
  glucose: number | null;
  arrhythmia?: string | null;
  hemoglobin: number | null;
} 

export interface VitalSignsData {
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
  hemoglobin: number | null;
  lastArrhythmiaData: {
    timestamp: number;
    rmssd: number;
    rrVariation: number;
  } | null;
}
