/**
 * Tipos para el monitor respiratorio
 */

/**
 * Patrón respiratorio detectado
 */
export type BreathingPattern = 
  | 'normal'
  | 'rápida'
  | 'lenta'
  | 'irregular'
  | 'desconocido';

/**
 * Ciclo respiratorio individual
 */
export interface BreathingCycle {
  timestamp: number;       // Tiempo de detección
  duration: number;        // Duración del ciclo en ms
  amplitude: number;       // Amplitud relativa
  confidence: number;      // Confianza en la detección (0-1)
}

/**
 * Datos de respiración procesados
 */
export interface RespiratoryData {
  respirationRate: number;       // Respiraciones por minuto (RPM)
  confidence: number;            // Confianza en la estimación (0-1)
  breathingPattern: BreathingPattern; // Patrón respiratorio detectado
  lastCycles: BreathingCycle[];  // Últimos ciclos detectados
  estimatedDepth: number;        // Profundidad estimada (0-1)
  timestamp: number;             // Tiempo de la medición
}

/**
 * Interfaz para la evaluación de riesgo respiratorio
 */
export interface RespiratoryRiskAssessment {
  level: 'normal' | 'alerta' | 'peligro';
  color: string;
  message: string;
}

/**
 * Interfaz para el procesador de señal respiratoria
 */
export interface RespiratoryProcessor {
  processSignal: (ppgValue: number, quality: number) => RespiratoryData | null;
  reset: () => void;
  getLastRespirationRate: () => number;
  getConfidence: () => number;
  getFilteredSignal: () => number[];
  cleanMemory: () => void;
}

/**
 * Niveles de referencia para frecuencia respiratoria
 * Basados en estándares médicos para adultos en reposo
 */
export const RESPIRATORY_RATE_REFERENCES = {
  MIN_NORMAL: 12,       // Mínimo considerado normal
  MAX_NORMAL: 20,       // Máximo considerado normal
  BRADYPNEA: 10,        // Respiración anormalmente lenta
  TACHYPNEA: 24,        // Respiración anormalmente rápida
  SEVERE_BRADYPNEA: 8,  // Respiración severamente lenta
  SEVERE_TACHYPNEA: 30, // Respiración severamente rápida
  
  // Valores de variabilidad (coeficiente de variación)
  NORMAL_VARIABILITY: 0.15,
  HIGH_VARIABILITY: 0.30,
};

/**
 * Evaluar riesgo basado en frecuencia respiratoria
 * @param rate Respiraciones por minuto
 * @param variability Variabilidad (opcional)
 */
export const evaluateRespiratoryRisk = (
  rate: number, 
  variability: number = 0
): RespiratoryRiskAssessment => {
  const REF = RESPIRATORY_RATE_REFERENCES;
  
  // Verificar valores fuera de rango severo
  if (rate <= REF.SEVERE_BRADYPNEA || rate >= REF.SEVERE_TACHYPNEA) {
    return {
      level: 'peligro',
      color: 'text-red-500',
      message: rate <= REF.SEVERE_BRADYPNEA 
        ? 'Respiración extremadamente lenta' 
        : 'Respiración extremadamente rápida'
    };
  }
  
  // Verificar valores fuera de rango normal
  if (rate < REF.MIN_NORMAL || rate > REF.MAX_NORMAL) {
    return {
      level: 'alerta',
      color: 'text-yellow-500',
      message: rate < REF.MIN_NORMAL 
        ? 'Respiración lenta' 
        : 'Respiración rápida'
    };
  }
  
  // Verificar alta variabilidad
  if (variability > REF.HIGH_VARIABILITY) {
    return {
      level: 'alerta',
      color: 'text-yellow-500',
      message: 'Respiración irregular'
    };
  }
  
  // Normal
  return {
    level: 'normal',
    color: 'text-green-500',
    message: 'Respiración normal'
  };
}; 