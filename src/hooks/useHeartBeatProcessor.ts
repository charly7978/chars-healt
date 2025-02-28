
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
  const audioInitializedRef = useRef<boolean>(false);
  const lastBeepTimeRef = useRef<number>(0);

  useEffect(() => {
    console.log('useHeartBeatProcessor: Creando nueva instancia de HeartBeatProcessor');
    processorRef.current = new HeartBeatProcessor();
    
    // Inicializar contexto de audio aquí para que responda a la interacción del usuario
    if (!audioInitializedRef.current) {
      try {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        console.log('useHeartBeatProcessor: Audio Context creado:', audioContextRef.current.state);
        
        // Intentar activar el contexto de audio inmediatamente
        if (audioContextRef.current.state === 'suspended') {
          audioContextRef.current.resume().then(() => {
            console.log('useHeartBeatProcessor: Audio Context resumed');
            audioInitializedRef.current = true;
          }).catch(err => {
            console.error('useHeartBeatProcessor: Error resuming Audio Context:', err);
          });
        } else {
          audioInitializedRef.current = true;
        }

        // Reproducir un beep silencioso para activar el audio
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
    }
    
    if (typeof window !== 'undefined') {
      (window as any).heartBeatProcessor = processorRef.current;
      (window as any).audioContext = audioContextRef.current;
    }

    document.addEventListener('click', () => {
      if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume().then(() => {
          console.log('Audio Context resumed after user interaction');
        });
      }
    }, { once: true });

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

  const playBeep = useCallback(() => {
    const now = Date.now();
    // Limitar la frecuencia de beeps (no más de uno cada 300ms)
    if (now - lastBeepTimeRef.current < 300) {
      return;
    }
    lastBeepTimeRef.current = now;
    
    if (!audioContextRef.current) {
      console.warn('No audio context available');
      return;
    }
    
    try {
      // Verificar y reactivar el contexto de audio si está suspendido
      if (audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume();
      }
      
      const oscillator = audioContextRef.current.createOscillator();
      const gainNode = audioContextRef.current.createGain();
      
      oscillator.type = 'sine';
      oscillator.frequency.value = 800;
      
      gainNode.gain.setValueAtTime(0, audioContextRef.current.currentTime);
      gainNode.gain.linearRampToValueAtTime(1.0, audioContextRef.current.currentTime + 0.01);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContextRef.current.currentTime + 0.1);
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContextRef.current.destination);
      
      oscillator.start();
      oscillator.stop(audioContextRef.current.currentTime + 0.1);
      
      console.log('BEEP played at', now);
    } catch (e) {
      console.error('Error reproduciendo beep:', e);
      // Plan B alternativo con el elemento Audio
      try {
        const audio = new Audio();
        audio.src = "data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAAPuUdcAAAAgD///wQAAAA=";
        audio.volume = 1.0;
        audio.play().catch(err => {
          console.error("Error en audio alternativo:", err);
          // Tercer intento: usar un beep con la API de Audio con un sonido pregenerado
          const backupAudio = new Audio("data:audio/wav;base64,UklGRisAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQcAAAAAAAAAAAAAAAE=");
          backupAudio.volume = 1.0;
          backupAudio.play().catch(e => console.error("Todos los intentos de reproducir sonido fallaron:", e));
        });
      } catch (audioErr) {
        console.error("Error completo en sistema de audio:", audioErr);
      }
    }
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
    
    // Si se detecta un pico, reproducir el beep directamente aquí
    if (result.isPeak) {
      console.log('PEAK DETECTED - Playing beep');
      playBeep();
    }
    
    // Asegurarse de que el BPM se actualice correctamente
    if (result.bpm > 0) {
      setCurrentBPM(Math.round(result.bpm));
      setConfidence(result.confidence);
    }

    return {
      ...result,
      rrData
    };
  }, [playBeep]);

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
