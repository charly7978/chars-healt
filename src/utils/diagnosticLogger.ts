/**
 * Utilidad para diagnóstico y depuración de detección de arritmias
 */

// Almacenamos datos para análisis
const diagnosticLogs: Array<{
  timestamp: string;
  source: string;
  type: string;
  data: any;
}> = [];

// Máximo de logs para evitar problemas de memoria
const MAX_LOGS = 1000;

// Estadísticas para medir rendimiento
let performanceStats = {
  processedSignals: 0,
  withAmplitude: 0,
  detections: 0,
  falsePositives: 0, // Estimado basado en detecciones consecutivas
  startTime: new Date().getTime(),
  lastResetTime: new Date().getTime()
};

/**
 * Registra un evento de diagnóstico
 */
export function logDiagnostic(source: string, type: string, data: any) {
  if (diagnosticLogs.length >= MAX_LOGS) {
    // Eliminar los primeros logs si excedemos el límite
    diagnosticLogs.splice(0, 100);
  }
  
  diagnosticLogs.push({
    timestamp: new Date().toISOString(),
    source,
    type,
    data
  });
  
  // Actualizar estadísticas de rendimiento
  if (type === 'SignalProcessing') {
    performanceStats.processedSignals++;
    if (data.amplitudeProvided || data.amplitudeReceived) {
      performanceStats.withAmplitude++;
    }
  }
  else if (type === 'Detection') {
    performanceStats.detections++;
    
    // Intento de identificar falsos positivos (detecciones muy cercanas)
    const lastDetectionLogs = getLastDiagnostics(source, 'Detection', 2);
    if (lastDetectionLogs.length > 1) {
      const currentTime = new Date().getTime();
      const prevDetectionTime = new Date(lastDetectionLogs[0].timestamp).getTime();
      
      // Si hay detecciones muy cercanas (menos de 800ms), puede ser un falso positivo
      if (currentTime - prevDetectionTime < 800) {
        performanceStats.falsePositives++;
      }
    }
  }
  else if (type === 'Reset') {
    performanceStats.lastResetTime = new Date().getTime();
  }
  
  // En modo debug, también mostramos en consola
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[${source}] ${type}:`, data);
  }
}

/**
 * Obtiene todos los logs de diagnóstico
 */
export function getDiagnosticLogs() {
  return [...diagnosticLogs];
}

/**
 * Obtiene los últimos logs de un tipo específico
 */
export function getLastDiagnostics(source: string, type: string, count: number = 10) {
  return diagnosticLogs
    .filter(log => log.source === source && log.type === type)
    .slice(-count);
}

/**
 * Limpia todos los logs
 */
export function clearDiagnosticLogs() {
  diagnosticLogs.length = 0;
  
  // Reiniciar estadísticas
  performanceStats = {
    processedSignals: 0,
    withAmplitude: 0,
    detections: 0,
    falsePositives: 0,
    startTime: new Date().getTime(),
    lastResetTime: new Date().getTime()
  };
}

/**
 * Obtiene estadísticas de rendimiento
 */
export function getPerformanceStats() {
  const currentTime = new Date().getTime();
  const runningTimeMs = currentTime - performanceStats.startTime;
  const runningTimeSec = runningTimeMs / 1000;
  const timeSinceLastResetMs = currentTime - performanceStats.lastResetTime;
  
  return {
    ...performanceStats,
    runningTimeMs,
    runningTimeSec,
    timeSinceLastResetMs,
    detectionRate: runningTimeSec > 0 ? performanceStats.detections / runningTimeSec : 0,
    amplitudeRate: performanceStats.processedSignals > 0 ? 
      performanceStats.withAmplitude / performanceStats.processedSignals : 0,
    estimatedFalsePositiveRate: performanceStats.detections > 0 ?
      performanceStats.falsePositives / performanceStats.detections : 0
  };
}

// Objeto singleton para diagnóstico de arritmias
export const ArrhythmiaDiagnostics = {
  /**
   * Registra un evento de procesamiento de señal
   */
  logSignalProcessing: (data: any) => {
    logDiagnostic('ArrhythmiaDetection', 'SignalProcessing', data);
  },
  
  /**
   * Registra una detección de arritmia
   */
  logDetection: (data: any) => {
    logDiagnostic('ArrhythmiaDetection', 'Detection', data);
  },
  
  /**
   * Registra un reset del detector
   */
  logReset: (data: any) => {
    logDiagnostic('ArrhythmiaDetection', 'Reset', data);
  },
  
  /**
   * Registra un error en el detector
   */
  logError: (data: any) => {
    logDiagnostic('ArrhythmiaDetection', 'Error', data);
  },
  
  /**
   * Registra información de rendimiento
   */
  logPerformance: (data: any) => {
    logDiagnostic('ArrhythmiaDetection', 'Performance', data);
  },
  
  /**
   * Obtiene los últimos eventos de detección
   */
  getLastDetections: (count: number = 10) => {
    return getLastDiagnostics('ArrhythmiaDetection', 'Detection', count);
  },
  
  /**
   * Obtiene un resumen de diagnóstico
   */
  getDiagnosticSummary: () => {
    const detections = getLastDiagnostics('ArrhythmiaDetection', 'Detection', 50);
    const processing = getLastDiagnostics('ArrhythmiaDetection', 'SignalProcessing', 50);
    const resets = getLastDiagnostics('ArrhythmiaDetection', 'Reset', 10);
    const errors = getLastDiagnostics('ArrhythmiaDetection', 'Error', 10);
    const performance = getPerformanceStats();
    
    return {
      detectionCount: detections.length,
      lastDetection: detections.length > 0 ? detections[detections.length - 1] : null,
      processingCount: processing.length,
      resetCount: resets.length,
      lastReset: resets.length > 0 ? resets[resets.length - 1] : null,
      errorCount: errors.length,
      lastError: errors.length > 0 ? errors[errors.length - 1] : null,
      performance
    };
  },
  
  /**
   * Obtiene información de rendimiento
   */
  getPerformanceStats: () => {
    return getPerformanceStats();
  }
}; 