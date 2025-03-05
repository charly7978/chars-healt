
import { useRef, useCallback } from 'react';

/**
 * Hook optimizado para controlar la tasa de frames y evitar el procesamiento excesivo
 */
export const useFrameRate = (targetFps: number = 20) => { // Reduced default from 30 to 20 fps for better performance
  const lastFrameTimeRef = useRef<number>(0);
  const frameCountRef = useRef<number>(0);
  const lastFpsUpdateRef = useRef<number>(0);
  const currentFpsRef = useRef<number>(0);
  
  // Calculate frame interval once
  const frameIntervalMs = 1000 / targetFps;
  
  /**
   * Comprueba si es momento de procesar un nuevo frame
   * con optimizaciones de rendimiento
   */
  const shouldProcessFrame = useCallback(() => {
    const now = performance.now();
    
    // Update FPS counter every second
    if (now - lastFpsUpdateRef.current >= 1000) {
      currentFpsRef.current = frameCountRef.current;
      frameCountRef.current = 0;
      lastFpsUpdateRef.current = now;
    }
    
    // Skip frame if not enough time has passed
    if (now - lastFrameTimeRef.current < frameIntervalMs) {
      return false;
    }
    
    // Adaptive frame skipping for low performance devices
    // If we're running below 75% of target FPS, increase frame skipping
    if (currentFpsRef.current > 0 && currentFpsRef.current < targetFps * 0.75) {
      // Skip even more frames when performance is poor
      if (now - lastFrameTimeRef.current < frameIntervalMs * 1.5) {
        return false;
      }
    }
    
    lastFrameTimeRef.current = now;
    frameCountRef.current++;
    return true;
  }, [frameIntervalMs, targetFps]);
  
  /**
   * Reinicia el temporizador de frames y contadores
   */
  const resetFrameTimer = useCallback(() => {
    lastFrameTimeRef.current = 0;
    frameCountRef.current = 0;
    lastFpsUpdateRef.current = 0;
    currentFpsRef.current = 0;
  }, []);
  
  return {
    shouldProcessFrame,
    resetFrameTimer,
    getCurrentFps: () => currentFpsRef.current,
    getLastFrameTime: () => lastFrameTimeRef.current
  };
};
