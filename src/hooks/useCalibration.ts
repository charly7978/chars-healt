
import { useCallback, useRef, useMemo } from 'react';
import { PPGSignalProcessor } from '../modules/SignalProcessor';

/**
 * Hook optimizado para manejar la calibración del procesador de señal
 */
export const useCalibration = (processorRef: React.MutableRefObject<PPGSignalProcessor | null>) => {
  // Use refs for mutable state to prevent rerendering
  const isCalibrationPhaseRef = useRef<boolean>(true);
  const calibrationCounterRef = useRef<number>(0);
  // Store threshold in ref to avoid recreating callbacks when it changes
  const calibrationThresholdRef = useRef<number>(30); // 30 frames (~1s at 30fps)
  
  // Track calibration attempts to prevent redundant calls
  const calibrationAttemptRef = useRef<{
    inProgress: boolean;
    lastAttempt: number;
    successCount: number;
    failCount: number;
  }>({
    inProgress: false,
    lastAttempt: 0,
    successCount: 0,
    failCount: 0
  });

  /**
   * Realiza la calibración del procesador con prevención de llamadas redundantes
   */
  const calibrate = useCallback(async () => {
    try {
      // Prevent redundant calibration calls
      const now = Date.now();
      if (calibrationAttemptRef.current.inProgress) {
        console.log("useCalibration: Calibration already in progress, skipping");
        return false;
      }
      
      // Throttle calibration attempts to prevent excessive calls
      if (now - calibrationAttemptRef.current.lastAttempt < 2000) { // 2 second cooldown
        console.log("useCalibration: Calibration attempted too recently, skipping");
        return false;
      }
      
      calibrationAttemptRef.current.inProgress = true;
      calibrationAttemptRef.current.lastAttempt = now;
      
      console.log("useCalibration: Starting calibration");
      if (processorRef.current) {
        await processorRef.current.calibrate();
        console.log("useCalibration: Calibration successful");
        calibrationAttemptRef.current.successCount++;
        calibrationAttemptRef.current.inProgress = false;
        return true;
      }
      
      calibrationAttemptRef.current.inProgress = false;
      return false;
    } catch (error) {
      console.error("useCalibration: Calibration error:", error);
      calibrationAttemptRef.current.failCount++;
      calibrationAttemptRef.current.inProgress = false;
      return false;
    }
  }, [processorRef]);

  /**
   * Reinicia el estado de calibración
   */
  const resetCalibration = useCallback(() => {
    isCalibrationPhaseRef.current = true;
    calibrationCounterRef.current = 0;
    calibrationAttemptRef.current = {
      inProgress: false,
      lastAttempt: 0,
      successCount: 0,
      failCount: 0
    };
  }, []);

  /**
   * Actualiza el contador de calibración con memoria para evitar cambios de estado innecesarios
   */
  const updateCalibrationCounter = useCallback(() => {
    // Skip this function if calibration is already completed
    if (!isCalibrationPhaseRef.current) {
      return false;
    }
    
    calibrationCounterRef.current++;
    
    if (calibrationCounterRef.current >= calibrationThresholdRef.current) {
      isCalibrationPhaseRef.current = false;
      console.log("useCalibration: Automatic calibration completed");
      return true;
    }
    
    return false;
  }, []);

  return {
    isCalibrationPhase: useCallback(() => isCalibrationPhaseRef.current, []),
    calibrate,
    resetCalibration,
    updateCalibrationCounter,
    // Add useful debug information for developers
    getCalibrationStatus: useCallback(() => ({
      isCalibrationPhase: isCalibrationPhaseRef.current,
      counter: calibrationCounterRef.current,
      threshold: calibrationThresholdRef.current,
      attempts: {
        lastAttempt: calibrationAttemptRef.current.lastAttempt,
        successCount: calibrationAttemptRef.current.successCount,
        failCount: calibrationAttemptRef.current.failCount,
        inProgress: calibrationAttemptRef.current.inProgress
      }
    }), [])
  };
};
