import React, { useEffect, useRef, useCallback, useState } from 'react';
import { Fingerprint } from 'lucide-react';
import { CircularBuffer, PPGDataPoint } from '../utils/CircularBuffer';

interface PPGSignalMeterProps {
  value: number;
  quality: number;
  isFingerDetected: boolean;
  onStartMeasurement: () => void;
  onReset: () => void;
  arrhythmiaStatus?: string;
  rawArrhythmiaData?: {
    timestamp: number;
    rmssd: number;
    rrVariation: number;
  } | null;
}

interface PPGDataPoint {
  time: number;
  value: number;
  isPeak: boolean;
  isArrhythmia: boolean;
}

const ArrhythmiaDisplay: React.FC<{
  status: string;
  data: {
    timestamp: number;
    rmssd: number;
    rrVariation: number;
  } | null;
}> = ({ status, data }) => {
  return (
    <div className="text-sm">
      <div className="font-semibold text-white/90">{status}</div>
      {data && (
        <div className="text-xs text-gray-400">
          <div>RMSSD: {data.rmssd.toFixed(2)}</div>
          <div>Variación RR: {(data.rrVariation * 100).toFixed(1)}%</div>
        </div>
      )}
    </div>
  );
};

const PPGSignalMeter = ({ 
  value, 
  quality, 
  isFingerDetected,
  onStartMeasurement,
  onReset,
  arrhythmiaStatus,
  rawArrhythmiaData
}: PPGSignalMeterProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dataBufferRef = useRef<CircularBuffer>(new CircularBuffer(300));
  const baselineRef = useRef<number>(0);
  const lastValueRef = useRef<number>(0);
  const animationFrameRef = useRef<number>();
  const lastRenderTimeRef = useRef<number>(0);
  const lastArrhythmiaTime = useRef<number>(0);
  const arrhythmiaCountRef = useRef<number>(0);
  
  const DISPLAY_CONFIG = {
    CANVAS: {
      WIDTH: 800,
      HEIGHT: 200,
      BACKGROUND: '#000000',
      GRID: {
        COLOR: 'rgba(255, 255, 255, 0.1)',
        SPACING: 25
      }
    },
    SIGNAL: {
      COLOR: '#00ff00',
      PEAK_COLOR: '#ff0000',
      WIDTH: 2
    },
    TIME_WINDOW: 5000,
    VERTICAL_SCALE: 100,
    UPDATE_INTERVAL: 1000 / 60
  };

  const [technicalInfo, setTechnicalInfo] = useState({
    peakCount: 0,
    avgAmplitude: 0,
    signalToNoise: 0,
    lastPeakTime: 0
  });

  // Sistema de audio optimizado
  const audioContextRef = useRef<AudioContext | null>(null);
  const oscillatorRef = useRef<OscillatorNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);

  // Actualizar la configuración PPG para máxima precisión
  const PPG_CONFIG = {
    SIGNAL: {
      SAMPLE_RATE: 30,
      MIN_AMPLITUDE: 0.15,
      MAX_AMPLITUDE: 2.5,
      // Mejora del filtrado adaptativo
      FILTER: {
        BASELINE_ALPHA: 0.97,    // Más suave para mejor seguimiento
        EMA_ALPHA: 0.3,         // Filtrado exponencial
        MEDIAN_WINDOW: 5,       // Filtrado de ruido impulsivo
        KALMAN: {
          Q: 0.001,            // Proceso de ruido
          R: 0.1              // Medición de ruido
        }
      },
      // Mejora de detección de calidad
      QUALITY: {
        MIN_SNR: 3.0,          // Ratio señal-ruido mínimo
        STABILITY_WINDOW: 10,   // Ventana para estabilidad
        NOISE_THRESHOLD: 0.03   // Umbral de ruido
      }
    },
    PEAK_DETECTION: {
      // Parámetros optimizados para detección PPG
      MIN_PEAK_DISTANCE: 400,    // Para FC máx de 150 bpm
      MAX_PEAK_DISTANCE: 2000,   // Para FC mín de 30 bpm
      MIN_PEAK_HEIGHT: 0.2,
      MAX_PEAK_HEIGHT: 3.0,
      THRESHOLD_RATIO: 0.65,
      // Nuevo: Sistema de validación multi-ventana
      VALIDATION: {
        SHORT_WINDOW: 3,        // Validación inmediata
        MEDIUM_WINDOW: 5,       // Validación de tendencia
        LONG_WINDOW: 8,         // Validación de patrón
        SIMILARITY_THRESHOLD: 0.7
      }
    },
    HEART_RATE: {
      MIN_BPM: 30,
      MAX_BPM: 220,
      CONFIDENCE_THRESHOLD: 0.65
    },
    BEEP: {
      FREQUENCY: 880,
      DURATION: 60,
      VOLUME: 0.1,
      ATTACK: 0.005,
      RELEASE: 0.05
    }
  };

  // Nuevo sistema de detección de picos mejorado
  const createPeakDetector = () => {
    let kalmanFilter = {
      x: 0,  // Estado estimado
      p: 1,  // Estimación de error
      q: PPG_CONFIG.SIGNAL.FILTER.KALMAN.Q,  // Ruido del proceso
      r: PPG_CONFIG.SIGNAL.FILTER.KALMAN.R,  // Ruido de medición
      
      update(measurement: number) {
        // Predicción
        this.p = this.p + this.q;
        
        // Actualización
        const k = this.p / (this.p + this.r);
        this.x = this.x + k * (measurement - this.x);
        this.p = (1 - k) * this.p;
        
        return this.x;
      }
    };

    return {
      lastPeaks: [] as Array<{time: number, value: number}>,
      baselineEstimator: new MedianFilter(PPG_CONFIG.SIGNAL.FILTER.MEDIAN_WINDOW),
      kalmanFilter,
      
      detectPeak(value: number, timestamp: number): boolean {
        // 1. Filtrado en cascada
        const medianFiltered = this.baselineEstimator.process(value);
        const kalmanFiltered = this.kalmanFilter.update(medianFiltered);
        
        // 2. Normalización adaptativa
        const normalizedValue = kalmanFiltered - this.baselineEstimator.getBaseline();
        
        // 3. Validación temporal
        const lastPeak = this.lastPeaks[this.lastPeaks.length - 1];
        if (lastPeak) {
          const timeSinceLastPeak = timestamp - lastPeak.time;
          if (timeSinceLastPeak < PPG_CONFIG.PEAK_DETECTION.MIN_PEAK_DISTANCE) {
            return false;
          }
        }

        // 4. Análisis de ventana múltiple
        const shortWindow = this.lastPeaks.slice(-PPG_CONFIG.PEAK_DETECTION.VALIDATION.SHORT_WINDOW);
        const mediumWindow = this.lastPeaks.slice(-PPG_CONFIG.PEAK_DETECTION.VALIDATION.MEDIUM_WINDOW);
        const longWindow = this.lastPeaks.slice(-PPG_CONFIG.PEAK_DETECTION.VALIDATION.LONG_WINDOW);

        // 5. Validación multi-criterio
        const isPeak = this.validatePeak({
          value: normalizedValue,
          timestamp,
          shortWindow,
          mediumWindow,
          longWindow
        });

        if (isPeak) {
          this.lastPeaks.push({ time: timestamp, value: normalizedValue });
          if (this.lastPeaks.length > PPG_CONFIG.PEAK_DETECTION.VALIDATION.LONG_WINDOW) {
            this.lastPeaks.shift();
          }
        }

        return isPeak;
      },

      validatePeak({ value, timestamp, shortWindow, mediumWindow, longWindow }) {
        // 1. Validación de amplitud
        if (value < PPG_CONFIG.PEAK_DETECTION.MIN_PEAK_HEIGHT || 
            value > PPG_CONFIG.PEAK_DETECTION.MAX_PEAK_HEIGHT) {
          return false;
        }

        // 2. Validación de patrón local
        const isLocalMaximum = shortWindow.every(peak => value > peak.value * 0.95);
        if (!isLocalMaximum) return false;

        // 3. Validación de tendencia
        if (mediumWindow.length >= 3) {
          const recentAmplitudes = mediumWindow.map(p => p.value);
          const avgAmplitude = average(recentAmplitudes);
          const stdDev = standardDeviation(recentAmplitudes);
          
          if (Math.abs(value - avgAmplitude) > stdDev * 2) {
            return false;
          }
        }

        // 4. Validación de ritmo
        if (longWindow.length >= 4) {
          const intervals = getIntervals(longWindow.map(p => p.time));
          const avgInterval = average(intervals);
          const expectedInterval = avgInterval;
          
          const lastInterval = timestamp - longWindow[longWindow.length - 1].time;
          if (Math.abs(lastInterval - expectedInterval) / expectedInterval > 0.4) {
            return false;
          }
        }

        return true;
      }
    };
  };

  // Utilidades estadísticas
  const average = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
  const standardDeviation = (arr: number[]) => {
    const avg = average(arr);
    const squareDiffs = arr.map(value => Math.pow(value - avg, 2));
    return Math.sqrt(average(squareDiffs));
  };
  const getIntervals = (timestamps: number[]) => 
    timestamps.slice(1).map((t, i) => t - timestamps[i]);

  // Filtro de mediana para eliminar ruido impulsivo
  class MedianFilter {
    private buffer: number[] = [];
    private readonly size: number;
    private baseline: number = 0;

    constructor(size: number) {
      this.size = size;
    }

    process(value: number): number {
      this.buffer.push(value);
      if (this.buffer.length > this.size) {
        this.buffer.shift();
      }
      
      const sorted = [...this.buffer].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];
      
      // Actualizar línea base
      this.baseline = this.baseline * 0.95 + median * 0.05;
      
      return median;
    }

    getBaseline(): number {
      return this.baseline;
    }
  }

  const getQualityColor = useCallback((q: number) => {
    if (!isFingerDetected) return 'from-gray-400 to-gray-500';
    if (q > 75) return 'from-green-500 to-emerald-500';
    if (q > 50) return 'from-yellow-500 to-orange-500';
    return 'from-red-500 to-rose-500';
  }, [isFingerDetected]);

  const getQualityText = useCallback((q: number) => {
    if (!isFingerDetected) return 'Sin detección';
    if (q > 75) return 'Señal óptima';
    if (q > 50) return 'Señal aceptable';
    return 'Señal débil';
  }, [isFingerDetected]);

  const smoothValue = useCallback((currentValue: number, previousValue: number | null): number => {
    if (previousValue === null) return currentValue;
    return previousValue + 1.2 * (currentValue - previousValue);
  }, []);

  const drawGrid = useCallback((ctx: CanvasRenderingContext2D) => {
    const { width, height } = ctx.canvas;

    // Limpiar canvas
    ctx.fillStyle = DISPLAY_CONFIG.CANVAS.BACKGROUND;
    ctx.fillRect(0, 0, width, height);

    // Dibujar cuadrícula
    ctx.strokeStyle = DISPLAY_CONFIG.CANVAS.GRID.COLOR;
    ctx.lineWidth = 1;

    // Líneas verticales
    for (let x = 0; x < width; x += DISPLAY_CONFIG.CANVAS.GRID.SPACING) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }

    // Líneas horizontales
    for (let y = 0; y < height; y += DISPLAY_CONFIG.CANVAS.GRID.SPACING) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
  }, []);

  const renderSignal = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    
    if (!canvas || !ctx || !dataBufferRef.current) {
      animationFrameRef.current = requestAnimationFrame(renderSignal);
      return;
    }

    const now = Date.now();
    const timeSinceLastRender = now - lastRenderTimeRef.current;

    // Control de FPS
    if (timeSinceLastRender < DISPLAY_CONFIG.UPDATE_INTERVAL) {
      animationFrameRef.current = requestAnimationFrame(renderSignal);
      return;
    }

    // Actualizar línea base
    baselineRef.current = baselineRef.current * 0.95 + value * 0.05;

    // Procesar nuevo valor
    const normalizedValue = value - baselineRef.current;
    const smoothedValue = lastValueRef.current * 0.7 + normalizedValue * 0.3;
    lastValueRef.current = smoothedValue;

    // Detectar pico (simplificado)
    const isPeak = smoothedValue > 0.2 && smoothedValue > lastValueRef.current;

    // Crear punto de datos
    const dataPoint: PPGDataPoint = {
      time: now,
      value: smoothedValue * DISPLAY_CONFIG.VERTICAL_SCALE,
      isPeak,
      isArrhythmia: false
    };

    // Agregar al buffer
    dataBufferRef.current.push(dataPoint);

    // Dibujar
    drawGrid(ctx);
    
    // Dibujar señal
    const points = dataBufferRef.current.getPoints();
    if (points.length > 1) {
      ctx.beginPath();
      ctx.strokeStyle = DISPLAY_CONFIG.SIGNAL.COLOR;
      ctx.lineWidth = DISPLAY_CONFIG.SIGNAL.WIDTH;

      points.forEach((point, index) => {
        const x = canvas.width - ((now - point.time) * canvas.width / DISPLAY_CONFIG.TIME_WINDOW);
        const y = canvas.height / 2 - point.value;

        if (index === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });

      ctx.stroke();
    }

    lastRenderTimeRef.current = now;
    animationFrameRef.current = requestAnimationFrame(renderSignal);
  }, [value, drawGrid]);

  // Inicialización y limpieza
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Configurar canvas
    canvas.width = DISPLAY_CONFIG.CANVAS.WIDTH;
    canvas.height = DISPLAY_CONFIG.CANVAS.HEIGHT;

    // Iniciar renderizado
    renderSignal();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [renderSignal]);

  return (
    <div className="relative w-full h-full bg-black/90">
      <div className="absolute top-4 left-4 right-4 flex justify-between items-start z-10">
        <div className="bg-black/30 backdrop-blur-md rounded p-2">
          <div className="flex items-center gap-2">
            <Fingerprint 
              className={`w-6 h-6 ${isFingerDetected ? 'text-green-500' : 'text-red-500'}`}
            />
            <div className="text-sm text-white/90">
              {isFingerDetected ? 'Dedo detectado' : 'Coloque su dedo'}
            </div>
          </div>
        </div>

        {arrhythmiaStatus && (
          <div className="bg-black/30 backdrop-blur-md rounded p-2">
            <ArrhythmiaDisplay 
              status={arrhythmiaStatus} 
              data={rawArrhythmiaData}
            />
          </div>
        )}
      </div>

      <canvas
        ref={canvasRef}
        className="w-full h-[calc(40vh)] mt-20"
      />

      <div className="fixed bottom-0 left-0 right-0 h-[80px] grid grid-cols-2 gap-px bg-gray-100">
        <button 
          onClick={onStartMeasurement}
          className="bg-white text-slate-700 hover:bg-gray-50 active:bg-gray-100"
        >
          <span className="text-lg font-semibold">
            INICIAR/DETENER
          </span>
        </button>

        <button 
          onClick={onReset}
          className="bg-white text-slate-700 hover:bg-gray-50 active:bg-gray-100"
        >
          <span className="text-lg font-semibold">
            RESETEAR
          </span>
        </button>
      </div>
    </div>
  );
};

export default PPGSignalMeter;
