
import { useRef, useCallback } from 'react';

/**
 * Hook optimizado para controlar la tasa de frames y evitar el procesamiento excesivo
 * Con mejoras significativas para dispositivos móviles
 */
export const useFrameRate = (targetFps: number = 15) => { // Reduced default from 20 to 15 fps for better performance
  const lastFrameTimeRef = useRef<number>(0);
  const frameCountRef = useRef<number>(0);
  const lastFpsUpdateRef = useRef<number>(0);
  const currentFpsRef = useRef<number>(0);
  
  // Calculate frame interval once
  const frameIntervalMs = 1000 / targetFps;
  
  /**
   * Comprueba si es momento de procesar un nuevo frame
   * con optimizaciones agresivas de rendimiento
   */
  const shouldProcessFrame = useCallback(() => {
    const now = performance.now();
    
    // Update FPS counter every 1.5 seconds instead of every second
    if (now - lastFpsUpdateRef.current >= 1500) {
      currentFpsRef.current = frameCountRef.current;
      frameCountRef.current = 0;
      lastFpsUpdateRef.current = now;
    }
    
    // Skip frame if not enough time has passed - with extra margin
    if (now - lastFrameTimeRef.current < frameIntervalMs + 2) {
      return false;
    }
    
    // Aggressive frame skipping for low performance devices
    // If we're running below 80% of target FPS, increase frame skipping
    if (currentFpsRef.current > 0 && currentFpsRef.current < targetFps * 0.8) {
      // Skip even more frames when performance is poor
      if (now - lastFrameTimeRef.current < frameIntervalMs * 2) {
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
