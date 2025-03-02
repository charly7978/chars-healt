
import { useState, useRef, useCallback } from 'react';

/**
 * Hook para analizar arritmias en datos de frecuencia cardíaca
 */
export const useArrhythmiaAnalyzer = () => {
  // Constantes para detección de arritmias - ajustadas para mayor precisión
  const ANALYSIS_WINDOW_SIZE = 12; // Aumentado de 10 a 12 para mejor aprendizaje del patrón
  const ARRHYTHMIA_CONFIRMATION_THRESHOLD = 3; // Aumentado de 2 a 3 para mayor certeza
  const MIN_TIME_BETWEEN_ARRHYTHMIAS = 600; // Aumentado de 450ms a 600ms para evitar falsos positivos
  const PREMATURE_BEAT_RATIO = 0.82; // Reducido de 0.84 a 0.82 (menos estricto)
  const COMPENSATORY_PAUSE_RATIO = 1.15; // Aumentado de 1.08 a 1.15 (más exigente)
  const AMPLITUDE_THRESHOLD_RATIO = 0.75; // Reducido de 0.78 a 0.75 (menos estricto)
  
  // Umbral mínimo de confianza para contar una arritmia - AUMENTADO para mayor precisión
  const MIN_CONFIDENCE_THRESHOLD = 0.85; // Aumentado de 0.75 a 0.85
  
  // Periodo de entrenamiento (warm-up) para establecer el patrón normal
  const WARMUP_BEATS = 8; // Cantidad de latidos necesarios para entrenamiento
  
  // State y refs
  const [arrhythmiaCounter, setArrhythmiaCounter] = useState(0);
  const lastArrhythmiaTime = useRef<number>(0);
  const hasDetectedArrhythmia = useRef<boolean>(false);
  
  // Buffers de análisis
  const rrIntervalsHistoryRef = useRef<number[][]>([]);
  const amplitudesHistoryRef = useRef<number[][]>([]);
  const rmssdHistoryRef = useRef<number[]>([]);
  const rrVariationHistoryRef = useRef<number[]>([]);
  const baselineRRIntervalRef = useRef<number>(0);
  const baselineAmplitudeRef = useRef<number>(0);
  
  // Seguimiento mejorado para mejor detección
  const consecutiveNormalBeatsRef = useRef<number>(0);
  const lastBeatsClassificationRef = useRef<Array<'normal' | 'premature'>>([]);
  
  // Nuevo: Rastreo de fase de entrenamiento
  const isInWarmupRef = useRef<boolean>(true);
  const warmupBeatsCountRef = useRef<number>(0);
  
  // Reducción de sensibilidad para minimizar falsos positivos
  const detectionSensitivityRef = useRef<number>(1.0); // Reducido de 1.2 a 1.0 para ser más conservador
  
  // Modo DEBUG para seguimiento de problemas de detección
  const DEBUG_MODE = true;
  
  /**
   * Resetear todo el estado de análisis
   */
  const reset = useCallback(() => {
    setArrhythmiaCounter(0);
    lastArrhythmiaTime.current = 0;
    hasDetectedArrhythmia.current = false;
    
    // Limpiar buffers
    rrIntervalsHistoryRef.current = [];
    amplitudesHistoryRef.current = [];
    rmssdHistoryRef.current = [];
    rrVariationHistoryRef.current = [];
    baselineRRIntervalRef.current = 0;
    baselineAmplitudeRef.current = 0;
    consecutiveNormalBeatsRef.current = 0;
    lastBeatsClassificationRef.current = [];
    
    // Resetear fase de entrenamiento
    isInWarmupRef.current = true;
    warmupBeatsCountRef.current = 0;
    
    console.log("Arrhythmia analyzer reset - Entrenar con nuevos latidos");
  }, []);
  
  /**
   * Calcular valores de línea base desde un período estable de mediciones
   */
  const calculateBaselines = useCallback((intervals: number[], amplitudes: number[] = []) => {
    if (intervals.length < 5) return;
    
    // Método mejorado de cálculo de línea base - usar 70% central de valores
    const sortedRR = [...intervals].sort((a, b) => a - b);
    const startIdx = Math.floor(sortedRR.length * 0.15);
    const endIdx = Math.floor(sortedRR.length * 0.85);
    const middleValues = sortedRR.slice(startIdx, endIdx);
    
    // Usar mediana de valores centrales como línea base - más robusta
    baselineRRIntervalRef.current = middleValues[Math.floor(middleValues.length / 2)];
    
    // Si hay amplitudes disponibles, calcular línea base
    if (amplitudes.length >= 5) {
      // Los latidos normales típicamente tienen mayor amplitud que los prematuros
      // Ordenar amplitudes en orden descendente y tomar el 70% superior
      const sortedAmplitudes = [...amplitudes].sort((a, b) => b - a);
      const normalBeatsCount = Math.ceil(sortedAmplitudes.length * 0.7);
      const normalAmplitudes = sortedAmplitudes.slice(0, normalBeatsCount);
      baselineAmplitudeRef.current = normalAmplitudes.reduce((a, b) => a + b, 0) / normalAmplitudes.length;
      
      if (DEBUG_MODE) {
        console.log("Arrhythmia analyzer - Valores de línea base calculados:", {
          baselineRRInterval: baselineRRIntervalRef.current,
          baselineAmplitude: baselineAmplitudeRef.current,
          sampleSize: intervals.length
        });
      }
      
      // Fin del período de entrenamiento si tenemos suficientes latidos
      if (isInWarmupRef.current && warmupBeatsCountRef.current >= WARMUP_BEATS) {
        isInWarmupRef.current = false;
        console.log(`Fase de entrenamiento completa después de ${warmupBeatsCountRef.current} latidos. Línea base: ${baselineRRIntervalRef.current}ms`);
      }
    } else if (DEBUG_MODE) {
      // Generar amplitudes si no están disponibles
      baselineAmplitudeRef.current = 100; // Valor predeterminado
      console.log("Arrhythmia analyzer - No hay amplitudes disponibles, usando valor predeterminado");
    }
  }, [DEBUG_MODE]);
  
  /**
   * Analizar intervalos RR para detectar latidos prematuros (arritmias)
   * OPTIMIZADO para reducir falsos positivos
   */
  const analyzeArrhythmia = useCallback((intervals: number[], amplitudes: number[] = []) => {
    if (intervals.length < 3) {
      return { detected: false, confidence: 0, prematureBeat: false };
    }
    
    // Si no hay amplitudes disponibles y tenemos intervalos, generarlas
    if (amplitudes.length === 0 && intervals.length > 0) {
      amplitudes = intervals.map(interval => 100 / (interval || 800));
      if (DEBUG_MODE) {
        console.log("Arrhythmia analyzer - Amplitudes generadas:", amplitudes);
      }
    }
    
    // Si no tenemos línea base aún y tenemos suficientes muestras, calcularla
    if (baselineRRIntervalRef.current === 0 && intervals.length >= 5) {
      calculateBaselines(intervals, amplitudes);
      warmupBeatsCountRef.current += 1;
    }
    
    // Si seguimos sin línea base, calcularla ahora con lo que tenemos
    if (baselineRRIntervalRef.current === 0 && intervals.length >= 3) {
      const sum = intervals.reduce((a, b) => a + b, 0);
      baselineRRIntervalRef.current = sum / intervals.length;
      
      if (amplitudes.length >= 3) {
        const ampSum = amplitudes.reduce((a, b) => a + b, 0);
        baselineAmplitudeRef.current = ampSum / amplitudes.length;
      } else {
        baselineAmplitudeRef.current = 100; // Valor predeterminado
      }
      
      if (DEBUG_MODE) {
        console.log("Arrhythmia analyzer - Cálculo rápido de línea base:", {
          baselineRRInterval: baselineRRIntervalRef.current,
          baselineAmplitude: baselineAmplitudeRef.current
        });
      }
      
      warmupBeatsCountRef.current += 1;
    }
    
    // Incrementar contador de warm-up y verificar si aún estamos en fase de entrenamiento
    if (isInWarmupRef.current) {
      warmupBeatsCountRef.current += 1;
      
      // Finalizar warm-up después de WARMUP_BEATS latidos consecutivos
      if (warmupBeatsCountRef.current >= WARMUP_BEATS) {
        isInWarmupRef.current = false;
        console.log(`Fase de entrenamiento finalizada. Sistema entrenado con ${warmupBeatsCountRef.current} latidos.`);
      }
      
      // Durante fase de entrenamiento, no detectamos arritmias, solo establecemos línea base
      if (isInWarmupRef.current) {
        return { detected: false, confidence: 0, prematureBeat: false };
      }
    }
    
    // Detección de latidos prematuros mejorada
    let prematureBeatConfidence = 0;
    let prematureBeatDetected = false;
    
    // Obtener los intervalos y amplitudes más recientes para análisis
    const recentIntervals = intervals.slice(-5);
    const recentAmplitudes = amplitudes.slice(-5);
    
    if (recentIntervals.length >= 3 && recentAmplitudes.length >= 3 && baselineRRIntervalRef.current > 0) {
      // Obtener información de latidos actuales y anteriores
      const current = recentIntervals[recentIntervals.length - 1];
      const previous = recentIntervals[recentIntervals.length - 2];
      const beforePrevious = recentIntervals[recentIntervals.length - 3];
      
      const currentAmp = recentAmplitudes[recentAmplitudes.length - 1];
      const previousAmp = recentAmplitudes[recentAmplitudes.length - 2];
      const beforePreviousAmp = recentAmplitudes[recentAmplitudes.length - 3];
      
      // Aplicar multiplicador de sensibilidad a umbrales de detección
      const adjustedPrematureRatio = PREMATURE_BEAT_RATIO * detectionSensitivityRef.current;
      const adjustedCompensatoryRatio = COMPENSATORY_PAUSE_RATIO / detectionSensitivityRef.current;
      const adjustedAmplitudeRatio = AMPLITUDE_THRESHOLD_RATIO * detectionSensitivityRef.current;
      
      // Calcular relaciones respecto a línea base
      const currentRatio = current / baselineRRIntervalRef.current;
      const previousRatio = previous / baselineRRIntervalRef.current;
      const currentAmpRatio = currentAmp / baselineAmplitudeRef.current;
      const previousAmpRatio = previousAmp / baselineAmplitudeRef.current;
      
      // Patrón 1: Latido prematuro clásico - REFORZADO 
      // (Normal - Prematuro - Compensatorio)
      const isClassicPattern = 
        (previous < beforePrevious * adjustedPrematureRatio) && // Latido prematuro corto
        (current > previous * adjustedCompensatoryRatio) &&     // Seguido por pausa compensatoria
        // Verificar que el pico prematuro sea significativamente más pequeño que sus vecinos
        (previousAmp < beforePreviousAmp * 0.80) && // Al menos 20% más pequeño que el anterior
        (previousAmp < currentAmp * 0.80) && // Al menos 20% más pequeño que el siguiente
        (previousAmp < baselineAmplitudeRef.current * adjustedAmplitudeRatio) && // Menor amplitud
        (consecutiveNormalBeatsRef.current >= 2); // IMPORTANTE: Requiere latidos normales previos
      
      // SIMPLIFICADO: Reducido a solo el patrón más confiable
      // Los otros patrones generaban falsos positivos
      
      // Calcular confianza basada en coincidencia de patrón
      if (isClassicPattern) {
        prematureBeatConfidence = 0.90; // Alta confianza para patrón clásico
        prematureBeatDetected = true;
        consecutiveNormalBeatsRef.current = 0;
        lastBeatsClassificationRef.current.push('premature');
        
        if (DEBUG_MODE) {
          console.log('Patrón de latido prematuro clásico detectado:', {
            normal: beforePrevious,
            premature: previous,
            compensatory: current,
            normalAmp: beforePreviousAmp,
            prematureAmp: previousAmp,
            confidence: prematureBeatConfidence
          });
        }
      } 
      else {
        // Latido normal - aumentar contador
        consecutiveNormalBeatsRef.current++;
        lastBeatsClassificationRef.current.push('normal');
      }
      
      // Limitar tamaño del historial
      if (lastBeatsClassificationRef.current.length > 8) {
        lastBeatsClassificationRef.current.shift();
      }
    }
    
    // Calcular métricas adicionales para monitoreo
    let rmssd = 0;
    let rrVariation = 0;
    
    if (recentIntervals.length >= 3) {
      // Calcular RMSSD
      let sumSquaredDiff = 0;
      for (let i = 1; i < recentIntervals.length; i++) {
        const diff = recentIntervals[i] - recentIntervals[i-1];
        sumSquaredDiff += Math.pow(diff, 2);
      }
      rmssd = Math.sqrt(sumSquaredDiff / (recentIntervals.length - 1));
      
      // Calcular variación respecto a línea base
      if (baselineRRIntervalRef.current > 0) {
        const latest = recentIntervals[recentIntervals.length - 1];
        rrVariation = Math.abs(latest - baselineRRIntervalRef.current) / baselineRRIntervalRef.current;
      }
      
      // Almacenar para análisis de tendencia
      rmssdHistoryRef.current.push(rmssd);
      rrVariationHistoryRef.current.push(rrVariation);
      
      // Limitar tamaño del historial
      if (rmssdHistoryRef.current.length > ANALYSIS_WINDOW_SIZE) {
        rmssdHistoryRef.current.shift();
        rrVariationHistoryRef.current.shift();
      }
    }
    
    return {
      detected: prematureBeatDetected,
      confidence: prematureBeatConfidence,
      prematureBeat: prematureBeatDetected,
      rmssd,
      rrVariation,
      isInWarmup: isInWarmupRef.current,
      warmupProgress: Math.min(100, (warmupBeatsCountRef.current / WARMUP_BEATS) * 100)
    };
  }, [calculateBaselines, DEBUG_MODE, WARMUP_BEATS]);
  
  /**
   * Procesar nuevos datos de intervalo RR y actualizar estado de arritmia
   * MEJORADO para evitar sobredetección de arritmias
   */
  const processArrhythmia = useCallback((
    rrData: { intervals: number[], lastPeakTime: number | null, amplitudes?: number[] }
  ) => {
    // Verificar si tenemos datos de intervalo válidos
    if (!rrData?.intervals || rrData.intervals.length === 0) {
      if (DEBUG_MODE) console.warn("Arrhythmia analyzer - No se proporcionaron datos de intervalo");
      
      return {
        detected: false,
        arrhythmiaStatus: hasDetectedArrhythmia.current 
          ? `ARRITMIA DETECTADA|${arrhythmiaCounter}`
          : `SIN ARRITMIAS|${arrhythmiaCounter}`,
        lastArrhythmiaData: null,
        isInWarmup: isInWarmupRef.current,
        warmupProgress: Math.min(100, (warmupBeatsCountRef.current / WARMUP_BEATS) * 100)
      };
    }
    
    // Filtrar intervalos inválidos pero ser menos estricto
    const validIntervals = rrData.intervals.filter(interval => interval > 0);
    
    if (validIntervals.length < 3) {
      if (DEBUG_MODE) console.warn("Arrhythmia analyzer - No hay suficientes intervalos válidos:", validIntervals);
      
      return {
        detected: false,
        arrhythmiaStatus: hasDetectedArrhythmia.current 
          ? `ARRITMIA DETECTADA|${arrhythmiaCounter}`
          : `SIN ARRITMIAS|${arrhythmiaCounter}`,
        lastArrhythmiaData: null,
        isInWarmup: isInWarmupRef.current,
        warmupProgress: Math.min(100, (warmupBeatsCountRef.current / WARMUP_BEATS) * 100)
      };
    }
    
    // Almacenar historial de intervalos para análisis de tendencia
    rrIntervalsHistoryRef.current.push([...validIntervals]);
    if (rrIntervalsHistoryRef.current.length > ANALYSIS_WINDOW_SIZE) {
      rrIntervalsHistoryRef.current.shift();
    }
    
    // Almacenar historial de amplitudes si está disponible
    if (rrData.amplitudes && rrData.amplitudes.length > 0) {
      amplitudesHistoryRef.current.push([...rrData.amplitudes]);
      if (amplitudesHistoryRef.current.length > ANALYSIS_WINDOW_SIZE) {
        amplitudesHistoryRef.current.shift();
      }
    }
    
    const currentTime = Date.now();
    const arrhythmiaAnalysis = analyzeArrhythmia(
      validIntervals, 
      rrData.amplitudes || []
    );
    
    // Verificar si estamos en fase de entrenamiento
    if (isInWarmupRef.current) {
      return {
        detected: false,
        arrhythmiaStatus: `CALIBRANDO... ${Math.round(arrhythmiaAnalysis.warmupProgress || 0)}%|0`,
        lastArrhythmiaData: null,
        isInWarmup: true,
        warmupProgress: arrhythmiaAnalysis.warmupProgress || 0
      };
    }
    
    // Verificar que se cumplen todos los criterios para contar una arritmia:
    // 1. Se detectó un latido prematuro
    // 2. La confianza es suficientemente alta
    // 3. Ha pasado suficiente tiempo desde la última detección para evitar duplicados
    if (arrhythmiaAnalysis.detected && 
        arrhythmiaAnalysis.confidence >= MIN_CONFIDENCE_THRESHOLD && 
        currentTime - lastArrhythmiaTime.current >= MIN_TIME_BETWEEN_ARRHYTHMIAS) {
      
      hasDetectedArrhythmia.current = true;
      setArrhythmiaCounter(prev => prev + 1);
      lastArrhythmiaTime.current = currentTime;
      
      if (DEBUG_MODE) {
        console.log("NUEVA ARRITMIA CONTABILIZADA:", {
          rmssd: arrhythmiaAnalysis.rmssd,
          rrVariation: arrhythmiaAnalysis.rrVariation,
          confidence: arrhythmiaAnalysis.confidence,
          intervals: validIntervals.slice(-3),
          amplitudes: rrData.amplitudes?.slice(-3) || [],
          counter: arrhythmiaCounter + 1
        });
      }

      return {
        detected: true,
        arrhythmiaStatus: `ARRITMIA DETECTADA|${arrhythmiaCounter + 1}`,
        lastArrhythmiaData: {
          timestamp: currentTime,
          rmssd: arrhythmiaAnalysis.rmssd,
          rrVariation: arrhythmiaAnalysis.rrVariation,
          isPrematureBeat: true,
          confidence: arrhythmiaAnalysis.confidence
        },
        isInWarmup: false
      };
    }
    
    // Si ya hemos detectado una arritmia, mantener el conteo en el estado
    if (hasDetectedArrhythmia.current) {
      return {
        detected: false,
        arrhythmiaStatus: `ARRITMIA DETECTADA|${arrhythmiaCounter}`,
        lastArrhythmiaData: null,
        isInWarmup: false
      };
    }
    
    return {
      detected: false,
      arrhythmiaStatus: `SIN ARRITMIAS|${arrhythmiaCounter}`,
      lastArrhythmiaData: null,
      isInWarmup: false
    };
  }, [arrhythmiaCounter, analyzeArrhythmia, DEBUG_MODE, MIN_CONFIDENCE_THRESHOLD, MIN_TIME_BETWEEN_ARRHYTHMIAS, WARMUP_BEATS]);
  
  return {
    processArrhythmia,
    reset,
    arrhythmiaCounter
  };
};
