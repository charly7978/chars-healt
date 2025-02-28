
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
  
  // Nueva ventana deslizante para análisis de tendencias
  const ANALYSIS_WINDOW_SIZE = 10; // Análisis sobre 10 latidos consecutivos
  const ARRHYTHMIA_CONFIRMATION_THRESHOLD = 3; // Requiere confirmación en al menos 3 ciclos para reducir falsos positivos
  
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
    
    const result = processor.processSignal(value, rrData);
    
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
          pressure: result.pressure,
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
        pressure: result.pressure,
        arrhythmiaStatus: `ARRITMIA DETECTADA|${arrhythmiaCounter}`,
        lastArrhythmiaData: null
      };
    }
    
    // MODIFICADO: Siempre mostrar "SIN ARRITMIAS" desde el principio, nunca CALIBRANDO
    return {
      spo2: result.spo2,
      pressure: result.pressure,
      arrhythmiaStatus: `SIN ARRITMIAS|${arrhythmiaCounter}`
    };
  }, [arrhythmiaCounter, getProcessor, analyzeArrhythmia]);

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
    
    console.log("Reseteo de detección de arritmias");
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
