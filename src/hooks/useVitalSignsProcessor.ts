import { useState, useRef, useCallback } from 'react';
import { VitalSignsProcessor } from '../modules/VitalSignsProcessor';
import { VitalSignsRisk } from '../utils/vitalSignsRisk';

export function useVitalSignsProcessor() {
  const processorRef = useRef<VitalSignsProcessor | null>(null);
  const [spo2, setSpo2] = useState<number>(0);
  const [pressure, setPressure] = useState<string>("--/--");
  const [arrhythmiaStatus, setArrhythmiaStatus] = useState<string>("--");
  const [arrhythmiaCount, setArrhythmiaCount] = useState<number>(0);
  const [lastArrhythmiaData, setLastArrhythmiaData] = useState<{
    timestamp: number;
    rmssd: number;
    rrVariation: number;
  } | null>(null);
  const detectionHistoryRef = useRef<{status: string, timestamp: number}[]>([]);

  if (!processorRef.current) {
    processorRef.current = new VitalSignsProcessor();
    console.log('useVitalSignsProcessor: Nueva instancia de VitalSignsProcessor creada');
  }

  const processSignal = useCallback((value: number, rrData?: any) => {
    try {
      if (!processorRef.current) return null;
      
      if (rrData && rrData.intervals && rrData.intervals.length > 0) {
        console.log('useVitalSignsProcessor - Datos RR recibidos:', {
          intervalCount: rrData.intervals.length,
          hasAmplitudes: !!rrData.amplitudes && rrData.amplitudes.length > 0, 
          timestamp: new Date().toISOString()
        });
      }
      
      const result = processorRef.current.processSignal(value, rrData);
      if (!result) return null;
      
      if (result.spo2 > 0) {
        setSpo2(result.spo2);
        VitalSignsRisk.updateSPO2History(result.spo2);
      }
      
      if (result.pressure !== "--/--" && result.pressure !== "0/0") {
        setPressure(result.pressure);
        
        const [systolic, diastolic] = result.pressure.split('/').map(Number);
        if (systolic > 0 && diastolic > 0) {
          VitalSignsRisk.updateBPHistory(systolic, diastolic);
        }
      }
      
      if (result.arrhythmiaStatus) {
        setArrhythmiaStatus(result.arrhythmiaStatus);
        
        const [status, count] = result.arrhythmiaStatus.split('|');
        const countNumber = parseInt(count, 10) || 0;
        
        if (countNumber > arrhythmiaCount) {
          console.log('useVitalSignsProcessor - Nueva arritmia detectada:', {
            prevCount: arrhythmiaCount,
            newCount: countNumber,
            timestamp: new Date().toISOString()
          });
          
          detectionHistoryRef.current.push({
            status: 'ARRITMIA DETECTADA',
            timestamp: Date.now()
          });
          
          if (detectionHistoryRef.current.length > 10) {
            detectionHistoryRef.current.shift();
          }
        }
        
        setArrhythmiaCount(countNumber);
      }
      
      if (result.lastArrhythmiaData) {
        setLastArrhythmiaData(result.lastArrhythmiaData);
      }
      
      return result;
    } catch (error) {
      console.error('Error procesando signos vitales:', error);
      return null;
    }
  }, [arrhythmiaCount]);

  const reset = useCallback(() => {
    if (processorRef.current) {
      processorRef.current.reset();
    }
    setSpo2(0);
    setPressure("--/--");
    setArrhythmiaStatus("--");
    setArrhythmiaCount(0);
    setLastArrhythmiaData(null);
    detectionHistoryRef.current = [];
    console.log('useVitalSignsProcessor: Reset completo');
  }, []);

  const getDetectionHistory = useCallback(() => {
    return detectionHistoryRef.current;
  }, []);

  const cleanMemory = useCallback(() => {
    console.log('useVitalSignsProcessor: Performing memory cleanup');
    reset();
    
    if (processorRef.current) {
      processorRef.current = null;
    }
    setLastArrhythmiaData(null);
    setSpo2(0);
    setPressure("--/--");
    setArrhythmiaStatus("--");
    setArrhythmiaCount(0);
    detectionHistoryRef.current = [];
  }, [reset]);

  return {
    processSignal,
    reset,
    spo2,
    pressure,
    arrhythmiaStatus,
    arrhythmiaCount,
    lastArrhythmiaData,
    getDetectionHistory,
    cleanMemory
  };
}
