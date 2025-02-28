
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
  
  const WINDOW_WIDTH_MS = 3500;
  const CANVAS_WIDTH = 450;
  const CANVAS_HEIGHT = 450;
  const GRID_SIZE_X = 30;
  const GRID_SIZE_Y = 30;
  const verticalScale = 39.0;
  const SMOOTHING_FACTOR = 0.9; // Reducido para que reaccione más rápido
  const TARGET_FPS = 60; // Ajustado para un mejor rendimiento 
  const FRAME_TIME = 1000 / TARGET_FPS; // Optimizado para mejor FPS
  const BUFFER_SIZE = 200; // Reducido para menor uso de memoria

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

    // Cuadrícula verde - MODIFICADO: Cambiado de blanco a verde
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(0, 255, 127, 0.15)'; // Verde suave para la cuadrícula principal
    ctx.lineWidth = 0.5;

    for (let x = 0; x <= CANVAS_WIDTH; x += GRID_SIZE_X) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, CANVAS_HEIGHT);
      if (x % (GRID_SIZE_X * 4) === 0) {
        ctx.fillStyle = 'rgba(0, 255, 127, 0.9)';  // Verde más brillante para las etiquetas
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
        ctx.fillStyle = 'rgba(0, 255, 127, 0.9)';  // Verde más brillante para las etiquetas
        ctx.font = '10px Inter';
        ctx.textAlign = 'right';
        ctx.fillText(amplitude.toFixed(1), 25, y + 4);
      }
    }
    ctx.stroke();

    // Líneas principales más visibles - MODIFICADO: Cambiado a verde más intenso
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(0, 255, 127, 0.25)'; // Verde más intenso para líneas principales
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

    // Línea central más visible - BAJADA SUTILMENTE (de CANVAS_HEIGHT/2 a CANVAS_HEIGHT*0.6)
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(0, 255, 127, 0.35)'; // Verde más intenso para línea central
    ctx.lineWidth = 1.5;
    ctx.moveTo(0, CANVAS_HEIGHT * 0.6);
    ctx.lineTo(CANVAS_WIDTH, CANVAS_HEIGHT * 0.6);
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
    const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true }); // Optimización clave: rendering desincronizado
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

    // Invertir el signo del valor normalizado para que los picos vayan hacia arriba
    const normalizedValue = smoothedValue - (baselineRef.current || 0);
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
    if (points.length > 1) {
      // Dibujamos solo los puntos visibles para mejorar rendimiento
      const visiblePoints = points.filter(
        point => (now - point.time) <= WINDOW_WIDTH_MS
      );
      
      if (visiblePoints.length > 1) {
        // Optimización: Dibujamos todo el trazo de una vez
        ctx.beginPath();
        ctx.strokeStyle = '#0EA5E9';
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
          
          // Cambiamos color para puntos de arritmia
          if (point.isArrhythmia && i < visiblePoints.length - 1) {
            ctx.stroke();
            ctx.beginPath();
            ctx.strokeStyle = '#DC2626';
            ctx.moveTo(x, y);
            
            const nextPoint = visiblePoints[i + 1];
            const nextX = canvas.width - ((now - nextPoint.time) * canvas.width / WINDOW_WIDTH_MS);
            const nextY = canvas.height * 0.6 - nextPoint.value;
            ctx.lineTo(nextX, nextY);
            ctx.stroke();
            
            // Volvemos al color normal
            ctx.beginPath();
            ctx.strokeStyle = '#0EA5E9';
            ctx.moveTo(nextX, nextY);
            firstPoint = false;
          }
        }
        
        ctx.stroke();
      }

      // Dibujar puntos de pico (optimizado)
      for (let i = 1; i < visiblePoints.length - 1; i++) {
        const prevPoint = visiblePoints[i - 1];
        const point = visiblePoints[i];
        const nextPoint = visiblePoints[i + 1];
        
        // Optimizado: solo procesamos si es un pico
        if (point.value > prevPoint.value && point.value > nextPoint.value) {
          const x = canvas.width - ((now - point.time) * canvas.width / WINDOW_WIDTH_MS);
          const y = canvas.height * 0.6 - point.value;
          
          // Dibujar círculo para los puntos de pico
          ctx.beginPath();
          ctx.arc(x, y, 4, 0, Math.PI * 2);
          ctx.fillStyle = point.isArrhythmia ? '#DC2626' : '#0EA5E9';
          ctx.fill();

          // Dibujar valor del pico
          ctx.font = 'bold 12px Inter';
          ctx.fillStyle = '#C0C0C0'; // Gris claro para los números de picos
          ctx.textAlign = 'center';
          ctx.fillText(Math.abs(point.value / verticalScale).toFixed(2), x, y - 20);
          
          // Agregar círculo y etiqueta "ARR" para arritmias
          if (point.isArrhythmia) {
            // Círculo adicional para arritmias
            ctx.beginPath();
            ctx.arc(x, y, 8, 0, Math.PI * 2);
            ctx.strokeStyle = '#FFFF00'; // Círculo amarillo
            ctx.lineWidth = 1.5;
            ctx.stroke();
            
            // Etiqueta "ARR"
            ctx.font = 'bold 10px Inter';
            ctx.fillStyle = '#FF6B6B'; // Color rojo claro para ARR
            ctx.fillText("ARR", x, y - 35);
          }
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

  return (
    <>
      {/* Sensor de calidad subido un poco y huella desplazada más al margen derecho y reducida */}
      <div className="absolute top-0 right-1 z-20 flex items-center gap-2 bg-black/40 rounded-lg p-2">
        <div className="w-[190px]">
          <div className={`h-1.5 w-full rounded-full bg-gradient-to-r ${getQualityColor(quality)} transition-all duration-1000 ease-in-out`}>
            <div
              className="h-full rounded-full bg-white/20 animate-pulse transition-all duration-1000"
              style={{ width: `${isFingerDetected ? quality : 0}%` }}
            />
          </div>
          <span className="text-[9px] text-center mt-0.5 font-medium transition-colors duration-700 block text-white" 
                style={{ color: quality > 60 ? '#0EA5E9' : '#F59E0B' }}>
            {getQualityText(quality)}
          </span>
        </div>

        <div className="flex flex-col items-center">
          <Fingerprint
            className={`h-12 w-12 transition-colors duration-300 ${
              !isFingerDetected ? 'text-gray-400' :
              quality > 75 ? 'text-green-500' :
              quality > 50 ? 'text-yellow-500' :
              'text-red-500'
            }`}
            strokeWidth={1.5}
          />
          <span className="text-[9px] text-center mt-0.5 font-medium text-white">
            {isFingerDetected ? "Dedo detectado" : "Ubique su dedo"}
          </span>
        </div>
      </div>

      <div className="flex-1 w-full relative">
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          className="w-full h-[calc(50vh)] mt-0 absolute top-0 left-0 right-0"
          style={{ zIndex: 10 }}
        />
      </div>
      
      {/* Título "Chars Healt" colocado DEBAJO del gráfico, no dentro */}
      <div className="text-center mt-[50vh] mb-2 z-30 relative">
        <h1 className="text-lg font-bold">
          <span className="text-white">Chars</span>
          <span className="text-[#ea384c]">Healt</span>
        </h1>
      </div>
    </>
  );
};

export default PPGSignalMeter;
