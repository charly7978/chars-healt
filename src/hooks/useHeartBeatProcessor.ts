
import { useState, useEffect, useCallback, useRef } from 'react';
import { HeartBeatProcessor } from '../modules/HeartBeatProcessor';

interface HeartBeatResult {
  bpm: number;
  confidence: number;
  isPeak: boolean;
  filteredValue?: number;
  arrhythmiaCount: number;
  rrData?: {
    intervals: number[];
    lastPeakTime: number | null;
  };
}

export const useHeartBeatProcessor = () => {
  const processorRef = useRef<HeartBeatProcessor | null>(null);
  const [currentBPM, setCurrentBPM] = useState<number>(0);
  const [confidence, setConfidence] = useState<number>(0);
  const signalBufferRef = useRef<number[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    console.log('useHeartBeatProcessor: Creando nueva instancia de HeartBeatProcessor');
    processorRef.current = new HeartBeatProcessor();
    
    // Inicializar contexto de audio aquí para que responda a la interacción del usuario
    try {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      console.log('useHeartBeatProcessor: Audio Context creado:', audioContextRef.current.state);
      
      // Intentar activar el contexto de audio inmediatamente
      if (audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume().then(() => {
          console.log('useHeartBeatProcessor: Audio Context resumed');
        }).catch(err => {
          console.error('useHeartBeatProcessor: Error resuming Audio Context:', err);
        });
      }
      
      // Hacer un beep de prueba silencioso para activar el audio
      const oscillator = audioContextRef.current.createOscillator();
      const gainNode = audioContextRef.current.createGain();
      gainNode.gain.value = 0.01;
      oscillator.connect(gainNode);
      gainNode.connect(audioContextRef.current.destination);
      oscillator.start();
      oscillator.stop(audioContextRef.current.currentTime + 0.1);
    } catch (e) {
      console.error('useHeartBeatProcessor: Error inicializando Audio Context:', e);
    }
    
    if (typeof window !== 'undefined') {
      (window as any).heartBeatProcessor = processorRef.current;
      (window as any).audioContext = audioContextRef.current;
    }

    return () => {
      console.log('useHeartBeatProcessor: Limpiando processor');
      if (processorRef.current) {
        processorRef.current = null;
      }
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(e => console.error('Error cerrando AudioContext:', e));
        audioContextRef.current = null;
      }
      if (typeof window !== 'undefined') {
        (window as any).heartBeatProcessor = undefined;
        (window as any).audioContext = undefined;
      }
      // Limpiar buffer
      signalBufferRef.current = [];
    };
  }, []);

  const processSignal = useCallback((value: number): HeartBeatResult => {
    if (!processorRef.current) {
      console.warn('useHeartBeatProcessor: Processor no inicializado');
      return {
        bpm: 0,
        confidence: 0,
        isPeak: false,
        arrhythmiaCount: 0,
        rrData: {
          intervals: [],
          lastPeakTime: null
        }
      };
    }

    // Almacenar señal en buffer para análisis
    signalBufferRef.current.push(value);
    // Limitar tamaño del buffer para controlar memoria
    if (signalBufferRef.current.length > 300) {
      signalBufferRef.current = signalBufferRef.current.slice(-300);
    }

    const result = processorRef.current.processSignal(value);
    const rrData = processorRef.current.getRRIntervals();
    
    // Si se detecta un pico, intentar reproducir el beep aquí
    if (result.isPeak && audioContextRef.current) {
      try {
        // Asegurarse que el contexto de audio esté activo
        if (audioContextRef.current.state === 'suspended') {
          audioContextRef.current.resume();
        }
        
        const oscillator = audioContextRef.current.createOscillator();
        const gainNode = audioContextRef.current.createGain();
        
        oscillator.type = 'sine';
        oscillator.frequency.value = 800; // Frecuencia del beep
        
        gainNode.gain.setValueAtTime(0, audioContextRef.current.currentTime);
        gainNode.gain.linearRampToValueAtTime(0.5, audioContextRef.current.currentTime + 0.01);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContextRef.current.currentTime + 0.1);
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContextRef.current.destination);
        
        oscillator.start();
        oscillator.stop(audioContextRef.current.currentTime + 0.1);
      } catch (e) {
        console.error('Error reproduciendo beep:', e);
        
        // Plan B: Usar el API Audio si Web Audio API falla
        try {
          const audio = new Audio("data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAAPuUdcAAAAgD///wQAAAA=");
          audio.volume = 0.5;
          audio.play().catch(err => console.error("Error en audio alternativo:", err));
        } catch (audioErr) {
          console.error("Error en audio alternativo:", audioErr);
        }
      }
    }
    
    if (result.bpm > 0) {
      setCurrentBPM(result.bpm);
      setConfidence(result.confidence);
    }

    return {
      ...result,
      rrData
    };
  }, []);

  const reset = useCallback(() => {
    console.log('useHeartBeatProcessor: Reseteando processor');
    if (processorRef.current) {
      processorRef.current.reset();
    }
    setCurrentBPM(0);
    setConfidence(0);
    
    // Limpiar buffer de señales para liberar memoria
    signalBufferRef.current = [];
    
    // Forzar garbage collection si está disponible
    if (window.gc) {
      try {
        window.gc();
      } catch (e) {
        console.log("GC no disponible en este entorno");
      }
    }
  }, []);

  // Función para limpieza agresiva de memoria
  const cleanMemory = useCallback(() => {
    console.log('useHeartBeatProcessor: Limpieza agresiva de memoria');
    if (processorRef.current) {
      processorRef.current.reset();
    }
    
    // Limpiar estados
    setCurrentBPM(0);
    setConfidence(0);
    
    // Limpiar buffer de señales
    signalBufferRef.current = [];
    
    // Recrear el procesador para asegurar limpieza completa
    processorRef.current = new HeartBeatProcessor();
    
    if (typeof window !== 'undefined') {
      (window as any).heartBeatProcessor = processorRef.current;
    }
    
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
    currentBPM,
    confidence,
    processSignal,
    reset,
    cleanMemory
  };
};
