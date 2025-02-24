import React, { useEffect, useRef, useCallback, useMemo } from 'react';
import { Fingerprint } from 'lucide-react';
import { CircularBuffer, PPGDataPoint } from '../utils/CircularBuffer';
import { debounce } from '../utils/performance';

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

// Constantes optimizadas
const WINDOW_WIDTH_MS = 3000; // Reducido para mejor rendimiento
const CANVAS_WIDTH = 800; // Reducido para mejor rendimiento
const CANVAS_HEIGHT = 150;
const GRID_SIZE_X = 100;
const GRID_SIZE_Y = 50;
const VERTICAL_SCALE = 40.0;
const SMOOTHING_FACTOR = 0.3;
const TARGET_FPS = 20; // Reducido para mejor rendimiento
const FRAME_TIME = 1000 / TARGET_FPS;
const BUFFER_SIZE = 300; // Reducido para mejor rendimiento
const TYPED_ARRAY_SIZE = 1024; // Para TypedArray

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
  
  // TypedArrays para mejor rendimiento
  const valueBuffer = useRef(new Float32Array(TYPED_ARRAY_SIZE));
  const timeBuffer = useRef(new Float64Array(TYPED_ARRAY_SIZE));
  const bufferIndex = useRef(0);

  useEffect(() => {
    if (!dataBufferRef.current) {
      dataBufferRef.current = new CircularBuffer(BUFFER_SIZE);
    }

    // Limpiar buffers antiguos periódicamente
    const cleanupInterval = setInterval(() => {
      if (dataBufferRef.current) {
        const now = Date.now();
        dataBufferRef.current.cleanup(now - WINDOW_WIDTH_MS);
      }
    }, 5000);

    return () => {
      clearInterval(cleanupInterval);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  const getQualityColor = useMemo(() => (q: number) => {
    if (!isFingerDetected) return 'from-gray-400 to-gray-500';
    if (q > 75) return 'from-green-500 to-emerald-500';
    if (q > 50) return 'from-yellow-500 to-orange-500';
    return 'from-red-500 to-rose-500';
  }, [isFingerDetected]);

  const getQualityText = useMemo(() => (q: number) => {
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
    // Usar transform3d para aprovechar la GPU
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    
    const gradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
    gradient.addColorStop(0, '#f1f5f9');
    gradient.addColorStop(1, '#e2e8f0');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    ctx.beginPath();
    ctx.strokeStyle = 'rgba(51, 65, 85, 0.1)';
    ctx.lineWidth = 0.5;

    // Dibujar grilla con menos líneas
    for (let x = 0; x <= CANVAS_WIDTH; x += GRID_SIZE_X * 2) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, CANVAS_HEIGHT);
    }

    for (let y = 0; y <= CANVAS_HEIGHT; y += GRID_SIZE_Y * 2) {
      ctx.moveTo(0, y);
      ctx.lineTo(CANVAS_WIDTH, y);
    }
    ctx.stroke();

    // Línea central más visible
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(51, 65, 85, 0.3)';
    ctx.lineWidth = 1.5;
    ctx.moveTo(0, CANVAS_HEIGHT / 2);
    ctx.lineTo(CANVAS_WIDTH, CANVAS_HEIGHT / 2);
    ctx.stroke();
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
    const ctx = canvas.getContext('2d', { 
      alpha: false,
      desynchronized: true // Reducir latencia
    });
    
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
    const scaledValue = normalizedValue * VERTICAL_SCALE;
    
    // Actualizar TypedArrays
    valueBuffer.current[bufferIndex.current] = scaledValue;
    timeBuffer.current[bufferIndex.current] = now;
    bufferIndex.current = (bufferIndex.current + 1) % TYPED_ARRAY_SIZE;

    let isArrhythmia = false;
    if (rawArrhythmiaData && 
        arrhythmiaStatus?.includes("ARRITMIA") && 
        now - rawArrhythmiaData.timestamp < 1000) {
      isArrhythmia = true;
      lastArrhythmiaTime.current = now;
    }

    const dataPoint: PPGDataPoint = {
      time: now,
      value: scaledValue,
      isArrhythmia
    };
    
    dataBufferRef.current.push(dataPoint);

    // Dibujar con optimizaciones
    ctx.save();
    drawGrid(ctx);

    const points = dataBufferRef.current.getPoints();
    if (points.length > 1) {
      // Batch drawing para mejor rendimiento
      ctx.beginPath();
      ctx.strokeStyle = '#0EA5E9';
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';

      let firstPoint = true;
      points.forEach((point, i) => {
        const x = canvas.width - ((now - point.time) * canvas.width / WINDOW_WIDTH_MS);
        const y = canvas.height / 2 - point.value;

        if (firstPoint) {
          ctx.moveTo(x, y);
          firstPoint = false;
        } else {
          ctx.lineTo(x, y);
        }

        // Dibujar puntos de arritmia
        if (point.isArrhythmia) {
          ctx.stroke(); // Terminar la línea actual
          ctx.beginPath();
          ctx.fillStyle = '#DC2626';
          ctx.arc(x, y, 4, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath(); // Comenzar nueva línea
          ctx.moveTo(x, y);
        }
      });
      ctx.stroke();
    }
    ctx.restore();

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

  // Debounce para los handlers de botones
  const handleStartMeasurement = useMemo(() => 
    debounce(onStartMeasurement, 300), 
    [onStartMeasurement]
  );

  const handleReset = useMemo(() => 
    debounce(onReset, 300), 
    [onReset]
  );

  return (
    <div className="fixed inset-0 bg-gradient-to-b from-white to-slate-50/30">
      <div className="absolute top-0 left-0 right-0 p-2 flex justify-between items-center bg-white/60 backdrop-blur-[2px] border-b border-slate-100">
        <div className="flex items-center gap-3">
          <span className="text-xl font-bold text-slate-700">PPG</span>
          <div className="w-[200px]">
            <div 
              className={`h-1.5 w-full rounded-full bg-gradient-to-r ${getQualityColor(quality)} transform-gpu`}
              style={{ willChange: 'transform' }}
            >
              <div
                className="h-full rounded-full bg-white/20 transform-gpu transition-all duration-1000"
                style={{ 
                  width: `${isFingerDetected ? quality : 0}%`,
                  willChange: 'transform, opacity' 
                }}
              />
            </div>
            <span className="text-[9px] text-center mt-0.5 font-medium block" 
                  style={{ 
                    color: quality > 60 ? '#0EA5E9' : '#F59E0B',
                    willChange: 'transform' 
                  }}>
              {getQualityText(quality)}
            </span>
          </div>
        </div>

        <div className="flex flex-col items-center">
          <Fingerprint
            className={`h-12 w-12 transition-colors duration-300 transform-gpu ${
              !isFingerDetected ? 'text-gray-400' :
              quality > 75 ? 'text-green-500' :
              quality > 50 ? 'text-yellow-500' :
              'text-red-500'
            }`}
            strokeWidth={1.5}
            style={{ willChange: 'transform' }}
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
        className="w-full h-[calc(40vh)] mt-20 transform-gpu"
        style={{ 
          imageRendering: 'optimizespeed',
          willChange: 'transform',
          backfaceVisibility: 'hidden'
        }}
      />

      <div className="fixed bottom-0 left-0 right-0 h-[80px] grid grid-cols-2 gap-px bg-gray-100">
        <button 
          onClick={handleStartMeasurement}
          className="bg-white text-slate-700 hover:bg-gray-50 active:bg-gray-100 transform-gpu"
          style={{ willChange: 'transform' }}
        >
          <span className="text-lg font-semibold">
            INICIAR/DETENER
          </span>
        </button>

        <button 
          onClick={handleReset}
          className="bg-white text-slate-700 hover:bg-gray-50 active:bg-gray-100 transform-gpu"
          style={{ willChange: 'transform' }}
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
