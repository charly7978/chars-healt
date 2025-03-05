
import { useCallback, useRef } from 'react';
import { PPGSignalProcessor } from '../modules/SignalProcessor';

/**
 * Hook para manejar la calibración del procesador de señal
 */
export const useCalibration = (processorRef: React.MutableRefObject<PPGSignalProcessor | null>) => {
  const isCalibrationPhaseRef = useRef<boolean>(true);
  const calibrationCounterRef = useRef<number>(0);
  const calibrationThresholdRef = useRef<number>(30); // 30 frames (~1s at 30fps)

  /**
   * Realiza la calibración del procesador
   */
  const calibrate = useCallback(async () => {
    try {
      console.log("useCalibration: Starting calibration");
      if (processorRef.current) {
        await processorRef.current.calibrate();
        console.log("useCalibration: Calibration successful");
        return true;
      }
      return false;
    } catch (error) {
      console.error("useCalibration: Calibration error:", error);
      return false;
    }
  }, [processorRef]);

  /**
   * Reinicia el estado de calibración
   */
  const resetCalibration = useCallback(() => {
    isCalibrationPhaseRef.current = true;
    calibrationCounterRef.current = 0;
  }, []);

  /**
   * Actualiza el contador de calibración
   */
  const updateCalibrationCounter = useCallback(() => {
    if (isCalibrationPhaseRef.current) {
      calibrationCounterRef.current++;
      if (calibrationCounterRef.current >= calibrationThresholdRef.current) {
        isCalibrationPhaseRef.current = false;
        console.log("useCalibration: Automatic calibration completed");
        return true;
      }
    }
    return false;
  }, []);

  return {
    isCalibrationPhase: () => isCalibrationPhaseRef.current,
    calibrate,
    resetCalibration,
    updateCalibrationCounter
  };
};
