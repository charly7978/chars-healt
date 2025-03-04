
/**
 * Error handling utilities for medical diagnostic applications
 * ESTA APPS ES DE MEDICION ULTRA REAL - PROHIBIDA CUALQUIER SIMULACION
 */

import { ProcessingError } from '../types/signal';
import { toast } from 'sonner';

// Error codes and their descriptions
const ERROR_CODES = {
  // Signal acquisition errors
  'ACQUISITION_FAILED': 'Error en la adquisición de señal',
  'CAMERA_ERROR': 'Error en la cámara',
  'PERMISSION_DENIED': 'Permisos de cámara denegados',
  'DEVICE_NOT_SUPPORTED': 'Dispositivo no compatible',
  
  // Signal processing errors
  'PROCESSING_ERROR': 'Error en el procesamiento de señal',
  'CALIBRATION_ERROR': 'Error en la calibración',
  'SIGNAL_QUALITY_LOW': 'Calidad de señal demasiado baja',
  'FILTER_ERROR': 'Error en los filtros de señal',
  
  // Analysis errors
  'ANALYSIS_ERROR': 'Error en el análisis de datos',
  'HEARTBEAT_DETECTION_ERROR': 'Error en la detección de latidos',
  'SPO2_CALCULATION_ERROR': 'Error calculando SpO2',
  'GLUCOSE_CALCULATION_ERROR': 'Error calculando glucosa',
  
  // General errors
  'MEMORY_ERROR': 'Error de memoria',
  'INIT_ERROR': 'Error de inicialización',
  'UNKNOWN_ERROR': 'Error desconocido'
};

// Severity levels
export enum ErrorSeverity {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical'
}

// Create error with full details
export const createError = (
  code: string, 
  message: string,
  severity: ErrorSeverity = ErrorSeverity.ERROR,
  details?: any
): ProcessingError => {
  // Use predefined message if available
  const errorMessage = ERROR_CODES[code as keyof typeof ERROR_CODES] || message;
  
  const error: ProcessingError = {
    code,
    message: errorMessage,
    timestamp: Date.now(),
  };
  
  // Log error for debugging
  console.error(`[${severity.toUpperCase()}] ${code}: ${errorMessage}`, details);
  
  return error;
};

// Handle error with appropriate UI notification
export const handleError = (error: ProcessingError, showToast: boolean = true): void => {
  // Determine severity based on error code
  let severity = ErrorSeverity.WARNING;
  
  if (error.code.includes('CRITICAL') || 
      error.code === 'MEMORY_ERROR' ||
      error.code === 'DEVICE_NOT_SUPPORTED') {
    severity = ErrorSeverity.CRITICAL;
  } else if (error.code.includes('ERROR')) {
    severity = ErrorSeverity.ERROR;
  } else if (error.code.includes('LOW') || error.code.includes('QUALITY')) {
    severity = ErrorSeverity.WARNING;
  }
  
  // Log to console
  console.error(`[${severity}] ${error.code}: ${error.message}`);
  
  // Show toast notification if requested
  if (showToast) {
    // Fixed the TypeScript error by using an explicit switch statement instead of comparison
    switch (severity) {
      case ErrorSeverity.CRITICAL:
        toast.error(error.message, {
          description: "Se requiere intervención del usuario",
          duration: 5000
        });
        break;
      case ErrorSeverity.ERROR:
        toast.error(error.message, { duration: 3000 });
        break;
      case ErrorSeverity.WARNING:
        toast.warning(error.message, { duration: 3000 });
        break;
      case ErrorSeverity.INFO:
        toast.info(error.message, { duration: 2000 });
        break;
    }
  }
};

// Check if an error should cause measurement to stop
export const isFatalError = (error: ProcessingError): boolean => {
  const fatalCodes = [
    'DEVICE_NOT_SUPPORTED',
    'PERMISSION_DENIED',
    'MEMORY_ERROR',
    'CRITICAL'
  ];
  
  return fatalCodes.some(code => error.code.includes(code));
};

// Provide user-friendly error recovery instructions
export const getRecoveryInstructions = (error: ProcessingError): string => {
  switch (error.code) {
    case 'SIGNAL_QUALITY_LOW':
      return 'Intente colocar su dedo firmemente sobre la cámara, evitando movimientos';
    case 'CAMERA_ERROR':
      return 'Reinicie la aplicación y asegúrese que ninguna otra app esté usando la cámara';
    case 'PERMISSION_DENIED':
      return 'Revise la configuración de permisos de su dispositivo y permita el acceso a la cámara';
    case 'CALIBRATION_ERROR':
      return 'Intente recalibrar en un ambiente con buena iluminación';
    default:
      return 'Reinicie la aplicación e intente nuevamente';
  }
};
