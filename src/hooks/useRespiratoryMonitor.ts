import { useState, useRef, useCallback, useEffect } from 'react';
import { RespiratoryMonitor, RespiratoryData } from '../modules/RespiratoryMonitor';

/**
 * Hook para monitoreo respiratorio
 * 
 * Este hook se integra con la aplicación existente sin modificar
 * su funcionalidad, añadiendo capacidades de monitoreo respiratorio.
 */
export const useRespiratoryMonitor = () => {
  const respiratoryMonitor = useRef<RespiratoryMonitor | null>(null);
  const [respiratoryData, setRespiratoryData] = useState<RespiratoryData | null>(null);
  const [isMonitoring, setIsMonitoring] = useState(false);
  
  // Inicializar el monitor si no existe
  useEffect(() => {
    if (!respiratoryMonitor.current) {
      console.log("Inicializando monitor respiratorio");
      respiratoryMonitor.current = new RespiratoryMonitor();
    }
    
    return () => {
      // Limpiar al desmontar
      if (respiratoryMonitor.current) {
        respiratoryMonitor.current.cleanMemory();
      }
    };
  }, []);
  
  /**
   * Iniciar monitoreo respiratorio
   */
  const startMonitoring = useCallback(() => {
    console.log("Iniciando monitoreo respiratorio");
    if (respiratoryMonitor.current) {
      respiratoryMonitor.current.reset();
      setIsMonitoring(true);
    }
  }, []);
  
  /**
   * Detener monitoreo respiratorio
   */
  const stopMonitoring = useCallback(() => {
    console.log("Deteniendo monitoreo respiratorio");
    setIsMonitoring(false);
  }, []);
  
  /**
   * Procesar señal PPG para análisis respiratorio
   * Este método puede ser llamado con la misma señal PPG que
   * ya está siendo procesada por otros componentes.
   */
  const processSignal = useCallback((ppgValue: number, quality: number) => {
    if (!isMonitoring || !respiratoryMonitor.current) return;
    
    try {
      console.log(`Procesando señal para respiración: valor=${ppgValue.toFixed(2)}, calidad=${quality}`);
      const respData = respiratoryMonitor.current.processSignal(ppgValue, quality);
      if (respData) {
        setRespiratoryData(respData);
      }
    } catch (error) {
      console.error('Error procesando señal respiratoria:', error);
    }
  }, [isMonitoring]);
  
  /**
   * Resetear el monitor respiratorio
   */
  const reset = useCallback(() => {
    console.log("Reseteando monitor respiratorio");
    if (respiratoryMonitor.current) {
      respiratoryMonitor.current.reset();
      setRespiratoryData(null);
    }
  }, []);
  
  /**
   * Limpiar memoria para optimizar recursos
   */
  const cleanMemory = useCallback(() => {
    if (respiratoryMonitor.current) {
      respiratoryMonitor.current.cleanMemory();
    }
  }, []);
  
  return {
    respiratoryData,
    isMonitoring,
    startMonitoring,
    stopMonitoring,
    processSignal,
    reset,
    cleanMemory,
    
    // Métodos auxiliares para acceso directo a valores clave
    respirationRate: respiratoryData?.respirationRate || 0,
    respirationConfidence: respiratoryData?.confidence || 0,
    breathingPattern: respiratoryData?.breathingPattern || 'desconocido',
    estimatedDepth: respiratoryData?.estimatedDepth || 0
  };
}; 