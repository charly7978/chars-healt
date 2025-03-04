
/**
 * ESTA APPS ES DE MEDICION ULTRA REAL - PROHIBIDA CUALQUIER SIMULACION - NO ESTA PERMITIDO HACER MOVIMIENTOS POR CUENTA DE LA I.A SIN AUTORIZACION DEL USUARIO
 */
import { ProcessingError } from '../types/signal';

type ErrorCallback = (error: ProcessingError) => void;

/**
 * Processes and logs errors from the signal processing pipeline
 */
export const handleProcessingError = (
  error: ProcessingError,
  errorCallback?: ErrorCallback
): void => {
  // Log error to console with appropriate level based on error code
  console.error(`Signal Processing Error [${error.code}]: ${error.message}`);
  
  // Extend the error object with severity information for the UI
  let severity: 'low' | 'medium' | 'high' | 'critical' = 'medium';
  
  // Determine severity based on error code
  switch (error.code) {
    case 'NO_FINGER_DETECTED':
    case 'LOW_SIGNAL_QUALITY':
    case 'CALIBRATION_NEEDED':
      severity = 'low';
      break;
    case 'SIGNAL_PROCESSING_FAILURE':
    case 'CALCULATION_ERROR':
      severity = 'medium';
      break;
    case 'HARDWARE_ERROR':
    case 'CRITICAL_FAILURE':
      severity = 'critical';
      break;
    default:
      severity = 'medium';
  }
  
  // Create extended error with severity
  const extendedError: ProcessingError & { severity: string } = {
    ...error,
    severity
  };
  
  // Call error callback if provided
  if (errorCallback) {
    errorCallback(extendedError);
  }
  
  // For critical errors, also log to a monitoring service if available
  if (severity === 'critical') {
    // In a real app, you might send this to a monitoring service
    console.error('CRITICAL ERROR:', extendedError);
  }
  
  // Record the timestamp in the log for debugging
  const timestamp: string = new Date().toISOString();
  console.log(`Error logged at: ${timestamp}`);
};
