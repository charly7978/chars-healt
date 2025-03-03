// Definir un único conjunto de tipos para toda la aplicación
export type VitalSignType = 
  | "heartRate" 
  | "bloodPressure" 
  | "respiration" 
  | "oxygenSaturation"
  | "glucose"
  | "arrhythmia";

// Definir interfaces comunes
export interface VitalSigns {
  heartRate: number | null;
  bloodPressure: { systolic: number; diastolic: number } | null;
  respiration: number | null;
  oxygenSaturation: number | null;
  glucose: number | null;
  arrhythmia?: string | null;
} 