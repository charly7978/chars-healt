
import { useRef, useCallback } from 'react';

/**
 * Hook para controlar la tasa de frames y evitar el procesamiento excesivo
 */
export const useFrameRate = (targetFps: number = 30) => {
  const lastFrameTimeRef = useRef<number>(0);
  const frameIntervalMs = 1000 / targetFps;
  
  /**
   * Comprueba si es momento de procesar un nuevo frame
   */
  const shouldProcessFrame = useCallback(() => {
    const now = performance.now();
    if (now - lastFrameTimeRef.current < frameIntervalMs) {
      return false;
    }
    lastFrameTimeRef.current = now;
    return true;
  }, [frameIntervalMs]);
  
  /**
   * Reinicia el temporizador de frames
   */
  const resetFrameTimer = useCallback(() => {
    lastFrameTimeRef.current = 0;
  }, []);
  
  return {
    shouldProcessFrame,
    resetFrameTimer,
    getLastFrameTime: () => lastFrameTimeRef.current
  };
};
