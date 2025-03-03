
import { useState, useRef, useCallback } from 'react';

/**
 * Hook para analizar arritmias en datos de frecuencia cardíaca
 */
export const useArrhythmiaAnalyzer = () => {
  // Constantes para detección de arritmias - ajustadas para mejor sensibilidad
  const ANALYSIS_WINDOW_SIZE = 10; // Análisis sobre 10 latidos consecutivos
  const ARRHYTHMIA_CONFIRMATION_THRESHOLD = 2; // Reducido de 3 a 2 para detección más rápida
  const MIN_TIME_BETWEEN_ARRHYTHMIAS = 1000; // Aumentado a 1000ms para evitar falsos positivos
  const PREMATURE_BEAT_RATIO = 0.84; // Aumentado de 0.82 a 0.84 (más estricto)
  const COMPENSATORY_PAUSE_RATIO = 1.12; // Aumentado de 1.08 a 1.12 (más exigente)
  const AMPLITUDE_THRESHOLD_RATIO = 0.80; // Aumentado de 0.78 a 0.80 (más exigente)
  
  // Umbral mínimo de confianza para contar una arritmia
  const MIN_CONFIDENCE_THRESHOLD = 0.80; // Aumentado de 0.75 a 0.80
  
  // Estado y referencias
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
  
  // Learning phase tracking
  const learningPhaseRef = useRef<boolean>(true);
  const learningStartTimeRef = useRef<number>(Date.now());
  const LEARNING_PHASE_DURATION = 5000; // 5 segundos exactos
  
  // Detección de patrones rítmicos
  const rhythmPatternsRef = useRef<number[][]>([]);
  const patternConfidenceRef = useRef<number>(0);
  
  // Flag DEBUG para rastrear problemas de detección
  const DEBUG_MODE = true;
  
  /**
   * Reiniciar todo el estado de análisis
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
    rhythmPatternsRef.current = [];
    patternConfidenceRef.current = 0;
    
    // Reset learning phase
    learningPhaseRef.current = true;
    learningStartTimeRef.current = Date.now();
    
    console.log("Analizador de arritmias reiniciado");
  }, []);
  
  /**
   * Verificar y actualizar fase de aprendizaje
   */
  const updateLearningPhase = useCallback(() => {
    if (learningPhaseRef.current) {
      const elapsed = Date.now() - learningStartTimeRef.current;
      if (elapsed >= LEARNING_PHASE_DURATION) {
        learningPhaseRef.current = false;
        
        if (DEBUG_MODE) {
          console.log("Fase de aprendizaje completada después de", 
                     (elapsed/1000).toFixed(1), "segundos. Patrones rítmicos aprendidos:", 
                     rhythmPatternsRef.current.length);
        }
        
        return true; // Fase de aprendizaje completada
      }
    }
    return false; // Todavía en fase de aprendizaje o ya completada anteriormente
  }, [DEBUG_MODE]);
  
  /**
   * Calcular valores de referencia a partir de un período estable de mediciones
   */
  const calculateBaselines = useCallback((intervals: number[], amplitudes: number[] = []) => {
    if (intervals.length < 5) return;
    
    // Método de cálculo de línea base mejorado - usar 70% medio de valores (aumentado de 60%)
    const sortedRR = [...intervals].sort((a, b) => a - b);
    const startIdx = Math.floor(sortedRR.length * 0.15); // Cambiado de 0.2 a 0.15
    const endIdx = Math.floor(sortedRR.length * 0.85); // Cambiado de 0.8 a 0.85
    const middleValues = sortedRR.slice(startIdx, endIdx);
    
    // Usar mediana de valores medios como línea base - más robusta
    baselineRRIntervalRef.current = middleValues[Math.floor(middleValues.length / 2)];
    
    // Si hay amplitudes disponibles, calcular línea base
    if (amplitudes.length >= 5) {
      // Los latidos normales típicamente tienen mayor amplitud que los latidos prematuros
      // Ordenar amplitudes en orden descendente y tomar el 70% superior (aumentado de 60%)
      const sortedAmplitudes = [...amplitudes].sort((a, b) => b - a);
      const normalBeatsCount = Math.ceil(sortedAmplitudes.length * 0.7);
      const normalAmplitudes = sortedAmplitudes.slice(0, normalBeatsCount);
      baselineAmplitudeRef.current = normalAmplitudes.reduce((a, b) => a + b, 0) / normalAmplitudes.length;
      
      // Aprender patrones rítmicos
      learnRhythmPatterns(intervals);
      
      if (DEBUG_MODE) {
        console.log("Analizador de arritmias - Valores de referencia calculados:", {
          intervaloRRBase: baselineRRIntervalRef.current,
          amplitudBase: baselineAmplitudeRef.current,
          tamañoMuestra: intervals.length,
          patrones: rhythmPatternsRef.current.length
        });
      }
    } else if (DEBUG_MODE) {
      // Fix crítico: Generar amplitudes si no están disponibles
      baselineAmplitudeRef.current = 100; // Valor predeterminado
      console.log("Analizador de arritmias - No hay amplitudes disponibles, usando línea base predeterminada");
    }
  }, [DEBUG_MODE]);
  
  /**
   * Aprender patrones rítmicos del corazón
   */
  const learnRhythmPatterns = useCallback((intervals: number[]) => {
    if (intervals.length < 5) return;
    
    rhythmPatternsRef.current = [];
    
    // Buscar patrones comunes (tripletes, cuartetos)
    for (let patternSize = 3; patternSize <= 5; patternSize++) {
      if (intervals.length >= patternSize * 2) {
        // Buscar repeticiones de patrones
        for (let i = 0; i <= intervals.length - patternSize * 2; i++) {
          const pattern1 = intervals.slice(i, i + patternSize);
          const pattern2 = intervals.slice(i + patternSize, i + patternSize * 2);
          
          // Verificar si los patrones son similares
          let isSimilar = true;
          for (let j = 0; j < patternSize; j++) {
            const ratio = pattern1[j] / pattern2[j];
            if (Math.abs(ratio - 1) > 0.12) { // 12% de variación aún es normal
              isSimilar = false;
              break;
            }
          }
          
          // Si son similares, añadir a patrones conocidos
          if (isSimilar) {
            const combinedPattern = pattern1.map((val, idx) => (val + pattern2[idx]) / 2);
            rhythmPatternsRef.current.push(combinedPattern);
          }
        }
      }
    }
    
    // Si no encontramos patrones complejos, usar los últimos intervalos
    if (rhythmPatternsRef.current.length === 0 && intervals.length >= 3) {
      rhythmPatternsRef.current.push(intervals.slice(-3));
    }
    
    // Calcular confianza del patrón
    patternConfidenceRef.current = Math.min(0.95, 0.5 + (rhythmPatternsRef.current.length * 0.15));
    
  }, []);
  
  /**
   * Analizar intervalos RR para detectar latidos prematuros (arritmias)
   */
  const analyzeArrhythmia = useCallback((intervals: number[], amplitudes: number[] = []) => {
    if (intervals.length < 3) {
      return { detected: false, confidence: 0, prematureBeat: false };
    }
    
    // Fix crítico: Si no hay amplitudes disponibles, generarlas a partir de intervalos
    if (amplitudes.length === 0 && intervals.length > 0) {
      amplitudes = intervals.map(interval => 100 / (interval || 800));
      if (DEBUG_MODE) {
        console.log("Analizador de arritmias - Amplitudes generadas:", amplitudes);
      }
    }
    
    // Actualizar fase de aprendizaje
    const learningJustCompleted = updateLearningPhase();
    
    // Si todavía estamos en fase de aprendizaje, recolectar datos pero no detectar arritmias
    if (learningPhaseRef.current) {
      if (DEBUG_MODE && intervals.length > 0) {
        console.log("Analizador de arritmias - En fase de aprendizaje:", {
          tiempoTranscurrido: (Date.now() - learningStartTimeRef.current) / 1000,
          intervalosRecolectados: intervals.length
        });
      }
      
      // Calcular líneas base incluso durante el aprendizaje
      if (baselineRRIntervalRef.current === 0 && intervals.length >= 5) {
        calculateBaselines(intervals, amplitudes);
      }
      
      return { detected: false, confidence: 0, prematureBeat: false };
    }
    
    // Si acabamos de completar el aprendizaje, establecer líneas base
    if (learningJustCompleted || baselineRRIntervalRef.current === 0) {
      calculateBaselines(intervals, amplitudes);
    }
    
    // Fix crítico: Si aún no hay línea base, calcularla ahora con lo que tenemos
    if (baselineRRIntervalRef.current === 0 && intervals.length >= 3) {
      const sum = intervals.reduce((a, b) => a + b, 0);
      baselineRRIntervalRef.current = sum / intervals.length;
      
      if (amplitudes.length >= 3) {
        const ampSum = amplitudes.reduce((a, b) => a + b, 0);
        baselineAmplitudeRef.current = ampSum / amplitudes.length;
      } else {
        baselineAmplitudeRef.current = 100; // Valor predeterminado
      }
      
      // Intentar aprender patrones rítmicos con los datos disponibles
      learnRhythmPatterns(intervals);
      
      if (DEBUG_MODE) {
        console.log("Analizador de arritmias - Cálculo rápido de línea base:", {
          intervaloRRBase: baselineRRIntervalRef.current,
          amplitudBase: baselineAmplitudeRef.current
        });
      }
    }
    
    // Detección mejorada de patrones de latidos prematuros
    let prematureBeatConfidence = 0;
    let prematureBeatDetected = false;
    
    // Obtener los intervalos y amplitudes más recientes para análisis
    const recentIntervals = intervals.slice(-5); // Aumentado de 4 a 5
    const recentAmplitudes = amplitudes.slice(-5); // Aumentado de 4 a 5
    
    if (recentIntervals.length >= 3 && recentAmplitudes.length >= 3 && baselineRRIntervalRef.current > 0) {
      // Obtener información de latidos actuales y anteriores
      const current = recentIntervals[recentIntervals.length - 1];
      const previous = recentIntervals[recentIntervals.length - 2];
      const beforePrevious = recentIntervals[recentIntervals.length - 3];
      
      const currentAmp = recentAmplitudes[recentAmplitudes.length - 1];
      const previousAmp = recentAmplitudes[recentAmplitudes.length - 2];
      const beforePreviousAmp = recentAmplitudes[recentAmplitudes.length - 3];
      
      // Calcular ratios comparados con la línea base
      const currentRatio = current / baselineRRIntervalRef.current;
      const previousRatio = previous / baselineRRIntervalRef.current;
      const currentAmpRatio = currentAmp / baselineAmplitudeRef.current;
      const previousAmpRatio = previousAmp / baselineAmplitudeRef.current;
      const beforePreviousAmpRatio = beforePreviousAmp / baselineAmplitudeRef.current;
      
      // Patrón 1: Latido prematuro clásico - REFORZADO 
      // (Normal - Prematuro - Compensatorio)
      const isClassicPattern = 
        (previous < beforePrevious * PREMATURE_BEAT_RATIO) && // Latido prematuro corto
        (current > previous * COMPENSATORY_PAUSE_RATIO) &&    // Seguido por pausa compensatoria
        // ADICIONAL: Verifica que el pico prematuro sea significativamente más pequeño que sus vecinos
        (previousAmp < beforePreviousAmp * 0.75) && // Debe ser al menos 25% más pequeño que el anterior
        (previousAmp < currentAmp * 0.75) && // Debe ser al menos 25% más pequeño que el siguiente
        (previousAmp < baselineAmplitudeRef.current * AMPLITUDE_THRESHOLD_RATIO); // Amplitud más baja
      
      // Patrón 2: Latido prematuro único entre latidos normales
      const isSinglePremature = 
        (current < baselineRRIntervalRef.current * PREMATURE_BEAT_RATIO) && // Current is premature
        (currentAmp < baselineAmplitudeRef.current * AMPLITUDE_THRESHOLD_RATIO) && // Amplitud baja
        (previous >= baselineRRIntervalRef.current * 0.88); // El anterior era normal (Aumentado de 0.85 a 0.88)
      
      // Patrón 3: Detección directa basada en diferencias de amplitud y RR
      // MODIFICADO para que requiera de más validaciones
      const isAbnormalBeat = 
        (current < baselineRRIntervalRef.current * PREMATURE_BEAT_RATIO) && // RR corto
        (currentAmp < baselineAmplitudeRef.current * AMPLITUDE_THRESHOLD_RATIO) && // Amplitud baja
        (currentAmp < previousAmp * 0.75) && // Debe ser al menos 25% más pequeño que el anterior
        (consecutiveNormalBeatsRef.current >= 4); // Requiere al menos 4 latidos normales previos
      
      // Patrón 4: Latido de amplitud pequeña independiente del tiempo - MODIFICADO
      const isSmallBeat = 
        (currentAmp < baselineAmplitudeRef.current * 0.50) && // Reducido a 0.50 (mucho más pequeño)
        (baselineAmplitudeRef.current > 0) && // Solo si tenemos una línea base establecida
        (consecutiveNormalBeatsRef.current >= 3); // Requiere latidos normales previos
      
      // Fix crítico: Agregar patrón directo de variación RR
      const isRRVariationHigh =
        Math.abs(current - baselineRRIntervalRef.current) / baselineRRIntervalRef.current > 0.40 && // Aumentado a 0.40
        Math.abs(previous - baselineRRIntervalRef.current) / baselineRRIntervalRef.current < 0.12 && // Reducido a 0.12
        (currentAmp < previousAmp * 0.80) && // Criterio adicional de amplitud
        (consecutiveNormalBeatsRef.current >= 3); // Requiere latidos normales previos
      
      // Calcular confianza basada en coincidencia de patrón
      if (isClassicPattern) {
        prematureBeatConfidence = 0.92; // Mantenido en 0.92
        prematureBeatDetected = true;
        consecutiveNormalBeatsRef.current = 0;
        lastBeatsClassificationRef.current.push('premature');
        
        console.log('Patrón de latido prematuro clásico detectado:', {
          normal: beforePrevious,
          prematuro: previous,
          compensatorio: current,
          amplitudNormal: beforePreviousAmp,
          amplitudPrematura: previousAmp,
          patron: 'clasico',
          confianza: prematureBeatConfidence
        });
      } 
      else if (isSinglePremature) {
        prematureBeatConfidence = 0.82; // Mantenido en 0.82
        prematureBeatDetected = true;
        consecutiveNormalBeatsRef.current = 0;
        lastBeatsClassificationRef.current.push('premature');
        
        console.log('Latido prematuro único detectado:', {
          normal: previous,
          prematuro: current,
          amplitudNormal: previousAmp,
          amplitudPrematura: currentAmp,
          patron: 'unico',
          confianza: prematureBeatConfidence
        });
      }
      else if (isAbnormalBeat) {
        prematureBeatConfidence = 0.78; // Mantenido en 0.78
        prematureBeatDetected = true;
        consecutiveNormalBeatsRef.current = 0;
        lastBeatsClassificationRef.current.push('premature');
        
        console.log('Latido anormal detectado:', {
          anormal: current,
          linea_base: baselineRRIntervalRef.current,
          amplitudAnormal: currentAmp,
          amplitudBase: baselineAmplitudeRef.current,
          patron: 'anormal',
          confianza: prematureBeatConfidence
        });
      }
      else if (isSmallBeat) {
        prematureBeatConfidence = 0.72; // Mantenido en 0.72
        prematureBeatDetected = true;
        consecutiveNormalBeatsRef.current = 0;
        lastBeatsClassificationRef.current.push('premature');
        
        console.log('Latido de amplitud pequeña detectado:', {
          amplitud: currentAmp,
          amplitudNormal: baselineAmplitudeRef.current,
          ratio: currentAmp / baselineAmplitudeRef.current,
          patron: 'amplitud-pequeña',
          confianza: prematureBeatConfidence
        });
      }
      else if (isRRVariationHigh) {
        // Fix crítico: Nuevo patrón para detección directa de variación RR
        prematureBeatConfidence = 0.80; // Mantenido en 0.80
        prematureBeatDetected = true;
        consecutiveNormalBeatsRef.current = 0;
        lastBeatsClassificationRef.current.push('premature');
        
        console.log('Patrón de variación RR detectado:', {
          RR_actual: current,
          RR_base: baselineRRIntervalRef.current,
          variacion: Math.abs(current - baselineRRIntervalRef.current) / baselineRRIntervalRef.current
        });
      }
      else {
        // Latido normal - incrementar el contador solo para intervalos y amplitudes consistentes
        if (currentAmpRatio >= 0.85 && Math.abs(currentRatio - 1) <= 0.12) {
          consecutiveNormalBeatsRef.current++;
          lastBeatsClassificationRef.current.push('normal');
        } else {
          // Latido indeterminado - mantener el contador pero no incrementar
          lastBeatsClassificationRef.current.push('normal');
        }
      }
      
      // Limitar tamaño del historial
      if (lastBeatsClassificationRef.current.length > 8) {
        lastBeatsClassificationRef.current.shift();
      }
      
      // Registro de diagnóstico
      if (prematureBeatDetected && DEBUG_MODE) {
        console.log('Analizador de Arritmias - Latido prematuro detectado con confianza:', {
          confianza: prematureBeatConfidence,
          latidosNormalesEnSecuencia: consecutiveNormalBeatsRef.current,
          patron: prematureBeatDetected ? 'Latido prematuro detectado' : 'Latido normal'
        });
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
      
      // Calcular variación desde línea base
      if (baselineRRIntervalRef.current > 0) {
        const latest = recentIntervals[recentIntervals.length - 1];
        rrVariation = Math.abs(latest - baselineRRIntervalRef.current) / baselineRRIntervalRef.current;
      }
      
      // Almacenar para análisis de tendencias
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
      isLearningPhase: learningPhaseRef.current
    };
  }, [calculateBaselines, DEBUG_MODE, updateLearningPhase, learnRhythmPatterns]);
  
  /**
   * Procesar nuevos datos de intervalo RR y actualizar estado de arritmia
   * Ahora sin límite de recuento de arritmias
   */
  const processArrhythmia = useCallback((
    rrData: { intervals: number[], lastPeakTime: number | null, amplitudes?: number[] }
  ) => {
    // Fix crítico: verificar si tenemos datos de intervalo válidos
    if (!rrData?.intervals || rrData.intervals.length === 0) {
      if (DEBUG_MODE) console.warn("Analizador de arritmias - No se proporcionaron datos de intervalo");
      
      return {
        detected: false,
        arrhythmiaStatus: hasDetectedArrhythmia.current 
          ? `ARRITMIA DETECTADA|${arrhythmiaCounter}`
          : `SIN ARRITMIAS|${arrhythmiaCounter}`,
        lastArrhythmiaData: null,
        isLearningPhase: learningPhaseRef.current
      };
    }
    
    // Fix crítico: Filtrar intervalos no válidos pero ser menos estricto
    const validIntervals = rrData.intervals.filter(interval => interval > 0);
    
    if (validIntervals.length < 3) {
      if (DEBUG_MODE) console.warn("Analizador de arritmias - No hay suficientes intervalos válidos:", validIntervals);
      
      return {
        detected: false,
        arrhythmiaStatus: hasDetectedArrhythmia.current 
          ? `ARRITMIA DETECTADA|${arrhythmiaCounter}`
          : `SIN ARRITMIAS|${arrhythmiaCounter}`,
        lastArrhythmiaData: null,
        isLearningPhase: learningPhaseRef.current
      };
    }
    
    // Almacenar historial de intervalos para análisis de tendencias
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
    
    // Durante la fase de aprendizaje, solo informar el estado
    if (arrhythmiaAnalysis.isLearningPhase) {
      const timeRemaining = Math.max(0, LEARNING_PHASE_DURATION - (currentTime - learningStartTimeRef.current));
      return {
        detected: false,
        arrhythmiaStatus: `APRENDIENDO|${Math.ceil(timeRemaining/1000)}`,
        lastArrhythmiaData: null,
        isLearningPhase: true
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
      
      console.log("NUEVA ARRITMIA CONTADA EN HOOK:", {
        rmssd: arrhythmiaAnalysis.rmssd,
        rrVariation: arrhythmiaAnalysis.rrVariation,
        confidence: arrhythmiaAnalysis.confidence,
        intervals: validIntervals.slice(-3),
        amplitudes: rrData.amplitudes?.slice(-3) || [],
        counter: arrhythmiaCounter + 1
      });

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
        isLearningPhase: false
      };
    }
    
    // Si ya hemos detectado una arritmia, mantener el recuento en el estado
    if (hasDetectedArrhythmia.current) {
      return {
        detected: false,
        arrhythmiaStatus: `ARRITMIA DETECTADA|${arrhythmiaCounter}`,
        lastArrhythmiaData: null,
        isLearningPhase: false
      };
    }
    
    return {
      detected: false,
      arrhythmiaStatus: `SIN ARRITMIAS|${arrhythmiaCounter}`,
      lastArrhythmiaData: null,
      isLearningPhase: false
    };
  }, [arrhythmiaCounter, analyzeArrhythmia, DEBUG_MODE, MIN_TIME_BETWEEN_ARRHYTHMIAS]);
  
  return {
    processArrhythmia,
    reset,
    arrhythmiaCounter
  };
};
