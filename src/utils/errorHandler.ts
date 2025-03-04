
import { ProcessingError } from '../types/signal';

// Simplemente redefino el enum aquí para evitar errores de importación
enum ErrorSeverity {
  INFO = 'INFO',
  WARNING = 'WARNING',
  ERROR = 'ERROR',
  CRITICAL = 'CRITICAL'
}

export const handleProcessingError = (error: ProcessingError, callback?: (error: ProcessingError) => void): void => {
  console.error(`[Processing Error] ${error.code}: ${error.message}`, error);
  
  if (error.details) {
    console.error('Error details:', error.details);
  }
  
  // Manejo específico según el tipo de error
  switch (error.code) {
    case 'SIGNAL_QUALITY_LOW':
      console.warn('Signal quality is too low for reliable processing');
      break;
    case 'CALIBRATION_REQUIRED':
      console.warn('Calibration is required before processing');
      break;
    case 'FINGER_NOT_DETECTED':
      console.info('No finger detected on the camera');
      break;
    // Otros casos de error...
  }
  
  // Manejo según la severidad
  switch (error.severity) {
    case ErrorSeverity.INFO:
      // Solo información, no requiere acción
      break;
    case ErrorSeverity.WARNING:
      // Advertencia, puede requerir atención del usuario
      break;
    case ErrorSeverity.ERROR:
      // Error recuperable, pero requiere acción
      break;
    case ErrorSeverity.CRITICAL:
      // Error crítico, requiere reinicio o intervención mayor
      break;
  }
  
  // Llamar al callback si existe
  if (callback) {
    callback(error);
  }
};

export const createProcessingError = (
  code: string,
  message: string,
  severity: ErrorSeverity,
  details?: any
): ProcessingError => {
  return {
    code,
    message,
    severity,
    timestamp: new Date().toISOString(),
    details
  };
};
