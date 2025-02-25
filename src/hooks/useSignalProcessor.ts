import { useState, useEffect, useRef, useCallback } from 'react';

interface Signal {
  filteredValue: number;
  rawValue: number;
  quality: number;
  fingerDetected: boolean;
}

export function useSignalProcessor() {
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [lastSignal, setLastSignal] = useState<Signal | null>(null);
  
  // Referencias para el buffer y estado del procesador
  const valueBufferRef = useRef<number[]>([]);
  const timeBufferRef = useRef<number[]>([]);
  const qualityBufferRef = useRef<number[]>([]);
  const lastProcessingTimeRef = useRef<number>(0);
  const baselineRef = useRef<number>(0);
  const signalCountRef = useRef<number>(0);
  const fingerDetectedRef = useRef<boolean>(false);
  const signalQualityRef = useRef<number>(0);
  const lowSignalCountRef = useRef<number>(0);
  
  // Constantes de configuración
  const BUFFER_SIZE = 120; // 4 segundos a 30fps
  const MIN_RED_THRESHOLD = 20; // Mínimo valor rojo para detección de dedo
  const QUALITY_THRESHOLD = 0.05; // Umbral de calidad de señal
  const FINGER_DETECTION_FRAMES = 15; // Frames consecutivos para confirmar detección
  const BASELINE_ALPHA = 0.01; // Factor de adaptación de línea base
  const LOW_SIGNAL_THRESHOLD = 0.01; // Umbral para considerar señal baja
  const LOW_SIGNAL_FRAMES = 30; // Frames consecutivos para considerar señal perdida
  const DEBUG_MODE = true; // Modo debug para logueo detallado
  
  // Iniciar procesamiento
  const startProcessing = useCallback(() => {
    setIsProcessing(true);
    valueBufferRef.current = [];
    timeBufferRef.current = [];
    qualityBufferRef.current = [];
    lastProcessingTimeRef.current = 0;
    baselineRef.current = 0;
    signalCountRef.current = 0;
    fingerDetectedRef.current = false;
    signalQualityRef.current = 0;
    lowSignalCountRef.current = 0;
    console.log("useSignalProcessor: Procesamiento iniciado");
  }, []);
  
  // Detener procesamiento
  const stopProcessing = useCallback(() => {
    setIsProcessing(false);
    setLastSignal(null);
    console.log("useSignalProcessor: Procesamiento detenido");
  }, []);
  
  // Extraer señal PPG de un frame de cámara
  const processFrame = useCallback((imageData: ImageData) => {
    if (!isProcessing) return;
    
    const currentTime = Date.now();
    const data = imageData.data;
    const width = imageData.width;
    const height = imageData.height;
    
    // Analizar solo a 30fps máximo (33ms mínimo entre frames)
    if (currentTime - lastProcessingTimeRef.current < 33) return;
    lastProcessingTimeRef.current = currentTime;
    
    // Calcular promedio de rojo en el centro de la imagen
    const centerX = Math.floor(width / 2);
    const centerY = Math.floor(height / 2);
    const sampleSize = Math.floor(Math.min(width, height) * 0.3);
    
    let totalRed = 0;
    let totalGreen = 0;
    let totalBlue = 0;
    let pixelCount = 0;
    
    // Tomar muestra del centro de la imagen donde suele estar el dedo
    for (let y = centerY - sampleSize; y < centerY + sampleSize; y += 2) {
      if (y < 0 || y >= height) continue;
      
      for (let x = centerX - sampleSize; x < centerX + sampleSize; x += 2) {
        if (x < 0 || x >= width) continue;
        
        const i = (y * width + x) * 4;
        totalRed += data[i];
        totalGreen += data[i + 1];
        totalBlue += data[i + 2];
        pixelCount++;
      }
    }
    
    if (pixelCount === 0) return;
    
    const avgRed = totalRed / pixelCount;
    const avgGreen = totalGreen / pixelCount;
    const avgBlue = totalBlue / pixelCount;
    
    // Detectar dedo basado en predominancia de rojo (característica de sangre)
    const isFingerPotentiallyPresent = avgRed > MIN_RED_THRESHOLD && 
                                        avgRed > avgGreen * 1.1 && 
                                        avgRed > avgBlue * 1.1;
    
    // Algoritmo para confirmar/rechazar detección de dedo con histéresis
    if (isFingerPotentiallyPresent) {
      if (fingerDetectedRef.current) {
        lowSignalCountRef.current = 0; // Resetear contador de señal baja
      } else {
        // Incrementar contador de detección
        lowSignalCountRef.current++;
        if (lowSignalCountRef.current >= FINGER_DETECTION_FRAMES) {
          fingerDetectedRef.current = true;
          lowSignalCountRef.current = 0;
          console.log("useSignalProcessor: Dedo detectado");
        }
      }
    } else {
      if (fingerDetectedRef.current) {
        // Incrementar contador de pérdida
        lowSignalCountRef.current++;
        if (lowSignalCountRef.current >= FINGER_DETECTION_FRAMES) {
          fingerDetectedRef.current = false;
          lowSignalCountRef.current = 0;
          console.log("useSignalProcessor: Dedo retirado");
        }
      } else {
        lowSignalCountRef.current = 0;
      }
    }
    
    // Si no hay dedo, no procesar más
    if (!fingerDetectedRef.current) {
      setLastSignal({
        filteredValue: 0,
        rawValue: 0,
        quality: 0,
        fingerDetected: false
      });
      return;
    }
    
    // Extraer valor crudo (el componente rojo es el más sensible a cambios de sangre)
    const rawValue = avgRed;
    
    // Actualizar línea base adaptativa
    if (baselineRef.current === 0) {
      baselineRef.current = rawValue;
    } else {
      baselineRef.current = baselineRef.current * (1 - BASELINE_ALPHA) + rawValue * BASELINE_ALPHA;
    }
    
    // Normalizar valor a la línea base
    const normalizedValue = rawValue - baselineRef.current;
    
    // Almacenar en buffer
    valueBufferRef.current.push(normalizedValue);
    timeBufferRef.current.push(currentTime);
    
    // Mantener tamaño del buffer
    if (valueBufferRef.current.length > BUFFER_SIZE) {
      valueBufferRef.current.shift();
      timeBufferRef.current.shift();
    }
    
    // Calcular calidad de señal
    const quality = calculateSignalQuality(valueBufferRef.current);
    qualityBufferRef.current.push(quality);
    
    if (qualityBufferRef.current.length > 10) {
      qualityBufferRef.current.shift();
    }
    
    const avgQuality = qualityBufferRef.current.reduce((sum, q) => sum + q, 0) / 
                        qualityBufferRef.current.length;
    
    signalQualityRef.current = avgQuality * 100; // Convertir a porcentaje
    
    // Detectar señal baja
    if (Math.abs(normalizedValue) < LOW_SIGNAL_THRESHOLD && fingerDetectedRef.current) {
      lowSignalCountRef.current++;
      if (lowSignalCountRef.current > LOW_SIGNAL_FRAMES) {
        // Señal muy baja por mucho tiempo, posiblemente el dedo se movió
        signalQualityRef.current = Math.max(10, signalQualityRef.current * 0.8);
      }
    } else {
      lowSignalCountRef.current = Math.max(0, lowSignalCountRef.current - 1);
    }
    
    // Aplicar filtro de paso bajo simple (media móvil)
    let filteredValue = 0;
    if (valueBufferRef.current.length >= 3) {
      filteredValue = (
        valueBufferRef.current[valueBufferRef.current.length - 1] +
        valueBufferRef.current[valueBufferRef.current.length - 2] +
        valueBufferRef.current[valueBufferRef.current.length - 3]
      ) / 3;
    } else {
      filteredValue = normalizedValue;
    }
    
    // Log periódico para debug
    signalCountRef.current++;
    if (DEBUG_MODE && signalCountRef.current % 30 === 0) {
      console.log("useSignalProcessor: Estadísticas de señal", {
        rawValue,
        normalizedValue,
        filteredValue,
        quality: signalQualityRef.current.toFixed(1) + "%",
        baseline: baselineRef.current,
        bufferSize: valueBufferRef.current.length
      });
    }
    
    // Actualizar estado con la señal procesada
    setLastSignal({
      filteredValue,
      rawValue,
      quality: Math.round(signalQualityRef.current),
      fingerDetected: fingerDetectedRef.current
    });
    
  }, [isProcessing]);
  
  // Calcular calidad de señal basada en variabilidad y magnitud
  const calculateSignalQuality = (values: number[]): number => {
    if (values.length < 5) return 0;
    
    // Variabilidad como indicador de calidad
    let sumSquares = 0;
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    
    for (const val of values) {
      sumSquares += Math.pow(val - mean, 2);
    }
    
    const variance = sumSquares / values.length;
    const stdDev = Math.sqrt(variance);
    
    // Normalizar usando una función sigmoide
    const normalizedQuality = 1 / (1 + Math.exp(-10 * (stdDev - QUALITY_THRESHOLD)));
    return Math.min(1, normalizedQuality * 1.5); // Factor de escala para mejorar sensibilidad
  };
  
  return {
    isProcessing,
    lastSignal,
    startProcessing,
    stopProcessing,
    processFrame
  };
}
