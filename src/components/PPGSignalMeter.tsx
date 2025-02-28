
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
  
  const WINDOW_WIDTH_MS = 6000;
  const CANVAS_WIDTH = 1000;
  const CANVAS_HEIGHT = 200;
  const GRID_SIZE_X = 30;
  const GRID_SIZE_Y = 15;
  const verticalScale = 30.0;
  const SMOOTHING_FACTOR = 0.55;
  const TARGET_FPS = 90;
  const FRAME_TIME = 2000 / TARGET_FPS;
  const BUFFER_SIZE = 600;

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
    // Fondo negro
    ctx.fillStyle = '#222222';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Cuadrícula gris claro
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(200, 200, 201, 0.15)';
    ctx.lineWidth = 0.5;

    for (let x = 0; x <= CANVAS_WIDTH; x += GRID_SIZE_X) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, CANVAS_HEIGHT);
      if (x % (GRID_SIZE_X * 4) === 0) {
        ctx.fillStyle = '#FFFFFF';  // Números de referencia blancos
        ctx.font = '10px Inter';
        ctx.textAlign = 'center';
        ctx.fillText(`${x / 10}ms`, x, CANVAS_HEIGHT - 5);
      }
    }

    for (let y = 0; y <= CANVAS_HEIGHT; y += GRID_SIZE_Y) {
      ctx.moveTo(0, y);
      ctx.lineTo(CANVAS_WIDTH, y);
      if (y % (GRID_SIZE_Y * 4) === 0) {
        const amplitude = ((CANVAS_HEIGHT / 2) - y) / verticalScale;
        ctx.fillStyle = '#FFFFFF';  // Números de referencia blancos
        ctx.font = '10px Inter';
        ctx.textAlign = 'right';
        ctx.fillText(amplitude.toFixed(1), 25, y + 4);
      }
    }
    ctx.stroke();

    // Líneas principales más visibles
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(200, 200, 201, 0.25)';
    ctx.lineWidth = 1;

    for (let x = 0; x <= CANVAS_WIDTH; x += GRID_SIZE_X * 4) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, CANVAS_HEIGHT);
    }

    for (let y = 0; y <= CANVAS_HEIGHT; y += GRID_SIZE_Y * 4) {
      ctx.moveTo(0, y);
      ctx.lineTo(CANVAS_WIDTH, y);
    }
    ctx.stroke();

    // Línea central más visible
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(200, 200, 201, 0.35)';
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
    const scaledValue = normalizedValue * verticalScale;
    
    // Mejorar detección de arritmias en el gráfico
    let isArrhythmia = false;
    
    // Verificar si hay arritmia detectada en el estado
    if (arrhythmiaStatus && arrhythmiaStatus.includes("ARRITMIA")) {
      // Si tenemos datos crudos recientes de arritmia (últimos 1.5 segundos)
      if (rawArrhythmiaData && now - rawArrhythmiaData.timestamp < 1500) {
        isArrhythmia = true;
        lastArrhythmiaTime.current = now;
      } 
      // Si hubo una arritmia reciente (últimos 4 segundos)
      else if (now - lastArrhythmiaTime.current < 4000) {
        isArrhythmia = true;
      }
      // O si la cadena contiene "DETECTADA" recién (sin importar tiempo)
      else {
        isArrhythmia = true;
        lastArrhythmiaTime.current = now;
      }
    }

    const dataPoint: PPGDataPoint = {
      time: now,
      value: scaledValue,
      isArrhythmia
    };
    
    dataBufferRef.current.push(dataPoint);

    drawGrid(ctx);

    const points = dataBufferRef.current.getPoints();
    if (points.length > 1) {
      // Dibujar líneas de la señal
      for (let i = 1; i < points.length; i++) {
        const prevPoint = points[i - 1];
        const point = points[i];
        
        const x1 = canvas.width - ((now - prevPoint.time) * canvas.width / WINDOW_WIDTH_MS);
        const y1 = canvas.height / 2 - prevPoint.value;
        const x2 = canvas.width - ((now - point.time) * canvas.width / WINDOW_WIDTH_MS);
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

      // Dibujar puntos y etiquetas en los picos
      points.forEach((point, index) => {
        if (index > 0 && index < points.length - 1) {
          const x = canvas.width - ((now - point.time) * canvas.width / WINDOW_WIDTH_MS);
          const y = canvas.height / 2 - point.value;
          const prevPoint = points[index - 1];
          const nextPoint = points[index + 1];
          
          if (point.value > prevPoint.value && point.value > nextPoint.value) {
            ctx.beginPath();
            // Círculo más grande y visible para arritmias
            const radius = point.isArrhythmia ? 5 : 4;
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            ctx.fillStyle = point.isArrhythmia ? '#DC2626' : '#0EA5E9';
            ctx.fill();

            // Si es arritmia, dibujar un círculo exterior adicional
            if (point.isArrhythmia) {
              ctx.beginPath();
              ctx.arc(x, y, radius + 3, 0, Math.PI * 2);
              ctx.strokeStyle = '#FFFF00';
              ctx.lineWidth = 1.5;
              ctx.stroke();
            }

            ctx.font = 'bold 12px Inter';
            ctx.fillStyle = '#C8C8C9';  // Números de picos cardíacos en gris claro
            ctx.textAlign = 'center';
            ctx.fillText(Math.abs(point.value / verticalScale).toFixed(2), x, y - 20);
            
            // Etiqueta adicional para arritmias
            if (point.isArrhythmia) {
              ctx.font = 'bold 10px Inter';
              ctx.fillStyle = '#FF6B6B';
              ctx.fillText("ARR", x, y - 35);
            }
          }
        }
      });
    }

    lastRenderTimeRef.current = currentTime;
    animationFrameRef.current = requestAnimationFrame(renderSignal);
  }, [value, quality, isFingerDetected, rawArrhythmiaData, arrhythmiaStatus]);

  useEffect(() => {
    renderSignal();
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [renderSignal]);

  return (
    <>
      <div className="absolute top-0 left-0 right-0 p-2 flex justify-between items-center bg-white border-b border-slate-100 shadow-sm">
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

      <div className="flex-1 w-full relative">
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          className="w-full h-[calc(40vh)] mt-20 absolute top-0 left-0 right-0"
          style={{ zIndex: 10 }}
        />
      </div>
    </>
  );
};

export default PPGSignalMeter;
