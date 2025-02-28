
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
  
  // Inicialización perezosa del procesador
  const getProcessor = useCallback(() => {
    if (!processorRef.current) {
      console.log('useVitalSignsProcessor: Creando nueva instancia');
      processorRef.current = new VitalSignsProcessor();
    }
    return processorRef.current;
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
    
    // Análisis más riguroso de intervalos RR para arritmias
    if (rrData?.intervals && rrData.intervals.length >= 3) {
      const lastThreeIntervals = rrData.intervals.slice(-3);
      const avgRR = lastThreeIntervals.reduce((a, b) => a + b, 0) / lastThreeIntervals.length;
      
      // Calculamos la variabilidad usando RMSSD
      let rmssd = 0;
      for (let i = 1; i < lastThreeIntervals.length; i++) {
        rmssd += Math.pow(lastThreeIntervals[i] - lastThreeIntervals[i-1], 2);
      }
      rmssd = Math.sqrt(rmssd / (lastThreeIntervals.length - 1));
      
      // Criterios para arritmias
      const lastRR = lastThreeIntervals[lastThreeIntervals.length - 1];
      const rrVariation = Math.abs(lastRR - avgRR) / avgRR;
      
      if (rmssd > 50 && 
          rrVariation > 0.20 && 
          currentTime - lastArrhythmiaTime.current >= MIN_TIME_BETWEEN_ARRHYTHMIAS &&
          arrhythmiaCounter < MAX_ARRHYTHMIAS_PER_SESSION) {
        
        hasDetectedArrhythmia.current = true;
        setArrhythmiaCounter(prev => prev + 1);
        lastArrhythmiaTime.current = currentTime;
        
        console.log("Arritmia detectada:", {
          rmssd,
          rrVariation,
          lastRR,
          avgRR,
          intervals: lastThreeIntervals,
          counter: arrhythmiaCounter + 1
        });

        return {
          spo2: result.spo2,
          pressure: result.pressure,
          arrhythmiaStatus: `ARRITMIA DETECTADA|${arrhythmiaCounter + 1}`,
          lastArrhythmiaData: {
            timestamp: currentTime,
            rmssd,
            rrVariation
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
  }, [arrhythmiaCounter, getProcessor]);

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
