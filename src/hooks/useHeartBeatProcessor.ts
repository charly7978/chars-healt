
import { useState, useRef, useCallback } from 'react';
import { HeartBeatProcessor } from '../modules/HeartBeatProcessor';

export function useHeartBeatProcessor() {
  const processorRef = useRef<HeartBeatProcessor | null>(null);
  const [bpm, setBpm] = useState(0);
  const valuesBufferRef = useRef<number[]>([]);
  const lastPeakTimeRef = useRef<number | null>(null);
  const [peakAmplitudes, setPeakAmplitudes] = useState<number[]>([]);
  const [rrIntervals, setRrIntervals] = useState<number[]>([]);
  
  // Inicializar el procesador si no existe
  if (!processorRef.current) {
    processorRef.current = new HeartBeatProcessor();
  }

  // Procesar señal PPG y obtener latidos cardíacos
  const processSignal = useCallback((value: number) => {
    if (!processorRef.current) return { bpm: 0, rrData: { intervals: [], lastPeakTime: null } };
    
    // Añadir valor al buffer
    valuesBufferRef.current.push(value);
    
    // Procesar la señal - asegurando que el valor sea positivo para detectar picos adecuadamente
    // Los picos en PPG normalmente son hacia arriba (valores positivos)
    const normalizedValue = Math.abs(value); // Asegurar valores positivos
    const result = processorRef.current.processSignal(normalizedValue);
    
    // Actualizar BPM
    if (result.bpm > 0) {
      setBpm(result.bpm);
    }
    
    // Capturar tiempo del último pico
    if (result.isPeak) {
      lastPeakTimeRef.current = Date.now();
      
      // Registrar amplitud del pico - asegurando amplitud positiva para la correcta detección
      if (valuesBufferRef.current.length > 0) {
        const lastValues = valuesBufferRef.current.slice(-5);
        const avgAmplitude = lastValues.reduce((sum, val) => sum + val, 0) / lastValues.length;
        
        // Usar el valor absoluto para mantener consistencia en la detección de arritmias
        setPeakAmplitudes(prev => {
          const newAmps = [...prev, Math.abs(avgAmplitude)];
          return newAmps.slice(-20); // Mantener últimas 20 amplitudes
        });
      }
    }
    
    // Obtener datos RR para detección de arritmias - mejorada con amplitudes correctas
    const { intervals, amplitudes } = processorRef.current.getRRIntervals();
    
    // Actualizar intervalos RR para componentes que los necesiten
    if (intervals.length > 0) {
      setRrIntervals(intervals);
    }
    
    // Log mejorado para seguimiento de datos críticos y detección de picos
    if (result.isPeak) {
      console.log('useHeartBeatProcessor - Pico detectado:', {
        bpm: result.bpm,
        confidence: result.confidence.toFixed(2),
        amplitudes: amplitudes ? amplitudes.length : 0,
        intervals: intervals.length,
        normalizedValue: normalizedValue.toFixed(2), // Log del valor normalizado
        originalValue: value.toFixed(2), // Log del valor original para comparación
        timestamp: new Date().toISOString()
      });
    }
    
    // Retornar datos procesados para uso en componentes
    return {
      bpm: result.bpm,
      isPeak: result.isPeak,
      confidence: result.confidence,
      filteredValue: result.filteredValue,
      rrData: {
        intervals, 
        lastPeakTime: lastPeakTimeRef.current,
        amplitudes: amplitudes || peakAmplitudes
      }
    };
  }, []);

  // Resetear todos los datos
  const reset = useCallback(() => {
    if (processorRef.current) {
      processorRef.current.reset();
    }
    setBpm(0);
    valuesBufferRef.current = [];
    lastPeakTimeRef.current = null;
    setPeakAmplitudes([]);
    setRrIntervals([]);
    console.log('useHeartBeatProcessor - Reset completo');
  }, []);

  return {
    processSignal,
    reset,
    bpm,
    peakAmplitudes,
    rrIntervals
  };
}
