<<<<<<< Updated upstream

import { useState, useCallback, useRef } from 'react';
import { VitalSignsProcessor } from '../modules/VitalSignsProcessor';

export const useVitalSignsProcessor = () => {
  const [processor] = useState(() => new VitalSignsProcessor());
  const [arrhythmiaCounter, setArrhythmiaCounter] = useState(0);
  const lastArrhythmiaTime = useRef<number>(0);
  const hasDetectedArrhythmia = useRef<boolean>(false);
  const MIN_TIME_BETWEEN_ARRHYTHMIAS = 1000; // Mínimo 1 segundo entre arritmias
  const MAX_ARRHYTHMIAS_PER_SESSION = 15; // Máximo razonable para 30 segundos
  
  const processSignal = useCallback((value: number, rrData?: { intervals: number[], lastPeakTime: number | null }) => {
    const result = processor.processSignal(value, rrData);
    const currentTime = Date.now();
    
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
    
    // Si no hay arritmias detectadas aún
    return {
      spo2: result.spo2,
      pressure: result.pressure,
      arrhythmiaStatus: `SIN ARRITMIAS|${arrhythmiaCounter}`
=======
import { useState, useEffect, useRef, useCallback } from 'react';
import { VitalSignsProcessor } from '../utils/VitalSignsProcessor';

export function useVitalSignsProcessor() {
  const processorRef = useRef<VitalSignsProcessor | null>(null);
  const [spo2, setSpo2] = useState<number>(0);
  const [pressure, setPressure] = useState<string>("--/--");
  const [arrhythmiaStatus, setArrhythmiaStatus] = useState<string>("--");
  const [lastArrhythmiaData, setLastArrhythmiaData] = useState<{
    timestamp: number;
    rmssd: number;
    rrVariation: number;
    type?: string;
  } | null>(null);
  
  // Inicializar procesador
  useEffect(() => {
    if (!processorRef.current) {
      processorRef.current = new VitalSignsProcessor();
      console.log("useVitalSignsProcessor: Procesador de signos vitales inicializado");
    }
    
    return () => {
      // No hay recursos que limpiar para este procesador
>>>>>>> Stashed changes
    };
  }, []);
  
  // Función para procesar nueva señal PPG y datos RR
  const processSignal = useCallback((
    ppgValue: number,
    rrData?: { 
      intervals: number[]; 
      lastPeakTime: number | null;
      arrhythmiaDetected?: boolean;
      arrhythmiaScore?: number;
      arrhythmiaType?: string;
    }
  ) => {
    if (!processorRef.current) {
      return {
        spo2: 0,
        pressure: "--/--",
        arrhythmiaStatus: "--",
        lastArrhythmiaData: null
      };
    }
    
    // Procesar señal usando el procesador
    const result = processorRef.current.processSignal(ppgValue, rrData);
    
    // Actualizar estado con los resultados
    setSpo2(result.spo2);
    setPressure(result.pressure);
    setArrhythmiaStatus(result.arrhythmiaStatus);
    
    if (result.lastArrhythmiaData) {
      setLastArrhythmiaData(result.lastArrhythmiaData);
    }
    
    return result;
  }, []);
  
  // Función para resetear el procesador
  const reset = useCallback(() => {
<<<<<<< Updated upstream
    processor.reset();
    setArrhythmiaCounter(0);
    lastArrhythmiaTime.current = 0;
    hasDetectedArrhythmia.current = false;
    console.log("Reseteo de detección de arritmias");
  }, [processor]);

=======
    if (processorRef.current) {
      processorRef.current.reset();
      setSpo2(0);
      setPressure("--/--");
      setArrhythmiaStatus("--");
      setLastArrhythmiaData(null);
      console.log("useVitalSignsProcessor: Procesador reseteado");
    }
  }, []);
  
>>>>>>> Stashed changes
  return {
    processSignal,
    spo2,
    pressure,
    arrhythmiaStatus,
    lastArrhythmiaData,
    reset
  };
}
