
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
  const SMOOTHING_FACTOR = 0.65; // Aumentado para una transición más suave
  const TARGET_FPS = 120; // Aumentado para mayor fluidez
  const FRAME_TIME = 1000 / TARGET_FPS; // Ajustado para respetar el FPS objetivo
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
    // Fondo negro (sin cambios)
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Cuadrícula blanca (sin cambios)
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 0.5;

    for (let x = 0; x <= CANVAS_WIDTH; x += GRID_SIZE_X) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, CANVAS_HEIGHT);
      if (x % (GRID_SIZE_X * 4) === 0) {
        ctx.fillStyle = '#FFFFFF';
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
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '10px Inter';
        ctx.textAlign = 'right';
        ctx.fillText(amplitude.toFixed(1), 25, y + 4);
      }
    }
    ctx.stroke();

    // Líneas principales más visibles (sin cambios)
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
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

    // Línea central más visible (sin cambios)
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
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

    // Activar la optimización para gráficos suaves
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

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

    drawGrid(ctx);

    const points = dataBufferRef.current.getPoints();
    
    // Identificar los picos y latidos completos
    let beatSegments: {start: number, end: number, isArrhythmia: boolean}[] = [];
    let currentBeatStart = 0;
    let inBeat = false;
    let beatIsArrhythmia = false;
    
    // Identificar latidos completos basados en cruces por cero y picos
    for (let i = 1; i < points.length; i++) {
      const prev = points[i-1];
      const current = points[i];
      
      // Detección de inicio de latido (cruce por cero ascendente)
      if (prev.value <= 0 && current.value > 0 && !inBeat) {
        currentBeatStart = i - 1;
        inBeat = true;
        beatIsArrhythmia = false;
      }
      
      // Si este punto es una arritmia, marcar todo el latido actual
      if (current.isArrhythmia && inBeat) {
        beatIsArrhythmia = true;
      }
      
      // Detección de fin de latido (cruce por cero descendente después de un pico)
      if (prev.value > 0 && current.value <= 0 && inBeat) {
        beatSegments.push({
          start: currentBeatStart,
          end: i,
          isArrhythmia: beatIsArrhythmia
        });
        inBeat = false;
      }
    }

    // Si hay un latido en progreso al final, cerrarlo
    if (inBeat) {
      beatSegments.push({
        start: currentBeatStart,
        end: points.length - 1,
        isArrhythmia: beatIsArrhythmia
      });
    }
    
    // Dibujar cada segmento de latido con su color correspondiente
    if (points.length > 1) {
      for (const segment of beatSegments) {
        ctx.beginPath();
        ctx.lineWidth = 2;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.strokeStyle = segment.isArrhythmia ? '#DC2626' : '#0EA5E9';
        
        // Dibujar este segmento de latido
        for (let i = segment.start; i <= segment.end; i++) {
          const point = points[i];
          const x = canvas.width - ((now - point.time) * canvas.width / WINDOW_WIDTH_MS);
          const y = canvas.height / 2 - point.value;
          
          if (i === segment.start) {
            ctx.moveTo(x, y);
          } else {
            // Usar curvas de Bezier para suavizar la línea
            const prevPoint = points[i-1];
            const x1 = canvas.width - ((now - prevPoint.time) * canvas.width / WINDOW_WIDTH_MS);
            const y1 = canvas.height / 2 - prevPoint.value;
            const xc = (x1 + x) / 2;
            const yc = (y1 + y) / 2;
            ctx.quadraticCurveTo(x1, y1, xc, yc);
            
            if (i === segment.end) {
              ctx.lineTo(x, y);
            }
          }
        }
        ctx.stroke();
      }

      // Dibujar puntos de pico y etiquetas
      points.forEach((point, index) => {
        if (index > 0 && index < points.length - 1) {
          const x = canvas.width - ((now - point.time) * canvas.width / WINDOW_WIDTH_MS);
          const y = canvas.height / 2 - point.value;
          const prevPoint = points[index - 1];
          const nextPoint = points[index + 1];
          
          if (point.value > prevPoint.value && point.value > nextPoint.value) {
            // Dibujar círculo para los puntos de pico
            ctx.beginPath();
            ctx.arc(x, y, 4, 0, Math.PI * 2);
            ctx.fillStyle = point.isArrhythmia ? '#DC2626' : '#0EA5E9';
            ctx.fill();

            // Dibujar valor del pico
            ctx.font = 'bold 12px Inter';
            ctx.fillStyle = '#C0C0C0';
            ctx.textAlign = 'center';
            ctx.fillText(Math.abs(point.value / verticalScale).toFixed(2), x, y - 20);
            
            // Agregar círculo y etiqueta "ARR" solo para arritmias
            if (point.isArrhythmia) {
              // Círculo adicional para arritmias
              ctx.beginPath();
              ctx.arc(x, y, 8, 0, Math.PI * 2);
              ctx.strokeStyle = '#FFFF00';
              ctx.lineWidth = 1.5;
              ctx.stroke();
              
              // Etiqueta "ARR"
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
      <div className="absolute top-0 left-0 right-0 p-2 flex justify-between items-center" style={{ 
        width: "100%", 
        background: "linear-gradient(135deg, #33C3F0, #2563eb, #0EA5E9)",
        boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)"
      }}>
        <div className="flex items-center gap-3">
          <span className="text-xl font-bold text-white">PPG</span>
          <div className="w-[150px]">
            <div className={`h-1.5 w-full rounded-full bg-gradient-to-r ${getQualityColor(quality)} transition-all duration-1000 ease-in-out`}>
              <div
                className="h-full rounded-full bg-white/20 animate-pulse transition-all duration-1000"
                style={{ width: `${isFingerDetected ? quality : 0}%` }}
              />
            </div>
            <span className="text-[9px] text-center mt-0.5 font-medium transition-colors duration-700 block text-white" 
                  style={{ textShadow: "0px 1px 2px rgba(0, 0, 0, 0.2)" }}>
              {getQualityText(quality)}
            </span>
          </div>
        </div>

        <div className="flex flex-col items-center">
          <Fingerprint
            className={`h-14 w-14 transition-colors duration-300 ${
              !isFingerDetected ? 'text-gray-200' : 'text-green-500'
            }`}
            strokeWidth={1.5}
          />
          <span className="text-[10px] text-center mt-0.5 font-medium text-white">
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
