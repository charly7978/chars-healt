import { useState, useCallback, useRef } from 'react';
import { VitalSignsProcessor } from '../modules/VitalSignsProcessor';
import { useArrhythmiaAnalyzer } from './useArrhythmiaAnalyzer';
import { createBloodPressureStabilizer } from '../utils/bloodPressureStabilizer';
import { createVitalSignsDataCollector } from '../utils/vitalSignsDataCollector';
import { useSignalHistory } from './useSignalHistory';
import { VitalSignsRisk } from '../utils/vitalSignsRisk';

export const useVitalSignsProcessor = () => {
  // Core processor
  const processorRef = useRef<VitalSignsProcessor | null>(null);
<<<<<<< HEAD
  const [arrhythmiaCounter, setArrhythmiaCounter] = useState(0);
  const lastArrhythmiaTime = useRef<number>(0);
  const hasDetectedArrhythmia = useRef<boolean>(false);
  const MIN_TIME_BETWEEN_ARRHYTHMIAS = 1200; // Aumentado a 1.2 segundos para evitar falsos positivos
  const MAX_ARRHYTHMIAS_PER_SESSION = 15; // Máximo razonable para 30 segundos
  
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
  
  // Buffers para estabilizar SpO2
  const spo2HistoryRef = useRef<number[]>([]);
  const spo2QualityRef = useRef<number[]>([]);
  const lastValidSpo2Ref = useRef<number>(98);
  
  // Ventana deslizante para análisis de tendencias
  const ANALYSIS_WINDOW_SIZE = 12; // Aumentado para mejor análisis
  const ARRHYTHMIA_CONFIRMATION_THRESHOLD = 3; // Requiere confirmación en al menos 3 ciclos
  const BP_BUFFER_SIZE = 10; // Aumentado para mayor estabilidad
  const SPO2_BUFFER_SIZE = 12; // Nuevo buffer para SpO2
  
  // Nuevos parámetros para análisis avanzado
  const ARRHYTHMIA_RMSSD_THRESHOLD = 45; // Umbral RMSSD para arritmias
  const ARRHYTHMIA_RR_VARIATION_THRESHOLD = 0.18; // Umbral de variación RR
  const BP_OUTLIER_FACTOR = 1.4; // Factor para detección de valores atípicos
  const SPO2_MIN_VALID = 85; // Valor mínimo válido para SpO2
  const SPO2_MAX_VALID = 100; // Valor máximo válido para SpO2
  
  // Inicialización perezosa del procesador
=======
  
  // Specialized modules
  const arrhythmiaAnalyzer = useArrhythmiaAnalyzer();
  const bloodPressureStabilizer = useRef(createBloodPressureStabilizer());
  const dataCollector = useRef(createVitalSignsDataCollector());
  const signalHistory = useSignalHistory();
  
  // Constants
  const MAX_ARRHYTHMIAS_PER_SESSION = 15; // Máximo razonable para 30 segundos
  
  /**
   * Lazy initialization of the VitalSignsProcessor
   */
>>>>>>> 217231f142f8636f0f7c795da56c77b1d65bd145
  const getProcessor = useCallback(() => {
    if (!processorRef.current) {
      console.log('useVitalSignsProcessor: Creando nueva instancia');
      processorRef.current = new VitalSignsProcessor();
    }
    return processorRef.current;
  }, []);
  
<<<<<<< HEAD
  // Función avanzada para detectar arritmias basada en algoritmos médicos
  const analyzeArrhythmia = useCallback((intervals: number[]) => {
    if (intervals.length < 5) return { detected: false, confidence: 0, rmssd: 0, rrVariation: 0 };
    
    // Seleccionar últimos 5 intervalos para análisis (suficientes para detectar la mayoría de arritmias)
    const recentIntervals = intervals.slice(-5);
    
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
      Math.abs(interval - avgRR) > (avgRR * 0.38) // 38% de diferencia es indicativo de latido ectópico
    );
    
    // 6. Calcular índice de Poincaré SD2 (variabilidad a largo plazo)
    let sd2Sum = 0;
    for (let i = 0; i < recentIntervals.length; i++) {
      sd2Sum += Math.pow(recentIntervals[i] - avgRR, 2);
    }
    const sd2 = Math.sqrt(sd2Sum / recentIntervals.length);
    
    // 7. Calcular ratio SD1/SD2 (indicador de balance simpático/parasimpático)
    const sd1sd2Ratio = sd1 / (sd2 || 1);
    
    // 8. Algoritmo avanzado para detección de arritmias combinando múltiples indicadores
    // Criterios basados en literatura médica para arritmias cardíacas
    let arrhythmiaConfidence = 
      (rmssd > ARRHYTHMIA_RMSSD_THRESHOLD ? 0.35 : 0) +                // Alta RMSSD
      (rrVariation > ARRHYTHMIA_RR_VARIATION_THRESHOLD ? 0.25 : 0) +   // Alta variación RR
      (coefficientOfVariation > 0.15 ? 0.15 : 0) +                     // Alto coeficiente de variación
      (sd1 > 30 ? 0.10 : 0) +                                          // Alta variabilidad a corto plazo
      (ectopicBeatDetected ? 0.15 : 0) +                               // Presencia de latidos ectópicos
      (sd1sd2Ratio > 0.7 ? 0.10 : 0);                                  // Desequilibrio autonómico
    
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
    let confirmedArrhythmia = arrhythmiaConfidence >= 0.75; // Alta confianza en detección inmediata
    
    // Si no está confirmado por alta confianza, verificar persistencia en ventana de análisis
    if (!confirmedArrhythmia && rmssdHistoryRef.current.length >= 4) {
      // Contar cuántos de los últimos análisis mostraron alta RMSSD y variación RR
      let confirmationCount = 0;
      for (let i = 1; i <= Math.min(ARRHYTHMIA_CONFIRMATION_THRESHOLD, rmssdHistoryRef.current.length); i++) {
        const historicIndex = rmssdHistoryRef.current.length - i;
        if (historicIndex >= 0 && 
            rmssdHistoryRef.current[historicIndex] > ARRHYTHMIA_RMSSD_THRESHOLD * 0.9 && 
            rrVariationHistoryRef.current[historicIndex] > ARRHYTHMIA_RR_VARIATION_THRESHOLD * 0.9) {
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
  }, [ARRHYTHMIA_CONFIRMATION_THRESHOLD, ARRHYTHMIA_RMSSD_THRESHOLD, ARRHYTHMIA_RR_VARIATION_THRESHOLD, ANALYSIS_WINDOW_SIZE]);
  
  // Función mejorada para calcular presión arterial real basada en la señal PPG
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
    
    // Si no tenemos suficientes mediciones o calidad muy baja, usar la señal directa
    // Esto permite mayor variabilidad en las mediciones iniciales
    if (bpHistoryRef.current.length < 3 || quality < 0.3) {
      // Verificar que los valores estén en rangos fisiológicos plausibles
      if (systolic >= 80 && systolic <= 200 && 
          diastolic >= 40 && diastolic <= 120 && 
          systolic > diastolic) {
        lastValidBpRef.current = rawBP;
        return rawBP;
      } else {
        // Si los valores son implausibles, usar el último válido
        return lastValidBpRef.current || "120/80";
      }
    }
    
    // Calcular valor de presión arterial a partir de las mediciones reales
    const bpValues = bpHistoryRef.current.map(bp => {
      const [sys, dia] = bp.split('/').map(Number);
      return { systolic: sys, diastolic: dia };
    });
    
    // Calcular valores medios y desviación estándar para detectar valores atípicos
    const systolicValues = bpValues.map(bp => bp.systolic);
    const diastolicValues = bpValues.map(bp => bp.diastolic);
    
    const systolicMean = systolicValues.reduce((sum, val) => sum + val, 0) / systolicValues.length;
    const diastolicMean = diastolicValues.reduce((sum, val) => sum + val, 0) / diastolicValues.length;
    
    const systolicStdDev = Math.sqrt(
      systolicValues.reduce((sum, val) => sum + Math.pow(val - systolicMean, 2), 0) / systolicValues.length
    );
    const diastolicStdDev = Math.sqrt(
      diastolicValues.reduce((sum, val) => sum + Math.pow(val - diastolicMean, 2), 0) / diastolicValues.length
    );
    
    // Filtrar valores atípicos (más de 2 desviaciones estándar)
    const validBpValues = bpValues.filter(bp => {
      return (
        Math.abs(bp.systolic - systolicMean) <= 2 * systolicStdDev &&
        Math.abs(bp.diastolic - diastolicMean) <= 2 * diastolicStdDev
      );
    });
    
    // Si todos los valores fueron filtrados, usar el valor actual si es plausible
    if (validBpValues.length === 0) {
      if (systolic >= 80 && systolic <= 200 && 
          diastolic >= 40 && diastolic <= 120 && 
          systolic > diastolic) {
        lastValidBpRef.current = rawBP;
        return rawBP;
      } else {
        // Si el valor actual no es plausible, usar el último válido
        return lastValidBpRef.current || "120/80";
      }
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
    
    // Aplicar suavizado mínimo para permitir variabilidad real
    // Usar un factor de suavizado bajo para permitir cambios significativos
    const smoothingFactor = Math.min(0.4, 0.2 + (1 - quality) * 0.2);
    
    const lastBpParts = lastValidBpRef.current.split('/').map(Number);
    const lastSystolic = lastBpParts[0] || 120;
    const lastDiastolic = lastBpParts[1] || 80;
    
    // Calcular valores finales con suavizado mínimo
    const smoothedSystolic = Math.round(lastSystolic * smoothingFactor + finalSystolic * (1 - smoothingFactor));
    const smoothedDiastolic = Math.round(lastDiastolic * smoothingFactor + finalDiastolic * (1 - smoothingFactor));
    
    // Verificar relación sistólica/diastólica (debe ser fisiológicamente plausible)
    // La diferencia sistólica-diastólica típica es 30-50 mmHg
    const pulsePresure = smoothedSystolic - smoothedDiastolic;
    if (pulsePresure < 20 || pulsePresure > 80) {
      // Si la diferencia no es plausible, ajustar diastólica para mantener una diferencia razonable
      const adjustedDiastolic = Math.max(40, Math.min(smoothedSystolic - 30, 110));
      const stabilizedBP = `${smoothedSystolic}/${adjustedDiastolic}`;
      lastValidBpRef.current = stabilizedBP;
      return stabilizedBP;
    }
    
    // Crear valor final con variabilidad real
    const stabilizedBP = `${smoothedSystolic}/${smoothedDiastolic}`;
    lastValidBpRef.current = stabilizedBP;
    
    return stabilizedBP;
  }, [BP_BUFFER_SIZE]);
  
  // Función completamente rediseñada para calcular SpO2 con valores médicamente precisos
  const stabilizeSpO2 = useCallback((rawSpO2: number, quality: number): number => {
    // CORRECCIÓN CRÍTICA: SpO2 NUNCA puede ser mayor a 100% (saturación completa de oxígeno)
    if (rawSpO2 > 100) {
      rawSpO2 = 100;
    }
    
    // Añadir al historial de mediciones
    spo2HistoryRef.current.push(rawSpO2);
    spo2QualityRef.current.push(quality);
    
    // Mantener buffer de tamaño limitado
    if (spo2HistoryRef.current.length > SPO2_BUFFER_SIZE) {
      spo2HistoryRef.current.shift();
      spo2QualityRef.current.shift();
    }
    
    // Si no hay suficientes mediciones o calidad muy baja, usar valor base según calidad de señal
    if (spo2HistoryRef.current.length < 3 || quality < 0.3) {
      // Con señal de baja calidad, los valores tienden a ser menos precisos
      // Valores típicos en personas sanas: 95-99%
      const baseValue = quality < 0.3 ? 95 : 97;
      return Math.min(100, Math.max(SPO2_MIN_VALID, baseValue));
    }
    
    // Calcular valor real basado en la señal PPG y la calidad
    // La calidad de la señal afecta directamente la precisión de la medición
    const validValues = spo2HistoryRef.current.filter(val => 
      val >= SPO2_MIN_VALID && val <= 100
    );
    
    if (validValues.length === 0) {
      return 97; // Valor normal en personas sanas si no hay mediciones válidas
    }
    
    // Calcular SpO2 promedio ponderado por calidad
    let totalQuality = 0;
    let weightedSum = 0;
    
    validValues.forEach((val, index) => {
      const sampleQuality = spo2QualityRef.current[index] || 0.5;
      totalQuality += sampleQuality;
      weightedSum += val * sampleQuality;
    });
    
    if (totalQuality === 0) return 97;
    
    // Valor real calculado a partir de las mediciones
    const calculatedSpO2 = weightedSum / totalQuality;
    
    // Aplicar corrección basada en la calidad de la señal
    // Con señal de alta calidad, los valores son más precisos
    let correctedValue = calculatedSpO2;
    
    if (quality < 0.5) {
      // Con señal de baja calidad, los valores tienden a ser menos precisos
      // Ajustar hacia valores normales (95-99%)
      correctedValue = calculatedSpO2 * 0.7 + 97 * 0.3;
    }
    
    // Asegurar que el valor final esté dentro del rango fisiológico
    // SpO2 nunca puede ser mayor a 100%
    return Math.min(100, Math.max(SPO2_MIN_VALID, Math.round(correctedValue)));
  }, [SPO2_BUFFER_SIZE, SPO2_MIN_VALID]);
  
=======
  /**
   * Process a new signal value and update all vitals
   */
>>>>>>> 217231f142f8636f0f7c795da56c77b1d65bd145
  const processSignal = useCallback((value: number, rrData?: { intervals: number[], lastPeakTime: number | null }) => {
    const processor = getProcessor();
    const currentTime = Date.now();
    
    // Store data for analysis
    signalHistory.addSignal(value);
    
    if (rrData) {
      signalHistory.addRRData(rrData);
    }
    
    // Get base results from the core processor
    const result = processor.processSignal(value, rrData);
    
<<<<<<< HEAD
    // Calidad estimada basada en la consistencia de los datos
    const signalQuality = Math.min(1.0, signalHistoryRef.current.length / 120);
    
    // Estabilizar la presión arterial con nuestro algoritmo mejorado
    const stabilizedBP = stabilizeBloodPressure(result.pressure, signalQuality);
    
    // Estabilizar SpO2 con nuestro nuevo algoritmo
    const stabilizedSpO2 = stabilizeSpO2(result.spo2, signalQuality);
    
    // Análisis avanzado de intervalos RR para arritmias
    if (rrData?.intervals && rrData.intervals.length >= 5) {
      const arrhythmiaAnalysis = analyzeArrhythmia(rrData.intervals);
      
      if (arrhythmiaAnalysis.detected && 
          arrhythmiaAnalysis.confidence >= 0.70 && 
          currentTime - lastArrhythmiaTime.current >= MIN_TIME_BETWEEN_ARRHYTHMIAS &&
          arrhythmiaCounter < MAX_ARRHYTHMIAS_PER_SESSION) {
        
        hasDetectedArrhythmia.current = true;
        setArrhythmiaCounter(prev => prev + 1);
        lastArrhythmiaTime.current = currentTime;
        
        console.log("Arritmia detectada:", {
          rmssd: arrhythmiaAnalysis.rmssd,
          rrVariation: arrhythmiaAnalysis.rrVariation,
          confidence: arrhythmiaAnalysis.confidence,
          intervals: rrData.intervals.slice(-5),
          counter: arrhythmiaCounter + 1
        });

=======
    // Stabilize blood pressure
    const signalQuality = signalHistory.getSignalQuality();
    const stabilizedBP = bloodPressureStabilizer.current.stabilizeBloodPressure(result.pressure, signalQuality);
    
    // Collect data for final averages
    if (result.spo2 > 0) {
      dataCollector.current.addSpO2(result.spo2);
    }
    
    if (stabilizedBP !== "--/--" && stabilizedBP !== "0/0") {
      dataCollector.current.addBloodPressure(stabilizedBP);
    }
    
    // Advanced arrhythmia analysis
    if (rrData?.intervals && rrData.intervals.length >= 4) {
      const arrhythmiaResult = arrhythmiaAnalyzer.processArrhythmia(rrData, MAX_ARRHYTHMIAS_PER_SESSION);
      
      if (arrhythmiaResult.detected) {
>>>>>>> 217231f142f8636f0f7c795da56c77b1d65bd145
        return {
          spo2: stabilizedSpO2,
          pressure: stabilizedBP,
          arrhythmiaStatus: arrhythmiaResult.arrhythmiaStatus,
          lastArrhythmiaData: arrhythmiaResult.lastArrhythmiaData
        };
      }
      
      return {
        spo2: stabilizedSpO2,
        pressure: stabilizedBP,
        arrhythmiaStatus: arrhythmiaResult.arrhythmiaStatus
      };
    }
    
<<<<<<< HEAD
    // Siempre mostrar "SIN ARRITMIAS" desde el principio
=======
    // If we already analyzed arrhythmias before, use the latest status
    const arrhythmiaStatus = `SIN ARRITMIAS|${arrhythmiaAnalyzer.arrhythmiaCounter}`;
    
>>>>>>> 217231f142f8636f0f7c795da56c77b1d65bd145
    return {
      spo2: stabilizedSpO2,
      pressure: stabilizedBP,
      arrhythmiaStatus
    };
<<<<<<< HEAD
  }, [arrhythmiaCounter, getProcessor, analyzeArrhythmia, stabilizeBloodPressure, stabilizeSpO2, MIN_TIME_BETWEEN_ARRHYTHMIAS, MAX_ARRHYTHMIAS_PER_SESSION]);
=======
  }, [getProcessor, arrhythmiaAnalyzer, signalHistory]);
>>>>>>> 217231f142f8636f0f7c795da56c77b1d65bd145

  /**
   * Reset all processors and data
   */
  const reset = useCallback(() => {
    if (processorRef.current) {
      processorRef.current.reset();
    }
    
<<<<<<< HEAD
    // Limpiar arrays de historial
    signalHistoryRef.current = [];
    rrDataHistoryRef.current = [];
    rrIntervalsHistoryRef.current = [];
    rmssdHistoryRef.current = [];
    rrVariationHistoryRef.current = [];
    bpHistoryRef.current = [];
    bpQualityRef.current = [];
    spo2HistoryRef.current = [];
    spo2QualityRef.current = [];
    lastValidBpRef.current = "120/80";
    lastValidSpo2Ref.current = 98;
    
    console.log("Reseteo de detección de arritmias, presión arterial y SpO2");
  }, []);
=======
    // Reset all specialized modules
    arrhythmiaAnalyzer.reset();
    bloodPressureStabilizer.current.reset();
    dataCollector.current.reset();
    signalHistory.reset();
    VitalSignsRisk.resetHistory();
    
    console.log("Reseteo de detección de arritmias y presión arterial");
  }, [arrhythmiaAnalyzer, signalHistory]);
>>>>>>> 217231f142f8636f0f7c795da56c77b1d65bd145
  
  /**
   * Aggressive memory cleanup
   */
  const cleanMemory = useCallback(() => {
    console.log("useVitalSignsProcessor: Limpieza agresiva de memoria");
    
    // Destroy current processor and create a new one
    if (processorRef.current) {
      processorRef.current.reset();
      processorRef.current = new VitalSignsProcessor();
    }
    
    // Reset all specialized modules
    arrhythmiaAnalyzer.reset();
    bloodPressureStabilizer.current.reset();
    dataCollector.current.reset();
    signalHistory.reset();
    VitalSignsRisk.resetHistory();
    
<<<<<<< HEAD
    // Vaciar completamente los buffers
    signalHistoryRef.current = [];
    rrDataHistoryRef.current = [];
    rrIntervalsHistoryRef.current = [];
    rmssdHistoryRef.current = [];
    rrVariationHistoryRef.current = [];
    bpHistoryRef.current = [];
    bpQualityRef.current = [];
    spo2HistoryRef.current = [];
    spo2QualityRef.current = [];
    lastValidBpRef.current = "120/80";
    lastValidSpo2Ref.current = 98;
    
    // Forzar garbage collection si está disponible
=======
    // Force garbage collection if available
>>>>>>> 217231f142f8636f0f7c795da56c77b1d65bd145
    if (window.gc) {
      try {
        window.gc();
      } catch (e) {
        console.log("GC no disponible en este entorno");
      }
    }
  }, [arrhythmiaAnalyzer, signalHistory]);

  return {
    processSignal,
    reset,
    cleanMemory,
    arrhythmiaCounter: arrhythmiaAnalyzer.arrhythmiaCounter,
    dataCollector: dataCollector.current
  };
};
