
import { useState, useCallback, useRef } from 'react';
import { VitalSignsProcessor } from '../modules/VitalSignsProcessor';

export const useVitalSignsProcessor = () => {
  const processorRef = useRef<VitalSignsProcessor | null>(null);
  const [arrhythmiaCounter, setArrhythmiaCounter] = useState(0);
  const lastArrhythmiaTime = useRef<number>(0);
  const hasDetectedArrhythmia = useRef<boolean>(false);
  const MIN_TIME_BETWEEN_ARRHYTHMIAS = 1000; // Mínimo 1 segundo entre arritmias
  const MAX_ARRHYTHMIAS_PER_SESSION = 15; // Máximo razonable para 30 segundos
  
  // Buffers para mantener registro de señales y resultados
  const signalHistoryRef = useRef<number[]>([]);
  const rrDataHistoryRef = useRef<Array<{ intervals: number[], lastPeakTime: number | null }>>([]);
  
  // Nuevos buffers para el análisis avanzado de arritmias
  const rrIntervalsHistoryRef = useRef<number[][]>([]);
  const rmssdHistoryRef = useRef<number[]>([]);
  const rrVariationHistoryRef = useRef<number[]>([]);
  
  // Buffers para estabilizar la medición de presión arterial
  const bpHistoryRef = useRef<string[]>([]);
  const bpQualityRef = useRef<number[]>([]);
  const lastValidBpRef = useRef<string>("120/80");
  
  // Nueva ventana deslizante para análisis de tendencias
  const ANALYSIS_WINDOW_SIZE = 10; // Análisis sobre 10 latidos consecutivos
  const ARRHYTHMIA_CONFIRMATION_THRESHOLD = 3; // Requiere confirmación en al menos 3 ciclos para reducir falsos positivos
  const BP_BUFFER_SIZE = 8; // Tamaño del buffer para estabilizar presión arterial
  
  // Inicialización perezosa del procesador
  const getProcessor = useCallback(() => {
    if (!processorRef.current) {
      console.log('useVitalSignsProcessor: Creando nueva instancia');
      processorRef.current = new VitalSignsProcessor();
    }
    return processorRef.current;
  }, []);
  
  // Función avanzada para detectar arritmias basada en algoritmos médicos
  const analyzeArrhythmia = useCallback((intervals: number[]) => {
    if (intervals.length < 4) return { detected: false, confidence: 0, rmssd: 0, rrVariation: 0 };
    
    // Seleccionar últimos 4 intervalos para análisis (suficientes para detectar la mayoría de arritmias)
    const recentIntervals = intervals.slice(-4);
    
    // 1. Calcular RMSSD (Root Mean Square of Successive Differences)
    // Un indicador clave de la variabilidad de la frecuencia cardíaca
    let sumSquaredDiff = 0;
    for (let i = 1; i < recentIntervals.length; i++) {
      const diff = recentIntervals[i] - recentIntervals[i-1];
      sumSquaredDiff += Math.pow(diff, 2);
    }
    const rmssd = Math.sqrt(sumSquaredDiff / (recentIntervals.length - 1));
    
    // 2. Calcular variación porcentual de intervalos RR
    const avgRR = recentIntervals.reduce((a, b) => a + b, 0) / recentIntervals.length;
    // Tomar el último intervalo R-R para compararlo con el promedio
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
      Math.abs(interval - avgRR) > (avgRR * 0.40) // 40% de diferencia es indicativo de latido ectópico
    );
    
    // 6. Algoritmo avanzado para detección de arritmias combinando múltiples indicadores
    // Criterios basados en literatura médica para arritmias cardíacas
    let arrhythmiaConfidence = 
      (rmssd > 50 ? 0.35 : 0) +                    // Alta RMSSD
      (rrVariation > 0.2 ? 0.25 : 0) +             // Alta variación RR
      (coefficientOfVariation > 0.15 ? 0.20 : 0) + // Alto coeficiente de variación
      (sd1 > 30 ? 0.10 : 0) +                      // Alta variabilidad a corto plazo
      (ectopicBeatDetected ? 0.10 : 0);            // Presencia de latidos ectópicos
    
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
    let confirmedArrhythmia = arrhythmiaConfidence >= 0.70; // Alta confianza en detección inmediata
    
    // Si no está confirmado por alta confianza, verificar persistencia en ventana de análisis
    if (!confirmedArrhythmia && rmssdHistoryRef.current.length >= 3) {
      // Contar cuántos de los últimos análisis mostraron alta RMSSD y variación RR
      let confirmationCount = 0;
      for (let i = 1; i <= Math.min(ARRHYTHMIA_CONFIRMATION_THRESHOLD, rmssdHistoryRef.current.length); i++) {
        const historicIndex = rmssdHistoryRef.current.length - i;
        if (historicIndex >= 0 && 
            rmssdHistoryRef.current[historicIndex] > 40 && 
            rrVariationHistoryRef.current[historicIndex] > 0.18) {
          confirmationCount++;
        }
      }
      
      // Confirmar arritmia si hay suficientes ciclos que la respaldan
      if (confirmationCount >= ARRHYTHMIA_CONFIRMATION_THRESHOLD - 1) {
        confirmedArrhythmia = true;
        // Ajustar confianza basada en persistencia
        arrhythmiaConfidence = Math.max(arrhythmiaConfidence, 0.65);
      }
    }
    
    return {
      detected: confirmedArrhythmia,
      confidence: arrhythmiaConfidence,
      rmssd,
      rrVariation
    };
  }, []);
  
  // Función para estabilizar mediciones de presión arterial
  const stabilizeBloodPressure = useCallback((rawBP: string, quality: number): string => {
    // No procesar valores vacíos o placeholders
    if (rawBP === "--/--" || rawBP === "0/0") return rawBP;
    
    // Verificar que el formato sea correcto
    const bpParts = rawBP.split('/');
    if (bpParts.length !== 2) return lastValidBpRef.current || "120/80";
    
    const systolic = parseInt(bpParts[0], 10);
    const diastolic = parseInt(bpParts[1], 10);
    
    // Verificar valores dentro de rangos fisiológicos
    // Basado en guías de la American Heart Association (AHA)
    if (isNaN(systolic) || isNaN(diastolic) ||
        systolic > 300 || systolic < 60 ||
        diastolic > 200 || diastolic < 30 ||
        systolic <= diastolic) {
      return lastValidBpRef.current || "120/80";
    }
    
    // Añadir al historial de mediciones
    bpHistoryRef.current.push(rawBP);
    bpQualityRef.current.push(quality);
    
    // Mantener buffer de tamaño limitado
    if (bpHistoryRef.current.length > BP_BUFFER_SIZE) {
      bpHistoryRef.current.shift();
      bpQualityRef.current.shift();
    }
    
    // Si no tenemos suficientes mediciones, usar la actual si es válida
    if (bpHistoryRef.current.length < 3) {
      lastValidBpRef.current = rawBP;
      return rawBP;
    }
    
    // Calcular valor de presión arterial ponderado por calidad y estabilidad
    const bpValues = bpHistoryRef.current.map(bp => {
      const [sys, dia] = bp.split('/').map(Number);
      return { systolic: sys, diastolic: dia };
    });
    
    // Filtrar valores atípicos usando método de la mediana ± 1.5 * IQR
    const systolicValues = bpValues.map(bp => bp.systolic).sort((a, b) => a - b);
    const diastolicValues = bpValues.map(bp => bp.diastolic).sort((a, b) => a - b);
    
    // Algoritmo de cálculo de mediana más robusto
    const calculateMedian = (values: number[]): number => {
      const middle = Math.floor(values.length / 2);
      if (values.length % 2 === 0) {
        return (values[middle - 1] + values[middle]) / 2;
      }
      return values[middle];
    };
    
    const systolicMedian = calculateMedian(systolicValues);
    const diastolicMedian = calculateMedian(diastolicValues);
    
    // Cálculo del rango intercuartílico (IQR)
    const q1Systolic = calculateMedian(systolicValues.slice(0, Math.floor(systolicValues.length / 2)));
    const q3Systolic = calculateMedian(systolicValues.slice(Math.ceil(systolicValues.length / 2)));
    const iqrSystolic = q3Systolic - q1Systolic;
    
    const q1Diastolic = calculateMedian(diastolicValues.slice(0, Math.floor(diastolicValues.length / 2)));
    const q3Diastolic = calculateMedian(diastolicValues.slice(Math.ceil(diastolicValues.length / 2)));
    const iqrDiastolic = q3Diastolic - q1Diastolic;
    
    // Filtrar valores atípicos (outliers)
    const validBpValues = bpValues.filter(bp => {
      return (
        bp.systolic >= (systolicMedian - 1.5 * iqrSystolic) &&
        bp.systolic <= (systolicMedian + 1.5 * iqrSystolic) &&
        bp.diastolic >= (diastolicMedian - 1.5 * iqrDiastolic) &&
        bp.diastolic <= (diastolicMedian + 1.5 * iqrDiastolic)
      );
    });
    
    // Si todos los valores fueron filtrados como outliers, usar la mediana
    if (validBpValues.length === 0) {
      const stableBP = `${Math.round(systolicMedian)}/${Math.round(diastolicMedian)}`;
      lastValidBpRef.current = stableBP;
      return stableBP;
    }
    
    // Calcular presión sistólica y diastólica promedio ponderada por calidad
    let totalQuality = 0;
    let weightedSystolicSum = 0;
    let weightedDiastolicSum = 0;
    
    validBpValues.forEach((bp, index) => {
      const quality = bpQualityRef.current[index] || 0.5;
      totalQuality += quality;
      weightedSystolicSum += bp.systolic * quality;
      weightedDiastolicSum += bp.diastolic * quality;
    });
    
    // Calcular valores ponderados finales
    const finalSystolic = Math.round(weightedSystolicSum / totalQuality);
    const finalDiastolic = Math.round(weightedDiastolicSum / totalQuality);
    
    // Aplicar suavizado adicional para evitar cambios bruscos
    // Dar más peso al valor anterior para mayor estabilidad
    const lastBpParts = lastValidBpRef.current.split('/').map(Number);
    const lastSystolic = lastBpParts[0] || 120;
    const lastDiastolic = lastBpParts[1] || 80;
    
    // Calcular valor final con suavizado
    const smoothingFactor = 0.7; // 70% valor anterior, 30% nuevo valor
    const smoothedSystolic = Math.round(lastSystolic * smoothingFactor + finalSystolic * (1 - smoothingFactor));
    const smoothedDiastolic = Math.round(lastDiastolic * smoothingFactor + finalDiastolic * (1 - smoothingFactor));
    
    // Crear valor final estabilizado
    const stabilizedBP = `${smoothedSystolic}/${smoothedDiastolic}`;
    lastValidBpRef.current = stabilizedBP;
    
    return stabilizedBP;
  }, []);
  
  const processSignal = useCallback((value: number, rrData?: { intervals: number[], lastPeakTime: number | null }) => {
    const processor = getProcessor();
    const currentTime = Date.now();
    
    // Almacenar datos para análisis
    signalHistoryRef.current.push(value);
    if (signalHistoryRef.current.length > 300) {
      signalHistoryRef.current = signalHistoryRef.current.slice(-300);
    }
    
    if (rrData) {
      rrDataHistoryRef.current.push({ ...rrData });
      if (rrDataHistoryRef.current.length > 20) {
        rrDataHistoryRef.current = rrDataHistoryRef.current.slice(-20);
      }
    }
    
    // Obtenemos los resultados directamente del procesador
    const result = processor.processSignal(value, rrData);
    
    // Estabilizar la presión arterial con nuestro algoritmo mejorado
    // Calidad estimada basada en la consistencia de los datos
    const signalQuality = Math.min(1.0, signalHistoryRef.current.length / 100);
    const stabilizedBP = stabilizeBloodPressure(result.pressure, signalQuality);
    
    // Análisis avanzado de intervalos RR para arritmias
    if (rrData?.intervals && rrData.intervals.length >= 4) {
      const arrhythmiaAnalysis = analyzeArrhythmia(rrData.intervals);
      
      if (arrhythmiaAnalysis.detected && 
          arrhythmiaAnalysis.confidence >= 0.65 && 
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
          counter: arrhythmiaCounter + 1
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
    
    // MODIFICADO: Siempre mostrar "SIN ARRITMIAS" desde el principio, nunca CALIBRANDO
    return {
      spo2: result.spo2,
      pressure: stabilizedBP,
      arrhythmiaStatus: `SIN ARRITMIAS|${arrhythmiaCounter}`
    };
  }, [arrhythmiaCounter, getProcessor, analyzeArrhythmia, stabilizeBloodPressure]);

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
    lastValidBpRef.current = "120/80";
    
    console.log("Reseteo de detección de arritmias y presión arterial");
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
