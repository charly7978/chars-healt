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

  // Inicializar el procesador si es necesario
  if (!processorRef.current) {
    processorRef.current = new VitalSignsProcessor();
    console.log('useVitalSignsProcessor: Nueva instancia de VitalSignsProcessor creada');
  }

  // Procesar la señal PPG y extraer signos vitales
  const processSignal = useCallback((value: number, rrData?: any) => {
    try {
      if (!processorRef.current) return null;
      
      // Log detallado de los datos entrantes para diagnóstico
      if (rrData && rrData.intervals && rrData.intervals.length > 0) {
        console.log('useVitalSignsProcessor - Datos RR recibidos:', {
          intervalCount: rrData.intervals.length,
          hasAmplitudes: !!rrData.amplitudes && rrData.amplitudes.length > 0, 
          timestamp: new Date().toISOString()
        });
      }
      
      // Procesar la señal para extraer todos los signos vitales
      const result = processorRef.current.processSignal(value, rrData);
      if (!result) return null;
      
      // Actualizar el estado de SpO2
      if (result.spo2 > 0) {
        setSpo2(result.spo2);
        VitalSignsRisk.updateSPO2History(result.spo2);
      }
      
      // Actualizar el estado de presión arterial
      if (result.pressure !== "--/--" && result.pressure !== "0/0") {
        setPressure(result.pressure);
        
        // Actualizar historia de presión arterial para análisis de riesgo
        const [systolic, diastolic] = result.pressure.split('/').map(Number);
        if (systolic > 0 && diastolic > 0) {
          VitalSignsRisk.updateBPHistory(systolic, diastolic);
        }
      }
      
      // Actualizar estado de arritmias - OPTIMIZADO
      if (result.arrhythmiaStatus) {
        setArrhythmiaStatus(result.arrhythmiaStatus);
        
        // Extraer el contador de arritmias del status
        const [status, count] = result.arrhythmiaStatus.split('|');
        const countNumber = parseInt(count, 10) || 0;
        
        // Registrar detección si hay cambio en el contador
        if (countNumber > arrhythmiaCount) {
          console.log('useVitalSignsProcessor - Nueva arritmia detectada:', {
            prevCount: arrhythmiaCount,
            newCount: countNumber,
            timestamp: new Date().toISOString()
          });
          
          // Guardar historial de detecciones
          detectionHistoryRef.current.push({
            status: 'ARRITMIA DETECTADA',
            timestamp: Date.now()
          });
          
          // Limitar historial a últimas 10 detecciones
          if (detectionHistoryRef.current.length > 10) {
            detectionHistoryRef.current.shift();
          }
        }
        
        setArrhythmiaCount(countNumber);
      }
      
      // Actualizar datos de la última arritmia detectada para visualización
      if (result.lastArrhythmiaData) {
        setLastArrhythmiaData(result.lastArrhythmiaData);
      }
      
      return result;
    } catch (error) {
      console.error('Error procesando signos vitales:', error);
      return null;
    }
  }, [arrhythmiaCount]);

  // Resetear todos los estados y el procesador
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

  // Acceder al historial de detecciones 
  const getDetectionHistory = useCallback(() => {
    return detectionHistoryRef.current;
  }, []);

  return {
    processSignal,
    reset,
    spo2,
    pressure,
    arrhythmiaStatus,
    arrhythmiaCount,
    lastArrhythmiaData,
    getDetectionHistory
  };
}
