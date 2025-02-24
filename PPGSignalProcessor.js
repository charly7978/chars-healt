import React, { useState, useEffect, useCallback } from 'react';
import { ProcessedSignal, ProcessingError, SignalProcessor } from '../types/signal';

class KalmanFilter {
  constructor() {
    this.R = 0.01;
    this.Q = 0.1;
    this.P = 1;
    this.X = 0;
    this.K = 0;
  }

  filter(measurement) {
    this.P = this.P + this.Q;
    this.K = this.P / (this.P + this.R);
    this.X = this.X + this.K * (measurement - this.X);
    this.P = (1 - this.K) * this.P;
    return this.X;
  }

  reset() {
    this.X = 0;
    this.P = 1;
  }
}

export const PPGSignalProcessor = ({ onSignalReady, onError }) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastValues, setLastValues] = useState([]);
  const [stableFrameCount, setStableFrameCount] = useState(0);
  const [lastStableValue, setLastStableValue] = useState(0);
  const kalmanFilter = new KalmanFilter();

  const DEFAULT_CONFIG = {
    BUFFER_SIZE: 10,
    MIN_RED_THRESHOLD: 80,
    MAX_RED_THRESHOLD: 245,
    STABILITY_WINDOW: 4,
    MIN_STABILITY_COUNT: 3
  };

  const [currentConfig, setCurrentConfig] = useState({ ...DEFAULT_CONFIG });

  const initialize = useCallback(async () => {
    try {
      setLastValues([]);
      setStableFrameCount(0);
      setLastStableValue(0);
      kalmanFilter.reset();
      console.log("PPGSignalProcessor: Inicializado");
    } catch (error) {
      console.error("PPGSignalProcessor: Error de inicialización", error);
      handleError("INIT_ERROR", "Error al inicializar el procesador");
    }
  }, []);

  const start = () => {
    if (isProcessing) return;
    setIsProcessing(true);
    initialize();
    console.log("PPGSignalProcessor: Iniciado");
  };

  const stop = () => {
    setIsProcessing(false);
    setLastValues([]);
    setStableFrameCount(0);
    setLastStableValue(0);
    kalmanFilter.reset();
    console.log("PPGSignalProcessor: Detenido");
  };

  const calibrate = useCallback(async () => {
    try {
      console.log("PPGSignalProcessor: Iniciando calibración");
      await initialize();

      await new Promise(resolve => setTimeout(resolve, 2000));

      setCurrentConfig({
        ...DEFAULT_CONFIG,
        MIN_RED_THRESHOLD: Math.max(25, DEFAULT_CONFIG.MIN_RED_THRESHOLD - 5),
        MAX_RED_THRESHOLD: Math.min(255, DEFAULT_CONFIG.MAX_RED_THRESHOLD + 5),
        STABILITY_WINDOW: DEFAULT_CONFIG.STABILITY_WINDOW,
        MIN_STABILITY_COUNT: DEFAULT_CONFIG.MIN_STABILITY_COUNT
      });

      console.log("PPGSignalProcessor: Calibración completada", currentConfig);
      return true;
    } catch (error) {
      console.error("PPGSignalProcessor: Error de calibración", error);
      handleError("CALIBRATION_ERROR", "Error durante la calibración");
      return false;
    }
  }, [initialize, currentConfig]);

  const resetToDefault = () => {
    setCurrentConfig({ ...DEFAULT_CONFIG });
    initialize();
    console.log("PPGSignalProcessor: Configuración restaurada a valores por defecto");
  };

  const processFrame = (imageData) => {
    if (!isProcessing) {
      console.log("PPGSignalProcessor: No está procesando");
      return;
    }

    try {
      const redValue = extractRedChannel(imageData);
      const filtered = kalmanFilter.filter(redValue);
      setLastValues(prevValues => {
        const newValues = [...prevValues, filtered];
        if (newValues.length > DEFAULT_CONFIG.BUFFER_SIZE) {
          newValues.shift();
        }
        return newValues;
      });

      const { isFingerDetected, quality } = analyzeSignal(filtered, redValue);

      console.log("PPGSignalProcessor: Análisis", {
        redValue,
        filtered,
        isFingerDetected,
        quality,
        stableFrames: stableFrameCount
      });

      const processedSignal = {
        timestamp: Date.now(),
        rawValue: redValue,
        filteredValue: filtered,
        quality: quality,
        fingerDetected: isFingerDetected,
        roi: detectROI(redValue)
      };

      if (onSignalReady) {
        onSignalReady(processedSignal);
      }

    } catch (error) {
      console.error("PPGSignalProcessor: Error procesando frame", error);
      handleError("PROCESSING_ERROR", "Error al procesar frame");
    }
  };

  const extractRedChannel = (imageData) => {
    const data = imageData.data;
    let redSum = 0;
    let count = 0;

    const startX = Math.floor(imageData.width * 0.375);
    const endX = Math.floor(imageData.width * 0.625);
    const startY = Math.floor(imageData.height * 0.375);
    const endY = Math.floor(imageData.height * 0.625);

    for (let y = startY; y < endY; y++) {
      for (let x = startX; x < endX; x++) {
        const i = (y * imageData.width + x) * 4;
        redSum += data[i];
        count++;
      }
    }

    const avgRed = redSum / count;
    return avgRed;
  };

  const analyzeSignal = (filtered, rawValue) => {
    const isInRange = rawValue >= DEFAULT_CONFIG.MIN_RED_THRESHOLD && rawValue <= DEFAULT_CONFIG.MAX_RED_THRESHOLD;

    if (!isInRange) {
      setStableFrameCount(0);
      setLastStableValue(0);
      return { isFingerDetected: false, quality: 0 };
    }

    if (lastValues.length < DEFAULT_CONFIG.STABILITY_WINDOW) {
      return { isFingerDetected: false, quality: 0 };
    }

    const recentValues = lastValues.slice(-DEFAULT_CONFIG.STABILITY_WINDOW);
    const avgValue = recentValues.reduce((sum, val) => sum + val, 0) / recentValues.length;

    const variations = recentValues.map((val, i, arr) => {
      if (i === 0) return 0;
      return val - arr[i - 1];
    });

    const maxVariation = Math.max(...variations.map(Math.abs));
    const minVariation = Math.min(...variations);

    const adaptiveThreshold = Math.max(1.5, avgValue * 0.02);
    const isStable = maxVariation < adaptiveThreshold * 2 &&
      minVariation > -adaptiveThreshold * 2;

    if (isStable) {
      setStableFrameCount(prevCount => Math.min(prevCount + 1, DEFAULT_CONFIG.MIN_STABILITY_COUNT * 2));
      setLastStableValue(filtered);
    } else {
      setStableFrameCount(prevCount => Math.max(0, prevCount - 0.5));
    }

    const isFingerDetected = stableFrameCount >= DEFAULT_CONFIG.MIN_STABILITY_COUNT;

    let quality = 0;
    if (isFingerDetected) {
      const stabilityScore = Math.min(stableFrameCount / (DEFAULT_CONFIG.MIN_STABILITY_COUNT * 2), 1);
      const intensityScore = Math.min((rawValue - DEFAULT_CONFIG.MIN_RED_THRESHOLD) /
        (DEFAULT_CONFIG.MAX_RED_THRESHOLD - DEFAULT_CONFIG.MIN_RED_THRESHOLD), 1);
      const variationScore = Math.max(0, 1 - (maxVariation / (adaptiveThreshold * 3)));

      quality = Math.round((stabilityScore * 0.4 + intensityScore * 0.3 + variationScore * 0.3) * 100);
    }

    return { isFingerDetected, quality };
  };

  const detectROI = (redValue) => {
    return {
      x: 0,
      y: 0,
      width: 100,
      height: 100
    };
  };

  const handleError = (code, message) => {
    console.error("PPGSignalProcessor: Error", code, message);
    const error = {
      code,
      message,
      timestamp: Date.now()
    };
    if (onError) {
      onError(error);
    }
  };

  return {
    start,
    stop,
    calibrate,
    resetToDefault,
    processFrame
  };
}; 