import { useState, useCallback, useRef } from 'react';
import { VitalSignsProcessor } from '../modules/VitalSignsProcessor';

export const useVitalSignsProcessor = () => {
  const processorRef = useRef<VitalSignsProcessor | null>(null);
  const [arrhythmiaCounter, setArrhythmiaCounter] = useState(0);
  const lastArrhythmiaTime = useRef<number>(0);
  const hasDetectedArrhythmia = useRef<boolean>(false);
  const MIN_TIME_BETWEEN_ARRHYTHMIAS = 1200; // Aumentado para reducir falsos positivos
  const MAX_ARRHYTHMIAS_PER_SESSION = 12; // Ajustado a un valor más realista
  
  // Buffers para mantener registro de señales y resultados
  const signalHistoryRef = useRef<number[]>([]);
  const rrDataHistoryRef = useRef<Array<{ intervals: number[], lastPeakTime: number | null }>>([]);
  
  // Buffers para el análisis avanzado de arritmias
  const rrIntervalsHistoryRef = useRef<number[][]>([]);
  const rmssdHistoryRef = useRef<number[]>([]);
  const rrVariationHistoryRef = useRef<number[]>([]);
  
  // Buffers para estabilizar la medición de presión arterial
  const bpHistoryRef = useRef<string[]>([]);
  const bpQualityRef = useRef<number[]>([]);
  const lastValidBpRef = useRef<string>("120/80");
  
  // Nuevos buffers para análisis avanzado
  const systolicHistoryRef = useRef<number[]>([]);
  const diastolicHistoryRef = useRef<number[]>([]);
  const heartRateHistoryRef = useRef<number[]>([]);
  const signalQualityHistoryRef = useRef<number[]>([]);
  
  // Parámetros optimizados
  const ANALYSIS_WINDOW_SIZE = 12; // Aumentado para análisis más robusto
  const ARRHYTHMIA_CONFIRMATION_THRESHOLD = 3; // Requiere confirmación en al menos 3 ciclos
  const BP_BUFFER_SIZE = 10; // Aumentado para mayor estabilidad
  const MIN_SIGNAL_QUALITY_FOR_BP = 65; // Calidad mínima para considerar medición de BP válida
  const MIN_SIGNAL_QUALITY_FOR_ARRHYTHMIA = 70; // Calidad mínima para detección de arritmias
  
  // Inicialización perezosa del procesador
  const getProcessor = useCallback(() => {
    if (!processorRef.current) {
      console.log('useVitalSignsProcessor: Creando nueva instancia optimizada');
      processorRef.current = new VitalSignsProcessor();
    }
    return processorRef.current;
  }, []);
  
  // Función avanzada para detectar arritmias basada en algoritmos médicos
  const analyzeArrhythmia = useCallback((intervals: number[], signalQuality: number = 0) => {
    // No procesar si la calidad de señal es insuficiente
    if (signalQuality < MIN_SIGNAL_QUALITY_FOR_ARRHYTHMIA) {
      return { detected: false, confidence: 0, rmssd: 0, rrVariation: 0 };
    }
    
    if (intervals.length < 4) return { detected: false, confidence: 0, rmssd: 0, rrVariation: 0 };
    
    // Filtrar intervalos anómalos antes del análisis
    const validIntervals = intervals.filter(interval => 
      interval >= 400 && interval <= 2000 // Intervalos fisiológicamente plausibles (30-150 BPM)
    );
    
    if (validIntervals.length < 4) {
      return { detected: false, confidence: 0, rmssd: 0, rrVariation: 0 };
    }
    
    // Seleccionar últimos 4 intervalos válidos para análisis
    const recentIntervals = validIntervals.slice(-4);
    
    // 1. Calcular RMSSD (Root Mean Square of Successive Differences)
    let sumSquaredDiff = 0;
    for (let i = 1; i < recentIntervals.length; i++) {
      const diff = recentIntervals[i] - recentIntervals[i-1];
      sumSquaredDiff += Math.pow(diff, 2);
    }
    const rmssd = Math.sqrt(sumSquaredDiff / (recentIntervals.length - 1));
    
    // 2. Calcular variación porcentual de intervalos RR
    const avgRR = recentIntervals.reduce((a, b) => a + b, 0) / recentIntervals.length;
    const lastRR = recentIntervals[recentIntervals.length - 1];
    const rrVariation = Math.abs(lastRR - avgRR) / avgRR;
    
    // 3. Calcular Índice de Arritmia basado en el coeficiente de variación
    const rrStandardDeviation = Math.sqrt(
      recentIntervals.reduce((sum, rr) => sum + Math.pow(rr - avgRR, 2), 0) / recentIntervals.length
    );
    const coefficientOfVariation = rrStandardDeviation / avgRR;
    
    // 4. Calcular Poincaré SD1 (variabilidad a corto plazo)
    let sd1Sum = 0;
    for (let i = 0; i < recentIntervals.length - 1; i++) {
      const x1 = recentIntervals[i];
      const x2 = recentIntervals[i + 1];
      sd1Sum += Math.pow((x2 - x1) / Math.sqrt(2), 2);
    }
    const sd1 = Math.sqrt(sd1Sum / (recentIntervals.length - 1));
    
    // 5. Buscar presencia de latidos ectópicos (significativamente diferentes)
    const ectopicBeatDetected = recentIntervals.some(interval => 
      Math.abs(interval - avgRR) > (avgRR * 0.35) // Reducido a 35% para mayor especificidad
    );
    
    // 6. Algoritmo avanzado para detección de arritmias
    // Criterios basados en literatura médica para arritmias cardíacas
    let arrhythmiaConfidence = 
      (rmssd > 60 ? 0.35 : 0) +                    // Alta RMSSD
      (rrVariation > 0.22 ? 0.25 : 0) +            // Alta variación RR (aumentado umbral)
      (coefficientOfVariation > 0.18 ? 0.20 : 0) + // Alto coeficiente de variación (aumentado)
      (sd1 > 35 ? 0.10 : 0) +                      // Alta variabilidad a corto plazo (aumentado)
      (ectopicBeatDetected ? 0.10 : 0);            // Presencia de latidos ectópicos
    
    // Ajustar confianza según calidad de señal
    arrhythmiaConfidence *= Math.min(1, signalQuality / 100);
    
    // Guardar datos para análisis de tendencias
    rrIntervalsHistoryRef.current.push(recentIntervals);
    if (rrIntervalsHistoryRef.current.length > ANALYSIS_WINDOW_SIZE) {
      rrIntervalsHistoryRef.current.shift();
    }
    
    rmssdHistoryRef.current.push(rmssd);
    if (rmssdHistoryRef.current.length > ANALYSIS_WINDOW_SIZE) {
      rmssdHistoryRef.current.shift();
    }
    
    rrVariationHistoryRef.current.push(rrVariation);
    if (rrVariationHistoryRef.current.length > ANALYSIS_WINDOW_SIZE) {
      rrVariationHistoryRef.current.shift();
    }
    
    // Análisis de tendencias para confirmar arritmias y reducir falsos positivos
    let confirmedArrhythmia = arrhythmiaConfidence >= 0.75; // Aumentado para mayor especificidad
    
    // Si no está confirmado por alta confianza, verificar persistencia en ventana de análisis
    if (!confirmedArrhythmia && rmssdHistoryRef.current.length >= 3) {
      // Contar cuántos de los últimos análisis mostraron alta RMSSD y variación RR
      let confirmationCount = 0;
      for (let i = 1; i <= Math.min(ARRHYTHMIA_CONFIRMATION_THRESHOLD, rmssdHistoryRef.current.length); i++) {
        const historicIndex = rmssdHistoryRef.current.length - i;
        if (historicIndex >= 0 && 
            rmssdHistoryRef.current[historicIndex] > 45 && 
            rrVariationHistoryRef.current[historicIndex] > 0.20) {
          confirmationCount++;
        }
      }
      
      // Confirmar arritmia si hay suficientes ciclos que la respaldan
      if (confirmationCount >= ARRHYTHMIA_CONFIRMATION_THRESHOLD - 1) {
        confirmedArrhythmia = true;
        // Ajustar confianza basada en persistencia
        arrhythmiaConfidence = Math.max(arrhythmiaConfidence, 0.70);
      }
    }
    
    return {
      detected: confirmedArrhythmia,
      confidence: arrhythmiaConfidence,
      rmssd,
      rrVariation
    };
  }, [MIN_SIGNAL_QUALITY_FOR_ARRHYTHMIA, ANALYSIS_WINDOW_SIZE, ARRHYTHMIA_CONFIRMATION_THRESHOLD]);
  
  // Función optimizada para estabilizar mediciones de presión arterial
  const stabilizeBloodPressure = useCallback((rawBP: string, quality: number): string => {
    // No procesar valores vacíos o placeholders
    if (rawBP === "--/--" || rawBP === "0/0") return rawBP;
    
    // No considerar mediciones con calidad insuficiente
    if (quality < MIN_SIGNAL_QUALITY_FOR_BP) {
      return lastValidBpRef.current || "120/80";
    }
    
    // Verificar que el formato sea correcto
    const bpParts = rawBP.split('/');
    if (bpParts.length !== 2) return lastValidBpRef.current || "120/80";
    
    const systolic = parseInt(bpParts[0], 10);
    const diastolic = parseInt(bpParts[1], 10);
    
    // Verificar valores dentro de rangos fisiológicos
    // Basado en guías de la American Heart Association (AHA)
    if (isNaN(systolic) || isNaN(diastolic) ||
        systolic > 250 || systolic < 70 ||     // Rango más estricto
        diastolic > 180 || diastolic < 40 ||   // Rango más estricto
        systolic <= diastolic ||               // Relación fisiológica
        (systolic - diastolic) < 20 ||         // Diferencia mínima fisiológica
        (systolic - diastolic) > 100) {        // Diferencia máxima fisiológica
      return lastValidBpRef.current || "120/80";
    }
    
    // Añadir al historial de mediciones
    bpHistoryRef.current.push(rawBP);
    bpQualityRef.current.push(quality);
    systolicHistoryRef.current.push(systolic);
    diastolicHistoryRef.current.push(diastolic);
    
    // Mantener buffer de tamaño limitado
    if (bpHistoryRef.current.length > BP_BUFFER_SIZE) {
      bpHistoryRef.current.shift();
      bpQualityRef.current.shift();
      systolicHistoryRef.current.shift();
      diastolicHistoryRef.current.shift();
    }
    
    // Si no tenemos suficientes mediciones, usar la actual si es válida
    if (bpHistoryRef.current.length < 3) {
      lastValidBpRef.current = rawBP;
      return rawBP;
    }
    
    // Método de filtrado robusto: Filtro de mediana con ponderación por calidad
    
    // 1. Ordenar valores sistólicos y diastólicos
    const systolicValues = [...systolicHistoryRef.current].sort((a, b) => a - b);
    const diastolicValues = [...diastolicHistoryRef.current].sort((a, b) => a - b);
    
    // 2. Calcular medianas
    const medianSystolic = systolicValues[Math.floor(systolicValues.length / 2)];
    const medianDiastolic = diastolicValues[Math.floor(diastolicValues.length / 2)];
    
    // 3. Calcular desviaciones absolutas medianas (MAD) para identificar outliers
    const systolicMAD = calculateMAD(systolicValues, medianSystolic);
    const diastolicMAD = calculateMAD(diastolicValues, medianDiastolic);
    
    // 4. Filtrar valores atípicos usando MAD (más robusto que desviación estándar)
    const validSystolicIndices = systolicHistoryRef.current.map((val, idx) => {
      const deviation = Math.abs(val - medianSystolic) / (systolicMAD || 1);
      return deviation < 2.5 ? idx : -1; // 2.5 MAD es aproximadamente 3 sigma en distribución normal
    }).filter(idx => idx !== -1);
    
    const validDiastolicIndices = diastolicHistoryRef.current.map((val, idx) => {
      const deviation = Math.abs(val - medianDiastolic) / (diastolicMAD || 1);
      return deviation < 2.5 ? idx : -1;
    }).filter(idx => idx !== -1);
    
    // 5. Encontrar índices comunes (mediciones donde tanto sistólica como diastólica son válidas)
    const validIndices = validSystolicIndices.filter(idx => 
      validDiastolicIndices.includes(idx)
    );
    
    // Si no hay mediciones válidas, usar la mediana
    if (validIndices.length === 0) {
      const stableBP = `${Math.round(medianSystolic)}/${Math.round(medianDiastolic)}`;
      lastValidBpRef.current = stableBP;
      return stableBP;
    }
    
    // 6. Calcular promedio ponderado por calidad de las mediciones válidas
    let totalQuality = 0;
    let weightedSystolicSum = 0;
    let weightedDiastolicSum = 0;
    
    validIndices.forEach(idx => {
      const quality = bpQualityRef.current[idx];
      totalQuality += quality;
      weightedSystolicSum += systolicHistoryRef.current[idx] * quality;
      weightedDiastolicSum += diastolicHistoryRef.current[idx] * quality;
    });
    
    // 7. Calcular valores finales
    const finalSystolic = Math.round(weightedSystolicSum / totalQuality);
    const finalDiastolic = Math.round(weightedDiastolicSum / totalQuality);
    
    // 8. Aplicar suavizado con el último valor válido para evitar cambios bruscos
    const lastBpParts = lastValidBpRef.current.split('/').map(Number);
    const lastSystolic = lastBpParts[0] || 120;
    const lastDiastolic = lastBpParts[1] || 80;
    
    // Factor de suavizado adaptativo basado en la calidad y consistencia
    const consistencyFactor = calculateConsistency(systolicHistoryRef.current, diastolicHistoryRef.current);
    const smoothingFactor = Math.max(0.5, Math.min(0.85, 0.85 - (quality / 200) - (consistencyFactor * 0.2)));
    
    const smoothedSystolic = Math.round(lastSystolic * smoothingFactor + finalSystolic * (1 - smoothingFactor));
    const smoothedDiastolic = Math.round(lastDiastolic * smoothingFactor + finalDiastolic * (1 - smoothingFactor));
    
    // 9. Verificar relación fisiológica en el resultado final
    if (smoothedSystolic <= smoothedDiastolic || 
        (smoothedSystolic - smoothedDiastolic) < 20 || 
        (smoothedSystolic - smoothedDiastolic) > 100) {
      // Si la relación no es fisiológica, usar la mediana filtrada
      const stableBP = `${Math.round(medianSystolic)}/${Math.round(medianDiastolic)}`;
      lastValidBpRef.current = stableBP;
      return stableBP;
    }
    
    // Crear valor final estabilizado
    const stabilizedBP = `${smoothedSystolic}/${smoothedDiastolic}`;
    lastValidBpRef.current = stabilizedBP;
    
    return stabilizedBP;
  }, [MIN_SIGNAL_QUALITY_FOR_BP, BP_BUFFER_SIZE]);
  
  // Función auxiliar: Calcular Desviación Absoluta Mediana (MAD)
  const calculateMAD = (values: number[], median: number): number => {
    const absoluteDeviations = values.map(val => Math.abs(val - median));
    absoluteDeviations.sort((a, b) => a - b);
    return absoluteDeviations[Math.floor(absoluteDeviations.length / 2)];
  };
  
  // Función auxiliar: Calcular consistencia de las mediciones
  const calculateConsistency = (systolicValues: number[], diastolicValues: number[]): number => {
    if (systolicValues.length < 3 || diastolicValues.length < 3) return 0;
    
    // Calcular coeficientes de variación
    const systolicMean = systolicValues.reduce((sum, val) => sum + val, 0) / systolicValues.length;
    const diastolicMean = diastolicValues.reduce((sum, val) => sum + val, 0) / diastolicValues.length;
    
    const systolicStdDev = Math.sqrt(
      systolicValues.reduce((sum, val) => sum + Math.pow(val - systolicMean, 2), 0) / systolicValues.length
    );
    const diastolicStdDev = Math.sqrt(
      diastolicValues.reduce((sum, val) => sum + Math.pow(val - diastolicMean, 2), 0) / diastolicValues.length
    );
    
    const systolicCV = systolicStdDev / systolicMean;
    const diastolicCV = diastolicStdDev / diastolicMean;
    
    // Convertir a factor de consistencia (menor CV = mayor consistencia)
    return Math.max(0, 1 - ((systolicCV + diastolicCV) / 2) * 5);
  };
  
  const processSignal = useCallback((value: number, rrData?: { intervals: number[], lastPeakTime: number | null }, signalQuality: number = 0) => {
    const processor = getProcessor();
    const currentTime = Date.now();
    
    // Almacenar datos para análisis
    signalHistoryRef.current.push(value);
    if (signalHistoryRef.current.length > 300) {
      signalHistoryRef.current = signalHistoryRef.current.slice(-300);
    }
    
    // Almacenar calidad de señal
    signalQualityHistoryRef.current.push(signalQuality);
    if (signalQualityHistoryRef.current.length > 30) {
      signalQualityHistoryRef.current.shift();
    }
    
    // Calcular calidad de señal promedio reciente
    const recentQuality = signalQualityHistoryRef.current.length > 0 
      ? signalQualityHistoryRef.current.reduce((sum, q) => sum + q, 0) / signalQualityHistoryRef.current.length
      : 0;
    
    if (rrData?.intervals && rrData.intervals.length > 0) {
      rrDataHistoryRef.current.push({ ...rrData });
      if (rrDataHistoryRef.current.length > 20) {
        rrDataHistoryRef.current = rrDataHistoryRef.current.slice(-20);
      }
      
      // Calcular y almacenar frecuencia cardíaca
      const lastInterval = rrData.intervals[rrData.intervals.length - 1];
      if (lastInterval > 0) {
        const instantHR = Math.round(60000 / lastInterval);
        if (instantHR >= 30 && instantHR <= 200) { // Rango fisiológico
          heartRateHistoryRef.current.push(instantHR);
          if (heartRateHistoryRef.current.length > 15) {
            heartRateHistoryRef.current.shift();
          }
        }
      }
    }
    
    // Obtenemos los resultados directamente del procesador
    const result = processor.processSignal(value, rrData);
    
    // Estabilizar la presión arterial con nuestro algoritmo mejorado
    const stabilizedBP = stabilizeBloodPressure(result.pressure, recentQuality);
    
    // Análisis avanzado de intervalos RR para arritmias
    if (rrData?.intervals && rrData.intervals.length >= 4) {
      const arrhythmiaAnalysis = analyzeArrhythmia(rrData.intervals, recentQuality);
      
      if (arrhythmiaAnalysis.detected && 
          arrhythmiaAnalysis.confidence >= 0.70 && // Aumentado para mayor especificidad
          currentTime - lastArrhythmiaTime.current >= MIN_TIME_BETWEEN_ARRHYTHMIAS &&
          arrhythmiaCounter < MAX_ARRHYTHMIAS_PER_SESSION) {
        
        hasDetectedArrhythmia.current = true;
        setArrhythmiaCounter(prev => prev + 1);
        lastArrhythmiaTime.current = currentTime;
        
        console.log("Arritmia detectada:", {
          rmssd: arrhythmiaAnalysis.rmssd,
          rrVariation: arrhythmiaAnalysis.rrVariation,
          confidence: arrhythmiaAnalysis.confidence,
          intervals: rrData.intervals.slice(-4),
          counter: arrhythmiaCounter + 1,
          signalQuality: recentQuality
        });

        return {
          spo2: result.spo2,
          pressure: stabilizedBP,
          arrhythmiaStatus: `ARRITMIA DETECTADA|${arrhythmiaCounter + 1}`,
          lastArrhythmiaData: {
            timestamp: currentTime,
            rmssd: arrhythmiaAnalysis.rmssd,
            rrVariation: arrhythmiaAnalysis.rrVariation
          }
        };
      }
    }
    
    // Si ya detectamos una arritmia antes, mantenemos el estado
    if (hasDetectedArrhythmia.current) {
      return {
        spo2: result.spo2,
        pressure: stabilizedBP,
        arrhythmiaStatus: `ARRITMIA DETECTADA|${arrhythmiaCounter}`,
        lastArrhythmiaData: null
      };
    }
    
    // Siempre mostrar "SIN ARRITMIAS" desde el principio
    return {
      spo2: result.spo2,
      pressure: stabilizedBP,
      arrhythmiaStatus: `SIN ARRITMIAS|${arrhythmiaCounter}`
    };
  }, [arrhythmiaCounter, getProcessor, analyzeArrhythmia, stabilizeBloodPressure, MIN_TIME_BETWEEN_ARRHYTHMIAS, MAX_ARRHYTHMIAS_PER_SESSION]);

  const reset = useCallback(() => {
    if (processorRef.current) {
      processorRef.current.reset();
    }
    setArrhythmiaCounter(0);
    lastArrhythmiaTime.current = 0;
    hasDetectedArrhythmia.current = false;
    
    // Limpiar arrays de historial
    signalHistoryRef.current = [];
    rrDataHistoryRef.current = [];
    rrIntervalsHistoryRef.current = [];
    rmssdHistoryRef.current = [];
    rrVariationHistoryRef.current = [];
    bpHistoryRef.current = [];
    bpQualityRef.current = [];
    systolicHistoryRef.current = [];
    diastolicHistoryRef.current = [];
    heartRateHistoryRef.current = [];
    signalQualityHistoryRef.current = [];
    lastValidBpRef.current = "120/80";
    
    console.log("Reseteo completo de procesador de signos vitales");
  }, []);
  
  // Función para limpieza agresiva de memoria
  const cleanMemory = useCallback(() => {
    console.log("useVitalSignsProcessor: Limpieza agresiva de memoria");
    
    // Destruir procesador actual y crear uno nuevo
    if (processorRef.current) {
      processorRef.current.reset();
      processorRef.current = new VitalSignsProcessor();
    }
    
    // Resetear estados
    setArrhythmiaCounter(0);
    lastArrhythmiaTime.current = 0;
    hasDetectedArrhythmia.current = false;
    
    // Vaciar completamente los buffers
    signalHistoryRef.current = [];
    rrDataHistoryRef.current = [];
    rrIntervalsHistoryRef.current = [];
    rmssdHistoryRef.current = [];
    rrVariationHistoryRef.current = [];
    bpHistoryRef.current = [];
    bpQualityRef.current = [];
    systolicHistoryRef.current = [];
    diastolicHistoryRef.current = [];
    heartRateHistoryRef.current = [];
    signalQualityHistoryRef.current = [];
    lastValidBpRef.current = "120/80";
    
    // Forzar garbage collection si está disponible
    if (window.gc) {
      try {
        window.gc();
      } catch (e) {
        console.log("GC no disponible en este entorno");
      }
    }
  }, []);

  return {
    processSignal,
    reset,
    arrhythmiaCounter,
    cleanMemory
  };
};
