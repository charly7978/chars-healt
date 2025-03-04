import React, { useEffect, useRef, useCallback, memo, useState } from 'react';
import { Fingerprint } from 'lucide-react';
import { CircularBuffer, PPGDataPoint } from '../utils/CircularBuffer';

// ESTA APPS ES DE MEDICION ULTRA REAL - PROHIBIDA CUALQUIER SIMULACION - NO ESTA PERMITIDO HACER MOVIMIENTOS POR CUENTA DE LA I.A SIN AUTORIZACION DEL USUARIO

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
  cholesterolData?: {
    totalCholesterol: number;
    hdl: number;
    ldl: number;
    triglycerides?: number;
  } | null;
  temperatureData?: {
    value: number;
    trend: 'rising' | 'falling' | 'stable';
    location: string;
  } | null;
}

const PPGSignalMeter: React.FC<PPGSignalMeterProps> = ({ 
  value, 
  quality, 
  isFingerDetected,
  onStartMeasurement,
  onReset,
  arrhythmiaStatus,
  rawArrhythmiaData,
  cholesterolData,
  temperatureData
}: PPGSignalMeterProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dataBufferRef = useRef<CircularBuffer | null>(null);
  const baselineRef = useRef<number | null>(null);
  const lastValueRef = useRef<number | null>(null);
  const animationFrameRef = useRef<number>(0);
  const lastRenderTimeRef = useRef<number>(0);
  const lastArrhythmiaTime = useRef<number>(0);
  const arrhythmiaCountRef = useRef<number>(0);
  
  const WINDOW_WIDTH_MS = 5000;
  const CANVAS_WIDTH = 1000;
  const CANVAS_HEIGHT = 300;
  const GRID_SIZE_X = 30;
  const GRID_SIZE_Y = 5;
  const verticalScale = 100.0;
  const SMOOTHING_FACTOR = 1.7;
  const TARGET_FPS = 180;
  const FRAME_TIME = 1500 / TARGET_FPS;
  const BUFFER_SIZE = 300;
  const INVERT_SIGNAL = false;

  const medicalGradeSettings = {
    timeScale: 25,
    amplitudeScale: 10,
    pixelsPerMm: 4,

    gridMajorInterval: 5,
    gridMinorInterval: 1,

    scaleFactorY: 3.2,
    scaleFactorX: 1.0,
    medianFilterSize: 3,

    lineWidth: 1.5,
    waveColor: {
      good: '#00C853',
      moderate: '#FFD600',
      poor: '#FF3D00'
    }
  };

  const previousPointsRef = useRef<Array<{x: number, y: number}>>([]);
  const targetFPS = 60;
  const msPerFrame = 1000 / targetFPS;
  
  const peaksRef = useRef<number[]>([]);

  const memoryOptimization = {
    maxSignalLength: 300,
    cullFactor: 0.8
  };

  const [startTime, setStartTime] = useState(Date.now());

  const GRID_COLOR = 'rgba(51, 65, 85, 0.1)';
  const SIGNAL_COLOR = '#0ea5e9';
  const CENTER_LINE_COLOR = 'rgba(51, 65, 85, 0.3)';

  useEffect(() => {
    if (!dataBufferRef.current) {
      dataBufferRef.current = new CircularBuffer(BUFFER_SIZE);
    }
  }, []);

  const getQualityColor = useCallback((q: number) => {
    if (!isFingerDetected) return 'from-gray-400 to-gray-500';
    if (q > 90) return 'from-emerald-500/80 to-emerald-400/80';
    if (q > 75) return 'from-sky-500/80 to-sky-400/80';
    if (q > 60) return 'from-indigo-500/80 to-indigo-400/80';
    if (q > 40) return 'from-amber-500/80 to-amber-400/80';
    return 'from-red-500/80 to-red-400/80';
  }, [isFingerDetected]);

  const getQualityText = useCallback((q: number) => {
    if (!isFingerDetected) return 'Sin detección';
    if (q > 90) return 'Excellent';
    if (q > 75) return 'Very Good';
    if (q > 60) return 'Good';
    if (q > 40) return 'Fair';
    return 'Poor';
  }, [isFingerDetected]);

  const smoothValue = useCallback((currentValue: number, previousValue: number | null): number => {
    if (previousValue === null) return currentValue;
    return previousValue + SMOOTHING_FACTOR * (currentValue - previousValue);
  }, []);

  const drawGrid = useCallback((ctx: CanvasRenderingContext2D) => {
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    
    // Fondo oscuro
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Cuadrícula menor
    ctx.beginPath();
    ctx.strokeStyle = GRID_COLOR;
    ctx.lineWidth = 0.5;

    for (let x = 0; x <= CANVAS_WIDTH; x += GRID_SIZE_X) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, CANVAS_HEIGHT);
    }

    for (let y = 0; y <= CANVAS_HEIGHT; y += GRID_SIZE_Y) {
      ctx.moveTo(0, y);
      ctx.lineTo(CANVAS_WIDTH, y);
    }
    ctx.stroke();

    // Cuadrícula mayor
    ctx.beginPath();
    ctx.strokeStyle = GRID_COLOR;
    ctx.lineWidth = 1;

    for (let x = 0; x <= CANVAS_WIDTH; x += GRID_SIZE_X * 4) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, CANVAS_HEIGHT);
      // Etiquetas de tiempo
      if (x % (GRID_SIZE_X * 4) === 0) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.font = '10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`${x / 50}ms`, x, CANVAS_HEIGHT - 5);
      }
    }

    for (let y = 0; y <= CANVAS_HEIGHT; y += GRID_SIZE_Y * 4) {
      ctx.moveTo(0, y);
      ctx.lineTo(CANVAS_WIDTH, y);
      // Etiquetas de amplitud
      if (y % (GRID_SIZE_Y * 4) === 0) {
        const amplitude = ((CANVAS_HEIGHT * 0.45) - y) / verticalScale;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.font = '10px monospace';
        ctx.textAlign = 'right';
        ctx.fillText(amplitude.toFixed(1), 20, y + 3);
      }
    }
    ctx.stroke();

    // Línea central (subida al 45% de la altura)
    ctx.beginPath();
    ctx.strokeStyle = CENTER_LINE_COLOR;
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    ctx.moveTo(0, CANVAS_HEIGHT * 0.45);
    ctx.lineTo(CANVAS_WIDTH, CANVAS_HEIGHT * 0.45);
    ctx.stroke();
    ctx.setLineDash([]);
  }, []);

  const renderSignal = useCallback(() => {
    if (!canvasRef.current || !dataBufferRef.current) {
      animationFrameRef.current = requestAnimationFrame(renderSignal);
      return;
    }

    const currentTime = performance.now();
    const timeSinceLastRender = currentTime - lastRenderTimeRef.current;

    if (timeSinceLastRender < FRAME_TIME) {
      animationFrameRef.current = requestAnimationFrame(renderSignal);
      return;
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { alpha: true, desynchronized: true });
    if (!ctx) {
      animationFrameRef.current = requestAnimationFrame(renderSignal);
      return;
    }

    const now = Date.now();
    
    if (baselineRef.current === null) {
      baselineRef.current = value;
    } else {
      baselineRef.current = baselineRef.current * 0.98 + value * 0.02;
    }

    const smoothedValue = smoothValue(value, lastValueRef.current);
    lastValueRef.current = smoothedValue;

    const normalizedValue = (smoothedValue - (baselineRef.current || 0)) * verticalScale;
    const isWaveStart = lastValueRef.current < 0 && normalizedValue >= 0;
    const scaledValue = normalizedValue;
    
    let isArrhythmia = false;
    if (rawArrhythmiaData && 
        arrhythmiaStatus?.includes("ARRITMIA") && 
        now - rawArrhythmiaData.timestamp < 1000) {
      isArrhythmia = true;
      lastArrhythmiaTime.current = now;
      
      arrhythmiaCountRef.current++;
    }

    const dataPoint: PPGDataPoint = {
      time: now,
      value: scaledValue,
      isWaveStart,
      isArrhythmia
    };
    
    dataBufferRef.current.push(dataPoint);

    drawGrid(ctx);

    const points = dataBufferRef.current.getPoints();
    if (points.length > 1) {
      const visiblePoints = points.filter(
        point => (now - point.time) <= WINDOW_WIDTH_MS
      );
      
      if (visiblePoints.length > 1) {
        ctx.beginPath();
        ctx.strokeStyle = SIGNAL_COLOR;
        ctx.lineWidth = 2;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        
        let firstPoint = true;
        
        for (let i = 0; i < visiblePoints.length; i++) {
          const point = visiblePoints[i];
          const x = canvas.width - ((now - point.time) * canvas.width / WINDOW_WIDTH_MS);
          const y = canvas.height * 0.6 - point.value;
          
          if (firstPoint) {
            ctx.moveTo(x, y);
            firstPoint = false;
          } else {
            ctx.lineTo(x, y);
          }
          
          if (point.isArrhythmia && i < visiblePoints.length - 1) {
            ctx.stroke();
            ctx.beginPath();
            ctx.strokeStyle = '#DC2626';
            ctx.lineWidth = 3;
            ctx.setLineDash([3, 2]);
            ctx.moveTo(x, y);
            
            const nextPoint = visiblePoints[i + 1];
            const nextX = canvas.width - ((now - nextPoint.time) * canvas.width / WINDOW_WIDTH_MS);
            const nextY = canvas.height * 0.6 - nextPoint.value;
            ctx.lineTo(nextX, nextY);
            ctx.stroke();
            
            ctx.beginPath();
            ctx.strokeStyle = SIGNAL_COLOR;
            ctx.lineWidth = 2;
            ctx.setLineDash([]);
            ctx.moveTo(nextX, nextY);
            firstPoint = false;
          }
        }
        
        ctx.stroke();
      }

      const maxPeakIndices: number[] = [];
      
      for (let i = 2; i < visiblePoints.length - 2; i++) {
        const point = visiblePoints[i];
        const prevPoint1 = visiblePoints[i - 1];
        const prevPoint2 = visiblePoints[i - 2];
        const nextPoint1 = visiblePoints[i + 1];
        const nextPoint2 = visiblePoints[i + 2];
        
        if (point.value > prevPoint1.value && 
            point.value > prevPoint2.value && 
            point.value > nextPoint1.value && 
            point.value > nextPoint2.value) {
          
          const peakAmplitude = point.value;
          
          if (peakAmplitude > 7.0) {
            const peakTime = point.time;
            const hasPeakNearby = maxPeakIndices.some(idx => {
              const existingPeakTime = visiblePoints[idx].time;
              return Math.abs(existingPeakTime - peakTime) < 250;
            });
            
            if (!hasPeakNearby) {
              maxPeakIndices.push(i);
            }
          }
        }
      }
      
      for (let idx of maxPeakIndices) {
        const point = visiblePoints[idx];
        const x = canvas.width - ((now - point.time) * canvas.width / WINDOW_WIDTH_MS);
        const y = canvas.height * 0.6 - point.value;
        
        ctx.beginPath();
        ctx.arc(x, y, point.isArrhythmia ? 5 : 4, 0, Math.PI * 2);
        ctx.fillStyle = point.isArrhythmia ? '#DC2626' : SIGNAL_COLOR;
        ctx.fill();

        ctx.font = 'bold 12px Inter';
        ctx.fillStyle = '#666666';
        ctx.textAlign = 'center';
        ctx.fillText(Math.abs(point.value / verticalScale).toFixed(2), x, y - 20);
        
        if (point.isArrhythmia) {
          ctx.beginPath();
          ctx.arc(x, y, 9, 0, Math.PI * 2);
          ctx.strokeStyle = '#FFFF00';
          ctx.lineWidth = 2;
          ctx.stroke();
          
          ctx.beginPath();
          ctx.arc(x, y, 14, 0, Math.PI * 2);
          ctx.strokeStyle = '#FF6B6B';
          ctx.lineWidth = 1;
          ctx.setLineDash([2, 2]);
          ctx.stroke();
          ctx.setLineDash([]);
          
          ctx.font = 'bold 10px Inter';
          ctx.fillStyle = '#FF6B6B';
          ctx.fillText("LATIDO PREMATURO", x, y - 35);
          
          ctx.beginPath();
          ctx.setLineDash([2, 2]);
          ctx.strokeStyle = 'rgba(255, 107, 107, 0.6)';
          ctx.lineWidth = 1;
          
          if (idx > 0) {
            const prevX = canvas.width - ((now - visiblePoints[idx-1].time) * canvas.width / WINDOW_WIDTH_MS);
            const prevY = canvas.height * 0.6 - visiblePoints[idx-1].value;
            
            ctx.moveTo(prevX, prevY - 15);
            ctx.lineTo(x, y - 15);
            ctx.stroke();
          }
          
          if (idx < visiblePoints.length - 1) {
            const nextX = canvas.width - ((now - visiblePoints[idx+1].time) * canvas.width / WINDOW_WIDTH_MS);
            const nextY = canvas.height * 0.6 - visiblePoints[idx+1].value;
            
            ctx.moveTo(x, y - 15);
            ctx.lineTo(nextX, nextY - 15);
            ctx.stroke();
          }
          
          ctx.setLineDash([]);
        }
      }
    }

    lastRenderTimeRef.current = currentTime;
    animationFrameRef.current = requestAnimationFrame(renderSignal);
  }, [value, quality, isFingerDetected, rawArrhythmiaData, arrhythmiaStatus, drawGrid, smoothValue]);

  useEffect(() => {
    renderSignal();
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [renderSignal]);

  const handleReset = useCallback(() => {
    dataBufferRef.current = new CircularBuffer(BUFFER_SIZE);
    baselineRef.current = null;
    lastValueRef.current = 0;
    setStartTime(Date.now());
    onReset();
  }, [onReset]);

  return (
    <div className="fixed inset-0 bg-black">
      <div className="absolute top-0 left-0 right-0 p-2 flex justify-between items-center bg-black/60 backdrop-blur-sm border-b border-gray-800">
        <div className="flex items-center gap-3 flex-1">
          <span className="text-xl font-bold text-white">PPG Monitor</span>
          <div className="flex flex-col flex-1">
            <div className={`h-1.5 w-[80%] mx-auto rounded-full bg-gradient-to-r ${getQualityColor(quality)} transition-all duration-1000 ease-in-out`}>
              <div
                className="h-full rounded-full bg-white/20 animate-pulse transition-all duration-1000"
                style={{ width: `${quality}%` }}
              />
            </div>
            <span className="text-[9px] text-center mt-0.5 font-medium transition-colors duration-700" 
                  style={{ color: quality > 60 ? '#0EA5E9' : '#F59E0B' }}>
              {getQualityText(quality)}
            </span>
          </div>
          
          <div className="flex flex-col items-center">
            <Fingerprint 
              size={56}
              className={`transition-all duration-700 ${
                isFingerDetected 
                  ? 'text-emerald-500 scale-100 drop-shadow-md'
                  : 'text-gray-600 scale-95'
              }`}
            />
            <span className="text-xs font-medium text-gray-400 transition-all duration-700">
              {isFingerDetected ? 'Dedo detectado' : 'Ubique su dedo en el lente'}
            </span>
          </div>
        </div>
      </div>

      <canvas
        ref={canvasRef}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        className="w-full h-[calc(50vh)] mt-20"
      />

      <div className="fixed bottom-0 left-0 right-0 h-[60px] grid grid-cols-2 gap-px bg-black/60 backdrop-blur-sm border-t border-gray-800">
        <button 
          onClick={onStartMeasurement}
          className="w-full h-full bg-blue-500/10 hover:bg-blue-500/20 text-xl font-bold text-white transition-all duration-300"
        >
          INICIAR
        </button>
        <button 
          onClick={handleReset}
          className="w-full h-full bg-blue-500/10 hover:bg-blue-500/20 text-xl font-bold text-white transition-all duration-300"
        >
          RESET
        </button>
      </div>
    </div>
  );
};

// ESTA APPS ES DE MEDICION ULTRA REAL - PROHIBIDA CUALQUIER SIMULACION - NO ESTA PERMITIDO HACER MOVIMIENTOS POR CUENTA DE LA I.A SIN AUTORIZACION DEL USUARIO

export default memo(PPGSignalMeter);
