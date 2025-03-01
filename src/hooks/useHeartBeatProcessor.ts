import { useState, useRef, useCallback } from 'react';
import { HeartBeatProcessor } from '../modules/HeartBeatProcessor';

export function useHeartBeatProcessor() {
  const processorRef = useRef<HeartBeatProcessor | null>(null);
  const [bpm, setBpm] = useState(0);
  const valuesBufferRef = useRef<number[]>([]);
  const lastPeakTimeRef = useRef<number | null>(null);
  const [peakAmplitudes, setPeakAmplitudes] = useState<number[]>([]);
  const [rrIntervals, setRrIntervals] = useState<number[]>([]);
  
  if (!processorRef.current) {
    processorRef.current = new HeartBeatProcessor();
  }

  const processSignal = useCallback((value: number) => {
    if (!processorRef.current) return { bpm: 0, rrData: { intervals: [], lastPeakTime: null } };
    
    valuesBufferRef.current.push(value);
    
    const normalizedValue = Math.abs(value);
    const result = processorRef.current.processSignal(normalizedValue);
    
    if (result.bpm > 0) {
      setBpm(result.bpm);
    }
    
    if (result.isPeak) {
      lastPeakTimeRef.current = Date.now();
      
      if (valuesBufferRef.current.length > 0) {
        const lastValues = valuesBufferRef.current.slice(-5);
        const avgAmplitude = lastValues.reduce((sum, val) => sum + val, 0) / lastValues.length;
        
        setPeakAmplitudes(prev => {
          const newAmps = [...prev, Math.abs(avgAmplitude)];
          return newAmps.slice(-20);
        });
      }
    }
    
    const { intervals, amplitudes } = processorRef.current.getRRIntervals();
    
    if (intervals.length > 0) {
      setRrIntervals(intervals);
    }
    
    if (result.isPeak) {
      console.log('useHeartBeatProcessor - Pico detectado:', {
        bpm: result.bpm,
        confidence: result.confidence.toFixed(2),
        amplitudes: amplitudes ? amplitudes.length : 0,
        intervals: intervals.length,
        normalizedValue: normalizedValue.toFixed(2),
        originalValue: value.toFixed(2),
        timestamp: new Date().toISOString()
      });
    }
    
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

  const cleanMemory = useCallback(() => {
    console.log('useHeartBeatProcessor: Performing memory cleanup');
    reset();
    
    if (processorRef.current) {
      processorRef.current = null;
    }
    valuesBufferRef.current = [];
    lastPeakTimeRef.current = null;
    setPeakAmplitudes([]);
    setRrIntervals([]);
    setBpm(0);
  }, [reset]);

  return {
    processSignal,
    reset,
    bpm,
    peakAmplitudes,
    rrIntervals,
    cleanMemory
  };
}
