
// Importar el método cleanMemory de cada uno de los hooks correspondientes
import { useEffect, useCallback, useState, useRef } from 'react';
import { useSignalProcessor } from './useSignalProcessor';
import { useHeartBeatProcessor } from './useHeartBeatProcessor';
import { useVitalSignsProcessor } from './useVitalSignsProcessor';
import { VitalSignsRisk } from '@/utils/vitalSignsRisk';

export interface VitalSigns {
  spo2: number;
  pressure: string;
  arrhythmiaStatus: string;
  respiration: {
    rate: number;
    depth: number;
    regularity: number;
  };
  hasRespirationData: boolean;
  glucose: {
    value: number;
    trend: 'stable' | 'rising' | 'falling' | 'rising_rapidly' | 'falling_rapidly' | 'unknown';
  } | null;
  hemoglobin: number | null;
  lastArrhythmiaData?: {
    timestamp: number;
    rmssd: number;
    rrVariation: number;
  } | null;
}

export interface FinalValues {
  heartRate: number;
  spo2: number;
  pressure: string;
  respiration: {
    rate: number;
    depth: number;
    regularity: number;
  };
  glucose: {
    value: number;
    trend: 'stable' | 'rising' | 'falling' | 'rising_rapidly' | 'falling_rapidly' | 'unknown';
  } | null;
  hemoglobin: number | null;
}

export interface ArrhythmiaData {
  timestamp: number;
  rmssd: number;
  rrVariation: number;
}

export const useVitalMeasurement = () => {
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [signalQuality, setSignalQuality] = useState(0);
  const [vitalSigns, setVitalSigns] = useState<VitalSigns>({ 
    spo2: 0, 
    pressure: "--/--",
    arrhythmiaStatus: "--",
    respiration: { rate: 0, depth: 0, regularity: 0 },
    hasRespirationData: false,
    glucose: null,
    hemoglobin: null,
    lastArrhythmiaData: null
  });
  const [heartRate, setHeartRate] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [measurementComplete, setMeasurementComplete] = useState(false);
  const [finalValues, setFinalValues] = useState<FinalValues | null>(null);
  const [lastArrhythmiaData, setLastArrhythmiaData] = useState<ArrhythmiaData | null>(null);
  
  const signalProcessor = useSignalProcessor();
  const heartBeatProcessor = useHeartBeatProcessor();
  const vitalSignsProcessor = useVitalSignsProcessor();

  // Función para limpiar memoria de forma agresiva
  const performMemoryCleanup = useCallback(() => {
    console.log("useVitalMeasurement: Iniciando limpieza agresiva de memoria");
    
    // Llamar a la limpieza específica de cada procesador
    signalProcessor.cleanMemory();
    heartBeatProcessor.cleanMemory();
    vitalSignsProcessor.cleanMemory();
    
    // Liberar memoria adicional
    if (window.gc) {
      setTimeout(() => {
        try {
          window.gc();
          console.log("Garbage collection global ejecutada");
        } catch (e) {
          console.log("Garbage collection no disponible");
        }
      }, 100);
    }
    
    // Programar una segunda limpieza después de un breve retraso
    setTimeout(() => {
      console.log("useVitalMeasurement: Segunda fase de limpieza de memoria");
      if (window.gc) {
        try {
          window.gc();
        } catch (e) {
          console.log("Segunda GC fallida");
        }
      }
    }, 2000);
  }, [signalProcessor, heartBeatProcessor, vitalSignsProcessor]);

  // Ejecutar limpieza de memoria cuando el componente se desmonte
  useEffect(() => {
    return () => {
      performMemoryCleanup();
    };
  }, [performMemoryCleanup]);

  const startMonitoring = useCallback(() => {
    console.log("Starting monitoring");
    setIsMonitoring(true);
    setIsCameraOn(true);
    signalProcessor.startProcessing();
  }, [signalProcessor]);

  const handleReset = useCallback(() => {
    console.log("Reset handler triggered");
    setIsMonitoring(false);
    setIsCameraOn(false);
    signalProcessor.stopProcessing();
    setHeartRate(0);
    setVitalSigns({ 
      spo2: 0, 
      pressure: "--/--",
      arrhythmiaStatus: "--",
      respiration: { rate: 0, depth: 0, regularity: 0 },
      hasRespirationData: false,
      glucose: null,
      hemoglobin: null,
      lastArrhythmiaData: null
    });
    setElapsedTime(0);
    setMeasurementComplete(false);
    setFinalValues(null);
  }, [signalProcessor]);

  const stopMonitoringOnly = useCallback(() => {
    console.log("Stopping monitoring only");
    setIsMonitoring(false);
    setIsCameraOn(false);
    signalProcessor.stopProcessing();
    setMeasurementComplete(true);
  }, [signalProcessor]);

  return {
    isMonitoring,
    isCameraOn,
    signalQuality,
    vitalSigns,
    heartRate,
    elapsedTime,
    measurementComplete,
    finalValues,
    lastArrhythmiaData,
    lastSignal: signalProcessor.lastSignal,
    processFrame: signalProcessor.processFrame,
    startMonitoring,
    handleReset,
    stopMonitoringOnly,
    performMemoryCleanup
  };
};
