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
  const dataBufferRef = useRef<CircularBuffer | null>(null);
  const baselineRef = useRef<number | null>(null);
  const lastValueRef = useRef<number | null>(null);
  const animationFrameRef = useRef<number>();
  const lastRenderTimeRef = useRef<number>(0);
  const lastArrhythmiaTime = useRef<number>(0);
  const arrhythmiaCountRef = useRef<number>(0);
  
  const DISPLAY_CONFIG = {
    CANVAS: {
      WIDTH: 1000,
      HEIGHT: 200,
      GRID: {
        MAJOR: { COLOR: 'rgba(255, 255, 255, 0.2)', SPACING: 50 },
        MINOR: { COLOR: 'rgba(255, 255, 255, 0.1)', SPACING: 25 }
      }
    },
    SIGNAL: {
      COLOR: '#00ff00',
      PEAK_COLOR: '#ff0000',
      LINE_WIDTH: 2,
      PEAK_RADIUS: 3
    },
    TIME_WINDOW: 3000,
    VERTICAL_SCALE: 22.0,
    UPDATE_INTERVAL: 1000 / 30
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

  useEffect(() => {
    if (!dataBufferRef.current) {
      dataBufferRef.current = new CircularBuffer(600);
    }
  }, []);

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

  const drawGrid = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    ctx.strokeStyle = DISPLAY_CONFIG.CANVAS.GRID.MAJOR.COLOR;
    ctx.lineWidth = 1;
    
    for (let x = 0; x < width; x += DISPLAY_CONFIG.CANVAS.GRID.MAJOR.SPACING) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    
    for (let y = 0; y < height; y += DISPLAY_CONFIG.CANVAS.GRID.MAJOR.SPACING) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    ctx.strokeStyle = DISPLAY_CONFIG.CANVAS.GRID.MINOR.COLOR;
    
    for (let x = 0; x < width; x += DISPLAY_CONFIG.CANVAS.GRID.MINOR.SPACING) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    
    for (let y = 0; y < height; y += DISPLAY_CONFIG.CANVAS.GRID.MINOR.SPACING) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
  };

  const drawSignal = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx || !dataBufferRef.current) return;

    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    drawGrid(ctx, canvas.width, canvas.height);

    const points = dataBufferRef.current.getPoints();
    if (points.length < 2) return;

    ctx.beginPath();
    ctx.strokeStyle = DISPLAY_CONFIG.SIGNAL.COLOR;
    ctx.lineWidth = DISPLAY_CONFIG.SIGNAL.LINE_WIDTH;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    points.forEach((point, index) => {
      const x = (canvas.width * point.time) / DISPLAY_CONFIG.TIME_WINDOW;
      const y = canvas.height / 2 + point.value * DISPLAY_CONFIG.VERTICAL_SCALE;
      
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }

      if (point.isPeak) {
        ctx.fillStyle = DISPLAY_CONFIG.SIGNAL.PEAK_COLOR;
        ctx.beginPath();
        ctx.arc(x, y, DISPLAY_CONFIG.SIGNAL.PEAK_RADIUS, 0, 2 * Math.PI);
        ctx.fill();
      }
    });
    ctx.stroke();

    drawTechnicalInfo(ctx);
  }, []);

  const drawTechnicalInfo = (ctx: CanvasRenderingContext2D) => {
    ctx.font = '12px monospace';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    
    const info = [
      `Calidad: ${quality}%`,
      `SNR: ${technicalInfo.signalToNoise.toFixed(1)}`,
      `Amplitud: ${technicalInfo.avgAmplitude.toFixed(1)}`,
      `Picos: ${technicalInfo.peakCount}`,
      `Último pico: ${Date.now() - technicalInfo.lastPeakTime}ms`
    ];

    info.forEach((text, i) => {
      ctx.fillText(text, 10, 20 + i * 15);
    });
  };

  useEffect(() => {
    if (!dataBufferRef.current) return;
    
    const points = dataBufferRef.current.getPoints();
    const peaks = points.filter(p => p.isPeak);
    
    setTechnicalInfo({
      peakCount: peaks.length,
      avgAmplitude: calculateAvgAmplitude(points),
      signalToNoise: calculateSNR(points),
      lastPeakTime: peaks.length > 0 ? peaks[peaks.length - 1].time : 0
    });
  }, [value]);

  // Inicialización del sistema de audio
  useEffect(() => {
    const initAudio = async () => {
      try {
        audioContextRef.current = new AudioContext();
        gainNodeRef.current = audioContextRef.current.createGain();
        gainNodeRef.current.connect(audioContextRef.current.destination);
        gainNodeRef.current.gain.value = 0;

        // Preparar oscilador
        oscillatorRef.current = audioContextRef.current.createOscillator();
        oscillatorRef.current.type = 'sine';
        oscillatorRef.current.frequency.value = PPG_CONFIG.BEEP.FREQUENCY;
        oscillatorRef.current.connect(gainNodeRef.current);
        oscillatorRef.current.start();

        await audioContextRef.current.resume();
      } catch (error) {
        console.error('Error inicializando sistema de audio:', error);
      }
    };

    initAudio();
    return () => {
      oscillatorRef.current?.stop();
      audioContextRef.current?.close();
    };
  }, []);

  // Nuevo: Sistema de beep cardíaco optimizado
  const playHeartbeatBeep = useCallback((peakStrength: number) => {
    if (!gainNodeRef.current || !audioContextRef.current) return;

    const now = audioContextRef.current.currentTime;
    const gain = gainNodeRef.current.gain;

    // Normalizar la fuerza del pico para el volumen
    const volume = Math.min(
      PPG_CONFIG.BEEP.VOLUME * (peakStrength / PPG_CONFIG.SIGNAL.MIN_AMPLITUDE),
      PPG_CONFIG.BEEP.VOLUME
    );

    // ADSR envelope para un sonido más natural
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(0, now);
    gain.linearRampToValueAtTime(volume, now + PPG_CONFIG.BEEP.ATTACK);
    gain.linearRampToValueAtTime(0, now + PPG_CONFIG.BEEP.DURATION/1000);
  }, []);

  // Nuevo sistema de detección de picos mejorado
  const peakDetector = createPeakDetector();

  const renderSignal = useCallback(() => {
    if (!canvasRef.current || !dataBufferRef.current) {
      animationFrameRef.current = requestAnimationFrame(renderSignal);
      return;
    }

    const currentTime = performance.now();
    const timeSinceLastRender = currentTime - lastRenderTimeRef.current;

    if (timeSinceLastRender < DISPLAY_CONFIG.UPDATE_INTERVAL) {
      animationFrameRef.current = requestAnimationFrame(renderSignal);
      return;
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) {
      animationFrameRef.current = requestAnimationFrame(renderSignal);
      return;
    }

    const now = Date.now();
    
    if (baselineRef.current === null) {
      baselineRef.current = value;
    } else {
      baselineRef.current = baselineRef.current * 0.95 + value * 0.05;
    }

    const smoothedValue = smoothValue(value, lastValueRef.current);
    lastValueRef.current = smoothedValue;

    const normalizedValue = (baselineRef.current || 0) - smoothedValue;
    const isPeak = peakDetector.detectPeak(normalizedValue, now);

    const dataPoint: PPGDataPoint = {
      time: now,
      value: normalizedValue * DISPLAY_CONFIG.VERTICAL_SCALE,
      isPeak,
      isArrhythmia: false // Se actualiza después si es necesario
    };
    
    dataBufferRef.current.push(dataPoint);

    drawGrid(ctx, canvas.width, canvas.height);

    const points = dataBufferRef.current.getPoints();
    if (points.length > 1) {
      for (let i = 1; i < points.length; i++) {
        const prevPoint = points[i - 1];
        const point = points[i];
        
        const x1 = canvas.width - ((now - prevPoint.time) * canvas.width / DISPLAY_CONFIG.TIME_WINDOW);
        const y1 = canvas.height / 2 - prevPoint.value;
        const x2 = canvas.width - ((now - point.time) * canvas.width / DISPLAY_CONFIG.TIME_WINDOW);
        const y2 = canvas.height / 2 - point.value;

        ctx.beginPath();
        ctx.strokeStyle = point.isArrhythmia ? '#DC2626' : '#0EA5E9';
        ctx.lineWidth = 2;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }

      points.forEach((point, index) => {
        if (index > 0 && index < points.length - 1) {
          const x = canvas.width - ((now - point.time) * canvas.width / DISPLAY_CONFIG.TIME_WINDOW);
          const y = canvas.height / 2 - point.value;
          const prevPoint = points[index - 1];
          const nextPoint = points[index + 1];
          
          if (point.value > prevPoint.value && point.value > nextPoint.value) {
            ctx.beginPath();
            ctx.arc(x, y, 4, 0, Math.PI * 2);
            ctx.fillStyle = point.isArrhythmia ? '#DC2626' : '#0EA5E9';
            ctx.fill();

            ctx.font = 'bold 12px Inter';
            ctx.fillStyle = '#000000';
            ctx.textAlign = 'center';
            ctx.fillText(Math.abs(point.value / DISPLAY_CONFIG.VERTICAL_SCALE).toFixed(2), x, y - 20);
          }
        }
      });
    }

    lastRenderTimeRef.current = currentTime;
    animationFrameRef.current = requestAnimationFrame(renderSignal);
  }, [value, peakDetector]);

  useEffect(() => {
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
            <div className={`w-[200px]`}>
              <div className={`h-1.5 w-full rounded-full bg-gradient-to-r ${getQualityColor(quality)} transition-all duration-1000 ease-in-out`}>
                <div
                  className="h-full rounded-full bg-white/20 animate-pulse transition-all duration-1000"
                  style={{ width: `${isFingerDetected ? quality : 0}%` }}
                />
              </div>
              <span className="text-[9px] text-center mt-0.5 font-medium transition-colors duration-700 block" 
                    style={{ color: quality > 60 ? '#0EA5E9' : '#F59E0B' }}>
                {getQualityText(quality)}
              </span>
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
        width={DISPLAY_CONFIG.CANVAS.WIDTH}
        height={DISPLAY_CONFIG.CANVAS.HEIGHT}
        className="w-full h-[calc(40vh)] mt-20"
      />

      <div className="fixed bottom-0 left-0 right-0 h-[80px] grid grid-cols-2 gap-px bg-gray-100">
        <button 
          onClick={onStartMeasurement}
          className="bg-white text-slate-700 hover:bg-gray-50 active:bg-gray-100 transition-colors duration-200"
        >
          <span className="text-lg font-semibold">
            INICIAR/DETENER
          </span>
        </button>

        <button 
          onClick={onReset}
          className="bg-white text-slate-700 hover:bg-gray-50 active:bg-gray-100 transition-colors duration-200"
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
