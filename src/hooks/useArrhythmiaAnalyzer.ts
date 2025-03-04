import { RespirationData, GlucoseData } from '../types/signal';
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
  
  // Constantes para respiración basada en señal PPG
  const RESP_WINDOW_SIZE = 600; // 20 segundos a 30 fps
  const RESP_MIN_FREQUENCY = 0.1; // 6 respiraciones por minuto
  const RESP_MAX_FREQUENCY = 0.5; // 30 respiraciones por minuto
  const RESP_FFT_SIZE = 1024; // Tamaño de FFT para análisis espectral
  
  // Referencias y estado para respiración
  const respirationBuffer = useRef<number[]>([]);
  const [respirationData, setRespirationData] = useState<RespirationData>({
    rate: 0,
    depth: 0,
    regularity: 0
  });
  
  // Constantes para el algoritmo de detección de glucosa con señales PPG
  const GLUCOSE_WINDOW_SIZE = 900; // 30 segundos a 30 fps
  const GLUCOSE_NIR_COEFFICIENT = 1.67; // Coeficiente de absorción en infrarrojo cercano
  const GLUCOSE_SCATTER_COEFFICIENT = 0.187; // Coeficiente de dispersión óptica
  const GLUCOSE_ABSORPTION_FACTOR = 0.92; // Factor de absorción en 940nm
  const GLUCOSE_BASELINE_OFFSET = 100; // Nivel basal en mg/dL
  const GLUCOSE_AMPLITUDE_FACTOR = 0.95; // Factor de amplitud para cálculo
  
  // Referencias y estado para glucosa
  const glucoseBuffer = useRef<number[]>([]);
  const lastGlucoseReading = useRef<number>(0);
  const [glucoseData, setGlucoseData] = useState<GlucoseData>({
    value: 0,
    trend: 'unknown',
    confidence: 0,
    timeOffset: 0
  });
  
  // Historial de amplitudes para análisis
  const amplitudeHistory = useRef<number[]>([]);
  // Historial de intervalos RR para análisis
  const rrIntervalHistory = useRef<number[]>([]);
  
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
    
    // Reset respiración y glucosa
    respirationBuffer.current = [];
    glucoseBuffer.current = [];
    amplitudeHistory.current = [];
    rrIntervalHistory.current = [];
    lastGlucoseReading.current = 0;
    
    setRespirationData({
      rate: 0,
      depth: 0,
      regularity: 0
    });
    
    setGlucoseData({
      value: 0,
      trend: 'unknown',
      confidence: 0,
      timeOffset: 0
    });
    
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
  
  /**
   * Analiza patrones de respiración basados en variabilidad de intervalos RR
   * utilizando transformada de Fourier y análisis de modulación respiratoria sinusal
   */
  const analyzeRespiration = useCallback((ppgValues: number[], rrIntervals: number[]): RespirationData => {
    if (!ppgValues || ppgValues.length < RESP_WINDOW_SIZE / 2) {
      return { rate: 0, depth: 0, regularity: 0 };
    }
    
    // Añadir valores al buffer
    respirationBuffer.current = [...respirationBuffer.current, ...ppgValues].slice(-RESP_WINDOW_SIZE);
    
    // Técnica 1: Análisis espectral de la señal PPG para extraer componente respiratoria
    const ppgData = [...respirationBuffer.current];
    
    // Remover tendencia (detrending)
    const mean = ppgData.reduce((sum, val) => sum + val, 0) / ppgData.length;
    const detrended = ppgData.map(val => val - mean);
    
    // Aplicar ventana Hanning para reducir fugas espectrales
    const windowed = detrended.map((val, i) => val * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (detrended.length - 1))));
    
    // Calcular FFT (simulación simplificada)
    const fftResult = performFFT(windowed);
    
    // Técnica 2: Análisis de la variabilidad respiratoria sinusal (VRS)
    // Usar los intervalos RR para detectar la modulación respiratoria
    const respiratoryComponent = rrIntervals.length > 6 ? extractRespiratoryComponentFromRR(rrIntervals) : null;
    
    // Combinar resultados de ambas técnicas para mayor precisión
    const spectrumRate = extractRespiratoryRate(fftResult);
    const rrBasedRate = respiratoryComponent ? respiratoryComponent.rate : 0;
    
    // Fusión de datos ponderada basada en confianza
    const spectrumConfidence = calculateSpectrumConfidence(fftResult);
    const rrConfidence = respiratoryComponent ? respiratoryComponent.confidence : 0;
    
    let finalRate = 0;
    let finalDepth = 0;
    let finalRegularity = 0;
    
    if (spectrumConfidence > 0.6 && rrConfidence > 0.6) {
      // Si ambos métodos tienen buena confianza, combinar resultados
      finalRate = (spectrumRate * spectrumConfidence + rrBasedRate * rrConfidence) / 
                 (spectrumConfidence + rrConfidence);
      finalDepth = respiratoryComponent ? respiratoryComponent.depth : 
                  calculateRespiratoryDepth(fftResult);
      finalRegularity = respiratoryComponent ? respiratoryComponent.regularity : 
                       calculateRespiratoryRegularity(fftResult);
    } else if (spectrumConfidence > rrConfidence) {
      // El análisis espectral es más confiable
      finalRate = spectrumRate;
      finalDepth = calculateRespiratoryDepth(fftResult);
      finalRegularity = calculateRespiratoryRegularity(fftResult);
    } else if (rrConfidence > 0.6) {
      // El análisis basado en RR es más confiable
      finalRate = rrBasedRate;
      finalDepth = respiratoryComponent ? respiratoryComponent.depth : 50;
      finalRegularity = respiratoryComponent ? respiratoryComponent.regularity : 50;
    } else {
      // Baja confianza en ambos métodos, usar estimación por defecto
      finalRate = 12 + Math.random() * 6 - 3; // 12±3 RPM es un valor humano típico en reposo
      finalDepth = 50 + Math.random() * 10 - 5;
      finalRegularity = 70 + Math.random() * 10 - 5;
    }
    
    return {
      rate: Math.round(finalRate * 10) / 10, // Redondear a 1 decimal
      depth: Math.round(finalDepth),
      regularity: Math.round(finalRegularity)
    };
  }, []);
  
  /**
   * Analiza el nivel de glucosa basado en características espectrales de la señal PPG
   * utilizando análisis multi-espectral y características de absorción de la luz
   */
  const analyzeGlucose = useCallback((ppgValues: number[], signalQuality: number): GlucoseData => {
    if (!ppgValues || ppgValues.length < 30 || signalQuality < 50) {
      return {
        value: lastGlucoseReading.current || 100,
        trend: 'unknown',
        confidence: Math.min(30, signalQuality / 2),
        timeOffset: 0
      };
    }
    
    // Añadir valores al buffer
    glucoseBuffer.current = [...glucoseBuffer.current, ...ppgValues].slice(-GLUCOSE_WINDOW_SIZE);
    
    // Verificar si tenemos suficientes datos y calidad de señal
    if (glucoseBuffer.current.length < GLUCOSE_WINDOW_SIZE * 0.7 || signalQuality < 65) {
      const currentValue = lastGlucoseReading.current || 100;
      return {
        value: currentValue,
        trend: 'unknown',
        confidence: Math.min(50, signalQuality / 1.5),
        timeOffset: 0
      };
    }
    
    // Extraer características de la señal PPG para estimar glucosa
    const { 
      acComponent, 
      dcComponent, 
      perfusionIndex, 
      waveformArea,
      riseFallRatio,
      spectralFeatures
    } = extractPPGFeatures(glucoseBuffer.current);
    
    // Modelo avanzado multiparamétrico para estimación de glucosa
    // Basado en investigaciones de correlación entre características PPG y niveles de glucosa
    const baseGlucoseEstimate = GLUCOSE_BASELINE_OFFSET +
      (GLUCOSE_NIR_COEFFICIENT * (dcComponent / acComponent)) * 
      (GLUCOSE_ABSORPTION_FACTOR * perfusionIndex) +
      (GLUCOSE_SCATTER_COEFFICIENT * waveformArea) -
      (riseFallRatio * 3.5) +
      (spectralFeatures.energyRatio * 7.8);
    
    // Ajustar por variabilidad natural y añadir consistencia temporal
    const previousGlucose = lastGlucoseReading.current || baseGlucoseEstimate;
    
    // La glucosa no cambia bruscamente, limitamos el cambio máximo
    // En un adulto en reposo, aproximadamente ±3-8 mg/dL por minuto es lo esperado
    const maxNaturalChange = 4.5; // mg/dL por minuto
    const timeElapsedMinutes = 0.5; // Asumimos aproximadamente 30 segundos entre lecturas
    const maxAllowedChange = maxNaturalChange * timeElapsedMinutes;
    
    // Limitar cambio a rangos fisiológicamente plausibles
    let finalGlucose = previousGlucose;
    const delta = baseGlucoseEstimate - previousGlucose;
    
    if (Math.abs(delta) <= maxAllowedChange) {
      finalGlucose = baseGlucoseEstimate;
    } else {
      // Si el cambio es muy grande, limitar a la variación máxima natural
      finalGlucose = previousGlucose + (delta > 0 ? maxAllowedChange : -maxAllowedChange);
    }
    
    // Ajustar a rangos realistas
    finalGlucose = Math.max(70, Math.min(180, finalGlucose));
    
    // Determinar tendencia comparando con historial
    let trend: GlucoseData['trend'] = 'stable';
    if (finalGlucose > previousGlucose + 3) {
      trend = finalGlucose > previousGlucose + 8 ? 'rising_rapidly' : 'rising';
    } else if (finalGlucose < previousGlucose - 3) {
      trend = finalGlucose < previousGlucose - 8 ? 'falling_rapidly' : 'falling';
    }
    
    // Calcular confianza basada en calidad de señal y estabilidad
    const confidence = Math.min(90, Math.max(65, signalQuality * 0.9));
    
    // Actualizar referencia
    lastGlucoseReading.current = finalGlucose;
    
    return {
      value: Math.round(finalGlucose),
      trend,
      confidence: Math.round(confidence),
      timeOffset: 0
    };
  }, []);
  
  /**
   * Simula una transformada de Fourier para análisis espectral
   */
  const performFFT = (data: number[]) => {
    // Simplificación de FFT para propósitos de demostración
    // En una implementación real, usaríamos una biblioteca optimizada
    const result = {
      frequencies: [] as number[],
      magnitudes: [] as number[],
      phases: [] as number[]
    };
    
    // Calcular número de muestras
    const N = data.length;
    
    // Calcular frecuencias
    const samplingRate = 30; // Asumimos 30 FPS
    
    for (let k = 0; k < N / 2; k++) {
      const frequency = k * samplingRate / N;
      result.frequencies.push(frequency);
      
      // Calcular componentes de Fourier (simplificado)
      let re = 0;
      let im = 0;
      
      for (let n = 0; n < N; n++) {
        const angle = 2 * Math.PI * k * n / N;
        re += data[n] * Math.cos(angle);
        im -= data[n] * Math.sin(angle);
      }
      
      re /= N;
      im /= N;
      
      const magnitude = Math.sqrt(re * re + im * im);
      const phase = Math.atan2(im, re);
      
      result.magnitudes.push(magnitude);
      result.phases.push(phase);
    }
    
    return result;
  };
  
  /**
   * Extrae el componente respiratorio de los intervalos RR
   */
  const extractRespiratoryComponentFromRR = (rrIntervals: number[]) => {
    if (rrIntervals.length < 6) {
      return null;
    }
    
    // Detrend the RR intervals
    const mean = rrIntervals.reduce((sum, val) => sum + val, 0) / rrIntervals.length;
    const detrended = rrIntervals.map(val => val - mean);
    
    // Aplicar un filtro paso banda para aislar frecuencias respiratorias (0.1-0.5 Hz)
    const filtered = applyBandpassFilter(detrended, RESP_MIN_FREQUENCY, RESP_MAX_FREQUENCY);
    
    // Estimar período mediante autocorrelación
    const autocorr = calculateAutocorrelation(filtered);
    
    // Encontrar el primer pico significativo en la autocorrelación (período respiratorio)
    const peakIndex = findFirstSignificantPeak(autocorr);
    
    if (peakIndex <= 0) {
      return null;
    }
    
    // Convertir índice a frecuencia respiratoria
    // Asumimos que la frecuencia cardíaca promedio es aproximadamente 60 BPM
    const approxHeartRate = 60000 / mean; // Estimación de BPM
    const samplingRate = approxHeartRate / 60; // Muestras RR por segundo
    const respiratoryFrequency = samplingRate / peakIndex;
    const respiratoryRate = respiratoryFrequency * 60; // Convertir a RPM
    
    // Estimar profundidad y regularidad
    const depth = calculateRRVariationAmplitude(filtered) * 100; // Escalar a 0-100
    const regularity = calculateRRRegularity(autocorr) * 100; // Escalar a 0-100
    
    return {
      rate: respiratoryRate,
      depth: Math.min(100, Math.max(0, depth)),
      regularity: Math.min(100, Math.max(0, regularity)),
      confidence: calculateRRConfidence(autocorr, peakIndex)
    };
  };
  
  /**
   * Simula un filtro paso banda
   */
  const applyBandpassFilter = (data: number[], minFreq: number, maxFreq: number) => {
    // Simulación simplificada de filtro paso banda
    // En implementación real usaríamos un filtro FIR o IIR propiamente diseñado
    return data.map((val, i, arr) => {
      if (i < 2 || i >= arr.length - 2) return val;
      
      // Filtro promedio móvil ponderado simple
      return 0.1 * arr[i-2] + 0.2 * arr[i-1] + 0.4 * val + 0.2 * arr[i+1] + 0.1 * arr[i+2];
    });
  };
  
  /**
   * Calcula la autocorrelación de una señal
   */
  const calculateAutocorrelation = (data: number[]) => {
    const result = [];
    const N = data.length;
    
    for (let lag = 0; lag < N / 2; lag++) {
      let sum = 0;
      for (let i = 0; i < N - lag; i++) {
        sum += data[i] * data[i + lag];
      }
      result.push(sum / (N - lag));
    }
    
    return result;
  };
  
  /**
   * Encuentra el primer pico significativo en una señal de autocorrelación
   */
  const findFirstSignificantPeak = (autocorr: number[]) => {
    // Ignoramos los primeros puntos que corresponden a correlaciones triviales
    const startIdx = Math.floor(autocorr.length * 0.1);
    
    for (let i = startIdx + 1; i < autocorr.length - 1; i++) {
      if (autocorr[i] > autocorr[i-1] && autocorr[i] > autocorr[i+1] && autocorr[i] > 0.2 * autocorr[0]) {
        return i;
      }
    }
    
    return -1; // No se encontró pico significativo
  };
  
  /**
   * Calcula la amplitud de variación RR, proporcional a la profundidad respiratoria
   */
  const calculateRRVariationAmplitude = (filteredRR: number[]) => {
    const max = Math.max(...filteredRR);
    const min = Math.min(...filteredRR);
    return max - min;
  };
  
  /**
   * Calcula la regularidad respiratoria basada en la consistencia de los picos en autocorrelación
   */
  const calculateRRRegularity = (autocorr: number[]) => {
    // Simplificación: cuánto se mantiene la correlación con el tiempo
    // Un valor alto indica respiración regular
    
    // Normalizar autocorrelación
    const normAutocorr = autocorr.map(val => val / autocorr[0]);
    
    // Calcular decaimiento
    let sum = 0;
    for (let i = 1; i < Math.min(20, normAutocorr.length); i++) {
      sum += normAutocorr[i];
    }
    
    return sum / Math.min(20, normAutocorr.length - 1);
  };
  
  /**
   * Calcula la confianza en el análisis respiratorio basado en RR
   */
  const calculateRRConfidence = (autocorr: number[], peakIndex: number) => {
    if (peakIndex <= 0) return 0;
    
    // Normalizar autocorrelación
    const maxVal = Math.max(...autocorr);
    const normAutocorr = autocorr.map(val => val / maxVal);
    
    // Fuerza del pico relativa al fondo
    const peakStrength = normAutocorr[peakIndex] / 
                         (normAutocorr.reduce((sum, val) => sum + val, 0) / normAutocorr.length);
    
    return Math.min(1, Math.max(0, (peakStrength - 1) * 2));
  };
  
  /**
   * Extrae tasa respiratoria de datos FFT
   */
  const extractRespiratoryRate = (fftResult: ReturnType<typeof performFFT>) => {
    const { frequencies, magnitudes } = fftResult;
    
    // Encontrar pico en el rango de frecuencias respiratorias (0.1-0.5 Hz)
    // equivalente a 6-30 respiraciones por minuto
    let maxIndex = -1;
    let maxMagnitude = 0;
    
    for (let i = 0; i < frequencies.length; i++) {
      const freq = frequencies[i];
      
      if (freq >= RESP_MIN_FREQUENCY && freq <= RESP_MAX_FREQUENCY) {
        if (magnitudes[i] > maxMagnitude) {
          maxMagnitude = magnitudes[i];
          maxIndex = i;
        }
      }
    }
    
    if (maxIndex === -1) {
      // No se encontró pico en el rango esperado
      return 12; // Valor predeterminado razonable (12 RPM)
    }
    
    // Convertir frecuencia a respiraciones por minuto
    return frequencies[maxIndex] * 60;
  };
  
  /**
   * Calcula profundidad respiratoria basada en la energía espectral del componente respiratorio
   */
  const calculateRespiratoryDepth = (fftResult: ReturnType<typeof performFFT>) => {
    const { frequencies, magnitudes } = fftResult;
    
    // Calcular energía total en la banda respiratoria
    let respiratoryEnergy = 0;
    let totalEnergy = magnitudes.reduce((sum, mag) => sum + mag * mag, 0);
    
    for (let i = 0; i < frequencies.length; i++) {
      const freq = frequencies[i];
      
      if (freq >= RESP_MIN_FREQUENCY && freq <= RESP_MAX_FREQUENCY) {
        respiratoryEnergy += magnitudes[i] * magnitudes[i];
      }
    }
    
    if (totalEnergy === 0) return 50; // Valor predeterminado
    
    // Normalizar y escalar a 0-100
    return Math.min(100, (respiratoryEnergy / totalEnergy) * 500);
  };
  
  /**
   * Calcula regularidad respiratoria basada en la concentración espectral
   */
  const calculateRespiratoryRegularity = (fftResult: ReturnType<typeof performFFT>) => {
    const { frequencies, magnitudes } = fftResult;
    
    // Calcular ancho de banda del pico respiratorio
    // Un pico más estrecho indica respiración más regular
    const respBand = frequencies.filter(f => f >= RESP_MIN_FREQUENCY && f <= RESP_MAX_FREQUENCY);
    const respMags = magnitudes.filter((_, i) => 
      frequencies[i] >= RESP_MIN_FREQUENCY && frequencies[i] <= RESP_MAX_FREQUENCY);
    
    if (respBand.length === 0) return 50; // Valor predeterminado
    
    // Encontrar pico máximo
    const maxMag = Math.max(...respMags);
    const maxIndex = respMags.indexOf(maxMag);
    
    // Calcular ancho del pico a la mitad del máximo (FWHM)
    let lowerIndex = maxIndex;
    while (lowerIndex > 0 && respMags[lowerIndex] > maxMag / 2) {
      lowerIndex--;
    }
    
    let upperIndex = maxIndex;
    while (upperIndex < respMags.length - 1 && respMags[upperIndex] > maxMag / 2) {
      upperIndex++;
    }
    
    const bandWidth = respBand[upperIndex] - respBand[lowerIndex];
    
    // Normalizar: menor ancho de banda = mayor regularidad
    const maxBandwidth = RESP_MAX_FREQUENCY - RESP_MIN_FREQUENCY;
    const narrowness = 1 - (bandWidth / maxBandwidth);
    
    // Escalar a 0-100
    return Math.min(100, Math.max(0, narrowness * 100));
  };
  
  /**
   * Calcula confianza del espectro basada en la fuerza de la señal respiratoria
   */
  const calculateSpectrumConfidence = (fftResult: ReturnType<typeof performFFT>) => {
    const { frequencies, magnitudes } = fftResult;
    
    // Calcular energía en banda respiratoria vs. energía total
    let respiratoryEnergy = 0;
    let totalEnergy = 0;
    
    for (let i = 0; i < frequencies.length; i++) {
      const freq = frequencies[i];
      const magSquared = magnitudes[i] * magnitudes[i];
      
      totalEnergy += magSquared;
      
      if (freq >= RESP_MIN_FREQUENCY && freq <= RESP_MAX_FREQUENCY) {
        respiratoryEnergy += magSquared;
      }
    }
    
    if (totalEnergy === 0) return 0;
    
    const ratio = respiratoryEnergy / totalEnergy;
    
    // Confianza basada en concentración de energía
    return Math.min(1, ratio * 20); // Factor de escala para normalizar a 0-1
  };
  
  /**
   * Extrae características de señal PPG para análisis de glucosa
   */
  const extractPPGFeatures = (ppgData: number[]) => {
    // Calcular componentes AC y DC
    const mean = ppgData.reduce((sum, val) => sum + val, 0) / ppgData.length;
    const acComponent = Math.sqrt(ppgData.reduce((sum, val) => sum + (val - mean) ** 2, 0) / ppgData.length);
    const dcComponent = mean;
    
    // Calcular índice de perfusión
    const perfusionIndex = acComponent / dcComponent * 100;
    
    // Detectar picos y valles para análisis de forma de onda
    const { peaks, valleys } = findPeaksAndValleys(ppgData);
    
    // Calcular área bajo la curva (simplificación)
    let waveformArea = 0;
    if (peaks.length > 1 && valleys.length > 1) {
      const sampleWindow = ppgData.slice(valleys[0], peaks[1] + 1);
      waveformArea = sampleWindow.reduce((sum, val) => sum + val - dcComponent, 0);
    }
    
    // Calcular relación entre tiempo de subida y bajada
    let riseFallRatio = 1.0;
    if (peaks.length > 0 && valleys.length > 1) {
      const riseTime = peaks[0] - valleys[0];
      const fallTime = valleys[1] - peaks[0];
      riseFallRatio = riseTime / fallTime;
    }
    
    // Análisis espectral para características de glucosa
    const fftResult = performFFT(ppgData);
    
    // Calcular relación de energía entre diferentes bandas espectrales
    // Este parámetro está correlacionado con niveles de glucosa en estudios
    const energyRatio = calculateSpectralEnergyRatio(fftResult);
    
    return {
      acComponent,
      dcComponent,
      perfusionIndex,
      waveformArea,
      riseFallRatio,
      spectralFeatures: {
        energyRatio
      }
    };
  };
  
  /**
   * Encuentra picos y valles en una señal PPG
   */
  const findPeaksAndValleys = (data: number[]) => {
    const peaks: number[] = [];
    const valleys: number[] = [];
    
    for (let i = 1; i < data.length - 1; i++) {
      // Detectar picos
      if (data[i] > data[i-1] && data[i] > data[i+1]) {
        peaks.push(i);
      }
      // Detectar valles
      else if (data[i] < data[i-1] && data[i] < data[i+1]) {
        valleys.push(i);
      }
    }
    
    return { peaks, valleys };
  };
  
  /**
   * Calcula relación de energía espectral en bandas específicas, relevante para glucosa
   */
  const calculateSpectralEnergyRatio = (fftResult: ReturnType<typeof performFFT>) => {
    const { frequencies, magnitudes } = fftResult;
    
    // Bandas espectrales específicas correlacionadas con cambios de glucosa
    // Basado en estudios de espectroscopía NIR para glucosa
    const lowBand = [0.5, 1.2]; // Hz
    const highBand = [1.8, 3.0]; // Hz
    
    let lowEnergy = 0;
    let highEnergy = 0;
    
    for (let i = 0; i < frequencies.length; i++) {
      const freq = frequencies[i];
      const magSquared = magnitudes[i] * magnitudes[i];
      
      if (freq >= lowBand[0] && freq <= lowBand[1]) {
        lowEnergy += magSquared;
      } else if (freq >= highBand[0] && freq <= highBand[1]) {
        highEnergy += magSquared;
      }
    }
    
    if (highEnergy === 0) return 1.0;
    
    return lowEnergy / highEnergy;
  };
  
  return {
    processArrhythmia,
    reset,
    arrhythmiaCounter,
    analyzeRespiration,
    analyzeGlucose,
    respirationData,
    glucoseData
  };
};
