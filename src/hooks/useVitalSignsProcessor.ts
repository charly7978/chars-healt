import { useState, useCallback, useEffect } from 'react';
import { VitalSignsProcessor } from '../modules/VitalSignsProcessor';

export const useVitalSignsProcessor = () => {
  const [processor] = useState(() => new VitalSignsProcessor());
  const [vitalSignsData, setVitalSignsData] = useState<any>(null);
  
  // Inicializar procesador al montar componente
  useEffect(() => {
    console.log('Inicializando procesador de signos vitales');
    return () => {
      processor.reset();
      console.log('Limpiando procesador de signos vitales');
    };
  }, [processor]);

  // Procesar señal PPG y actualizar datos vitales
  const processSignal = useCallback((ppgValue: number, rrData?: any) => {
    if (!processor) return null;
    
    try {
      // Procesar la señal a través del VitalSignsProcessor
      const result = processor.processSignal(ppgValue, rrData);
      
      // Actualizar estado con los nuevos datos
      setVitalSignsData(result);
      
      return result;
    } catch (error) {
      console.error('Error procesando señal vital:', error);
      return null;
    }
  }, [processor]);

  // Reiniciar procesador y datos
  const reset = useCallback(() => {
    if (!processor) return;
    
    processor.reset();
    setVitalSignsData(null);
    console.log('Procesador de signos vitales reiniciado');
  }, [processor]);

  // Obtener datos respiratorios actuales (si existen)
  const getCurrentRespiratoryData = useCallback(() => {
    if (!vitalSignsData) return null;
    
    return {
      rate: vitalSignsData.respiratoryRate || 0,
      pattern: vitalSignsData.respiratoryPattern || 'unknown',
      confidence: vitalSignsData.respiratoryConfidence || 0
    };
  }, [vitalSignsData]);
  
  // Obtener datos de arritmias actuales (si existen)
  const getArrhythmiaData = useCallback(() => {
    if (!vitalSignsData || !vitalSignsData.lastArrhythmiaData) return null;
    
    return {
      detected: !!vitalSignsData.lastArrhythmiaData,
      count: vitalSignsData.arrhythmiaCount || 0,
      status: vitalSignsData.arrhythmiaStatus || '',
      data: vitalSignsData.lastArrhythmiaData
    };
  }, [vitalSignsData]);

  return {
    vitalSignsData,
    processSignal,
    reset,
    getCurrentRespiratoryData,
    getArrhythmiaData
  };
};
