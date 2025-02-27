import React, { useEffect, useRef, useCallback } from 'react';
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
  heartRate?: number;
  spo2?: number;
}

const PPGSignalMeter = ({ 
  value, 
  quality, 
  isFingerDetected,
  onStartMeasurement,
  onReset,
  arrhythmiaStatus,
  rawArrhythmiaData,
  heartRate,
  spo2
}: PPGSignalMeterProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dataBufferRef = useRef<CircularBuffer | null>(null);
  const baselineRef = useRef<number | null>(null);
  const lastValueRef = useRef<number | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const lastRenderTimeRef = useRef<number>(0);
  const lastArrhythmiaTime = useRef<number>(0);
  const arrhythmiaCountRef = useRef<number>(0);
  
  const BUFFER_SIZE = Math.floor((5000 / (1000/144)) * 1.2); // ~5 segundos de datos a 144fps
  const TARGET_FPS = 144;
  const FRAME_TIME = 1000 / TARGET_FPS;
  const WINDOW_WIDTH_MS = 5000;
  const CANVAS_WIDTH = 1500;
  const CANVAS_HEIGHT = 400;
  const GRID_MAJOR = 100;
  const GRID_MINOR = 20;
  const PULSE_AMPLITUDE_SCALE = 40.0;
  const SMOOTHING_FACTOR = 0.65;

  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  
  useEffect(() => {
    if (!dataBufferRef.current) {
      dataBufferRef.current = new CircularBuffer(BUFFER_SIZE);
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
    return previousValue + SMOOTHING_FACTOR * (currentValue - previousValue);
  }, []);

  const drawGrid = useCallback((ctx: CanvasRenderingContext2D) => {
    const offscreen = new OffscreenCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
    const offCtx = offscreen.getContext('2d')!;

    const gradient = offCtx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
    gradient.addColorStop(0, '#0a0f1a');
    gradient.addColorStop(1, '#000810');
    offCtx.fillStyle = gradient;
    offCtx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    offCtx.beginPath();
    for (let x = 0; x <= CANVAS_WIDTH; x += GRID_MINOR) {
      const isMajor = x % GRID_MAJOR === 0;
      offCtx.moveTo(x, 0);
      offCtx.lineTo(x, CANVAS_HEIGHT);
      if (isMajor) {
        offCtx.fillStyle = 'rgba(76, 175, 80, 0.5)';
        offCtx.fillText(`${x/GRID_MAJOR}s`, x, CANVAS_HEIGHT - 5);
      }
    }
    offCtx.strokeStyle = 'rgba(76, 175, 80, 0.1)';
    offCtx.stroke();

    offCtx.beginPath();
    for (let x = 0; x <= CANVAS_WIDTH; x += GRID_MAJOR) {
      offCtx.moveTo(x, 0);
      offCtx.lineTo(x, CANVAS_HEIGHT);
    }
    offCtx.strokeStyle = 'rgba(76, 175, 80, 0.2)';
    offCtx.stroke();

    createImageBitmap(offscreen).then(bitmap => {
      ctx.drawImage(bitmap, 0, 0);
    });

    ctx.font = '12px monospace';
    ctx.fillStyle = 'rgba(76, 175, 80, 0.8)';
    ctx.textAlign = 'right';
    ctx.fillText(`HR: ${heartRate || '--'} BPM`, CANVAS_WIDTH - 10, 20);
    ctx.fillText(`SpO2: ${spo2 || '--'}%`, CANVAS_WIDTH - 10, 40);
    ctx.fillText(`Calidad: ${quality}%`, CANVAS_WIDTH - 10, 60);
    
    if (arrhythmiaStatus?.includes('ARRITMIA')) {
      ctx.fillStyle = '#ff4444';
      ctx.fillText('! ARRITMIA DETECTADA !', CANVAS_WIDTH - 10, 80);
    }
  }, [quality, heartRate, spo2, arrhythmiaStatus]);

  const renderSignal = useCallback(() => {
    if (!canvasRef.current || !dataBufferRef.current) return;

    const currentTime = performance.now();
    if (currentTime - lastRenderTimeRef.current < FRAME_TIME) {
      animationFrameRef.current = requestAnimationFrame(renderSignal);
      return;
    }

    const ctx = ctxRef.current;
    if (!ctx) return;

    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    drawGrid(ctx);

    const points = dataBufferRef.current.getPoints();
    if (points.length > 1) {
      const path = new Path2D();
      const now = Date.now();

      points.forEach((point, index) => {
        const x = CANVAS_WIDTH - ((now - point.time) * CANVAS_WIDTH / WINDOW_WIDTH_MS);
        const y = CANVAS_HEIGHT/2 - (point.value * PULSE_AMPLITUDE_SCALE);

        if (index === 0) {
          path.moveTo(x, y);
        } else {
          const prevPoint = points[index - 1];
          const prevX = CANVAS_WIDTH - ((now - prevPoint.time) * CANVAS_WIDTH / WINDOW_WIDTH_MS);
          const prevY = CANVAS_HEIGHT/2 - (prevPoint.value * PULSE_AMPLITUDE_SCALE);
          
          const cp1x = (prevX + x) / 2;
          path.bezierCurveTo(cp1x, prevY, cp1x, y, x, y);
        }
      });

      ctx.save();
      ctx.strokeStyle = isFingerDetected ? '#00ff00' : '#666666';
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.stroke(path);
      ctx.restore();
    }

    lastRenderTimeRef.current = currentTime;
    animationFrameRef.current = requestAnimationFrame(renderSignal);
  }, [value, quality, isFingerDetected, drawGrid]);

  useEffect(() => {
    if (!canvasRef.current) return;
    
    const ctx = canvasRef.current.getContext('2d', {
      alpha: false,
      desynchronized: true,
      willReadFrequently: false
    });
    
    if (!ctx) return;
    
    ctxRef.current = ctx;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    
    renderSignal();
    
    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [renderSignal]);

  return (
    <div className="fixed inset-0 bg-gradient-to-b from-white to-slate-100/40" translate="no">
      <div className="absolute top-0 left-0 right-0 p-2 flex justify-between items-center bg-white/60 backdrop-blur-sm border-b border-slate-100 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="text-xl font-bold text-slate-700">PPG</span>
          <div className="w-[200px]">
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

        <div className="flex flex-col items-center">
          <Fingerprint
            className={`h-16 w-16 transition-colors duration-300 ${
              !isFingerDetected ? 'text-gray-400' :
              quality > 75 ? 'text-green-500' :
              quality > 50 ? 'text-yellow-500' :
              'text-red-500'
            }`}
            strokeWidth={1.5}
          />
          <span className="text-[10px] text-center mt-0.5 font-medium text-slate-600">
            {isFingerDetected ? "Dedo detectado" : "Ubique su dedo"}
          </span>
        </div>
      </div>

      <canvas
        ref={canvasRef}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
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
