import React, { useEffect, useRef, useCallback, memo, useState } from 'react';
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

// Constantes optimizadas para rendimiento extremo
const WINDOW_WIDTH_MS = 3000; // Reducido de 3500ms
const CANVAS_WIDTH = 400; // Reducido significativamente
const CANVAS_HEIGHT = 400; // Reducido significativamente
const GRID_SIZE_X = 60; // Aumentado para reducir líneas
const GRID_SIZE_Y = 60; // Aumentado para reducir líneas
const VERTICAL_SCALE = 25.0; // Reducido para menos procesamiento
const SMOOTHING_FACTOR = 0.8; // Reducido para menos cálculos
const TARGET_FPS = 15; // Reducido drásticamente para ahorrar batería
const FRAME_TIME = 1000 / TARGET_FPS;
const BUFFER_SIZE = 60; // Reducido significativamente
const PEAK_INTERVAL_FACTOR = 30; // Mostrar muchos menos puntos destacados

// Detector de dispositivo de gama baja
const isLowEndDevice = () => {
  return true; // Forzar modo de bajo rendimiento para todos los dispositivos
};

// Caché global para evitar recreaciones
const qualityColorCache = new Map();
const qualityTextCache = new Map();

const PPGSignalMeter = memo(({ 
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
  const gridImageRef = useRef<ImageData | null>(null);
  const [isLowEnd] = useState(isLowEndDevice());
  
  // Usar caché para colores de calidad
  const getQualityColor = useCallback((q: number) => {
    const cacheKey = `${q}-${isFingerDetected ? 1 : 0}`;
    if (qualityColorCache.has(cacheKey)) {
      return qualityColorCache.get(cacheKey);
    }
    
    let result;
    if (!isFingerDetected) result = 'from-gray-400 to-gray-500';
    else if (q > 75) result = 'from-green-500 to-emerald-500';
    else if (q > 50) result = 'from-yellow-500 to-orange-500';
    else result = 'from-red-500 to-rose-500';
    
    qualityColorCache.set(cacheKey, result);
    return result;
  }, [isFingerDetected]);

  // Usar caché para textos de calidad
  const getQualityText = useCallback((q: number) => {
    const cacheKey = `${q}-${isFingerDetected ? 1 : 0}`;
    if (qualityTextCache.has(cacheKey)) {
      return qualityTextCache.get(cacheKey);
    }
    
    let result;
    if (!isFingerDetected) result = 'Sin detección';
    else if (q > 75) result = 'Señal óptima';
    else if (q > 50) result = 'Señal aceptable';
    else result = 'Señal débil';
    
    qualityTextCache.set(cacheKey, result);
    return result;
  }, [isFingerDetected]);

  const smoothValue = useCallback((currentValue: number, previousValue: number | null): number => {
    if (previousValue === null) return currentValue;
    return previousValue + SMOOTHING_FACTOR * (currentValue - previousValue);
  }, []);

  // Dibujar la cuadrícula una sola vez y guardarla como imagen
  const createGridImage = useCallback((ctx: CanvasRenderingContext2D) => {
    if (gridImageRef.current) return;
    
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    
    // Fondo gris claro sólido para mejor rendimiento
    ctx.fillStyle = '#E5E7EB'; // Gris claro
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Solo líneas de cuadrícula principales para mejor rendimiento
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(107, 114, 128, 0.3)'; // Gris medio con baja opacidad
    ctx.lineWidth = 1;

    // Reducir cantidad de líneas
    for (let x = 0; x <= CANVAS_WIDTH; x += GRID_SIZE_X * 2) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, CANVAS_HEIGHT);
    }

    for (let y = 0; y <= CANVAS_HEIGHT; y += GRID_SIZE_Y * 2) {
      ctx.moveTo(0, y);
      ctx.lineTo(CANVAS_WIDTH, y);
    }
    ctx.stroke();

    // Línea de base
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(107, 114, 128, 0.5)'; // Gris medio con media opacidad
    ctx.lineWidth = 1;
    ctx.moveTo(0, CANVAS_HEIGHT * 0.6);
    ctx.lineTo(CANVAS_WIDTH, CANVAS_HEIGHT * 0.6);
    ctx.stroke();
    
    // Guardar la imagen de la cuadrícula
    gridImageRef.current = ctx.getImageData(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  }, []);

  const drawGrid = useCallback((ctx: CanvasRenderingContext2D) => {
    if (gridImageRef.current) {
      ctx.putImageData(gridImageRef.current, 0, 0);
    } else {
      createGridImage(ctx);
      if (gridImageRef.current) {
        ctx.putImageData(gridImageRef.current, 0, 0);
      }
    }
  }, [createGridImage]);

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
      alpha: false, // Cambiar a false para mejor rendimiento
      desynchronized: true,
      willReadFrequently: true
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

    const normalizedValue = smoothedValue - (baselineRef.current || 0);
    const scaledValue = normalizedValue * VERTICAL_SCALE;
    
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

    // Dibujar fondo y cuadrícula
    drawGrid(ctx);

    const points = dataBufferRef.current.getPoints();
    if (points.length > 1) {
      const visiblePoints = points.filter(
        point => (now - point.time) <= WINDOW_WIDTH_MS
      );
      
      if (visiblePoints.length > 1) {
        // Dibujar la línea principal con menos puntos
        ctx.beginPath();
        ctx.strokeStyle = '#0EA5E9'; // Azul
        ctx.lineWidth = 2;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        
        let firstPoint = true;
        
        // Reducir puntos para mejor rendimiento
        const pointStep = 3; // Saltar más puntos
        
        for (let i = 0; i < visiblePoints.length; i += pointStep) {
          const point = visiblePoints[i];
          const x = canvas.width - ((now - point.time) * canvas.width / WINDOW_WIDTH_MS);
          const y = canvas.height * 0.6 - point.value;
          
          if (firstPoint) {
            ctx.moveTo(x, y);
            firstPoint = false;
          } else {
            ctx.lineTo(x, y);
          }
          
          // Simplificar manejo de arritmias
          if (point.isArrhythmia && i < visiblePoints.length - pointStep) {
            ctx.stroke();
            ctx.beginPath();
            ctx.strokeStyle = '#DC2626'; // Rojo
            ctx.moveTo(x, y);
            
            // Encontrar el siguiente punto disponible
            let nextIndex = i + pointStep;
            if (nextIndex >= visiblePoints.length) {
              nextIndex = visiblePoints.length - 1;
            }
            
            const nextPoint = visiblePoints[nextIndex];
            const nextX = canvas.width - ((now - nextPoint.time) * canvas.width / WINDOW_WIDTH_MS);
            const nextY = canvas.height * 0.6 - nextPoint.value;
            ctx.lineTo(nextX, nextY);
            ctx.stroke();
            
            ctx.beginPath();
            ctx.strokeStyle = '#0EA5E9'; // Volver a azul
            ctx.moveTo(nextX, nextY);
            firstPoint = false;
          }
        }
        
        ctx.stroke();
      }

      // Mostrar solo puntos críticos (máximo 2)
      const maxPeaks = 2;
      let peakCount = 0;
      
      // Buscar solo los puntos más significativos
      const significantPoints = visiblePoints
        .filter((point, i) => i > 0 && i < visiblePoints.length - 1 && 
                Math.abs(point.value) > VERTICAL_SCALE * 0.7)
        .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
        .slice(0, maxPeaks);
      
      for (const point of significantPoints) {
        const x = canvas.width - ((now - point.time) * canvas.width / WINDOW_WIDTH_MS);
        const y = canvas.height * 0.6 - point.value;
        
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fillStyle = point.isArrhythmia ? '#DC2626' : '#0EA5E9';
        ctx.fill();
        
        if (point.isArrhythmia) {
          ctx.beginPath();
          ctx.arc(x, y, 8, 0, Math.PI * 2);
          ctx.strokeStyle = '#FFFF00';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      }
    }

    lastRenderTimeRef.current = currentTime;
    animationFrameRef.current = requestAnimationFrame(renderSignal);
  }, [value, quality, isFingerDetected, rawArrhythmiaData, arrhythmiaStatus, drawGrid, smoothValue]);

  useEffect(() => {
    // Inicializar el buffer solo una vez
    if (!dataBufferRef.current) {
      dataBufferRef.current = new CircularBuffer(BUFFER_SIZE);
    }
    
    renderSignal();
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [renderSignal]);

  return (
    <>
      <div className="absolute top-0 right-1 z-30 flex items-center gap-2 bg-black/40 rounded-lg p-2 signal-quality-indicator hardware-accelerated"
           style={{ top: '5px', right: '5px' }}>
        <div className="w-[150px]">
          <div className={`h-1.5 w-full rounded-full bg-gradient-to-r ${getQualityColor(quality)} transition-all duration-1000 ease-in-out`}>
            <div
              className="h-full rounded-full bg-white/20 animate-pulse transition-all duration-1000"
              style={{ width: `${isFingerDetected ? quality : 0}%` }}
            />
          </div>
          <span className="text-[8px] text-center mt-0.5 font-medium transition-colors duration-700 block text-white text-optimized" 
                style={{ color: quality > 60 ? '#0EA5E9' : '#F59E0B' }}>
            {getQualityText(quality)}
          </span>
        </div>

        <div className="flex flex-col items-center">
          <Fingerprint
            className={`h-8 w-8 transition-colors duration-300 ${
              !isFingerDetected ? 'text-gray-400' :
              quality > 75 ? 'text-green-500' :
              quality > 50 ? 'text-yellow-500' :
              'text-red-500'
            }`}
            strokeWidth={1.5}
          />
          <span className="text-[7px] text-center mt-0.5 font-medium text-white text-optimized">
            {isFingerDetected ? "Dedo detectado" : "Ubique su dedo"}
          </span>
        </div>
      </div>

      <div className="absolute inset-0 w-full ppg-signal-container hardware-accelerated" style={{ height: '50vh', top: 0 }}>
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          className="w-full h-full"
          style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 }}
        />
      </div>
      
      <div className="absolute hardware-accelerated" style={{ top: 'calc(50vh + 5px)', left: 0, right: 0, textAlign: 'center', zIndex: 30 }}>
        <h1 className="text-xl font-bold">
          <span className="text-white">Chars</span>
          <span className="text-[#ea384c]">Healt</span>
        </h1>
      </div>
    </>
  );
});

PPGSignalMeter.displayName = 'PPGSignalMeter';

export default PPGSignalMeter;
