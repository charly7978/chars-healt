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
  
  const WINDOW_WIDTH_MS = 4000;
  const CANVAS_WIDTH = 450;
  const CANVAS_HEIGHT = 450;
  const GRID_SIZE_X = 10;
  const GRID_SIZE_Y = 10;
  const verticalScale = 25.0;
  const SMOOTHING_FACTOR = 0.7;
  const TARGET_FPS = 60;
  const FRAME_TIME = 1000 / TARGET_FPS;
  const BUFFER_SIZE = 200;

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
    // Limpiar el canvas
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    
    // Fondo del gráfico
    ctx.fillStyle = '#f3f3f3';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Dibujar líneas de cuadrícula
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(0, 180, 120, 0.15)';
    ctx.lineWidth = 0.5;

    // Cuadrícula vertical
    for (let x = 0; x <= CANVAS_WIDTH; x += GRID_SIZE_X) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, CANVAS_HEIGHT);
      if (x % (GRID_SIZE_X * 4) === 0) {
        ctx.fillStyle = 'rgba(0, 150, 100, 0.9)';
        ctx.font = '10px Inter';
        ctx.textAlign = 'center';
        ctx.fillText(`${x / 10}ms`, x, CANVAS_HEIGHT - 5);
      }
    }

    // Cuadrícula horizontal
    for (let y = 0; y <= CANVAS_HEIGHT; y += GRID_SIZE_Y) {
      ctx.moveTo(0, y);
      ctx.lineTo(CANVAS_WIDTH, y);
      if (y % (GRID_SIZE_Y * 4) === 0) {
        const amplitude = ((CANVAS_HEIGHT / 2) - y) / verticalScale;
        ctx.fillStyle = 'rgba(0, 150, 100, 0.9)';
        ctx.font = '10px Inter';
        ctx.textAlign = 'right';
        ctx.fillText(amplitude.toFixed(1), 25, y + 4);
      }
    }
    ctx.stroke();

    // Líneas principales de la cuadrícula
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(0, 150, 100, 0.25)';
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

    // Línea base horizontal
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(0, 150, 100, 0.35)';
    ctx.lineWidth = 1.5;
    ctx.moveTo(0, CANVAS_HEIGHT * 0.35);
    ctx.lineTo(CANVAS_WIDTH, CANVAS_HEIGHT * 0.35);
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
    const ctx = canvas.getContext('2d', { alpha: true, desynchronized: true });
    if (!ctx) {
      animationFrameRef.current = requestAnimationFrame(renderSignal);
      return;
    }

    const now = Date.now();
    
    // OPTIMIZADO: Mejor manejo de la línea base para visualizar picos hacia arriba
    // Actualización del valor base para alinear la señal
    if (baselineRef.current === null) {
      baselineRef.current = value;
    } else {
      // Factor más agresivo para seguir cambios en la línea base
      baselineRef.current = baselineRef.current * 0.90 + value * 0.10;
    }

    // Suavizado de la señal
    const smoothedValue = smoothValue(value, lastValueRef.current);
    lastValueRef.current = smoothedValue;

    // Normalización de valores - asegurando que los picos vayan hacia arriba
    const normalizedValue = (smoothedValue - (baselineRef.current || 0));
    
    // INVERSIÓN DE SEÑAL: Asegurar que los picos siempre se visualicen hacia arriba
    // Si la señal está invertida (picos hacia abajo), la invertimos multiplicando por -1
    // y luego la escalamos para mejor visualización
    const scaledValue = normalizedValue > 0 
      ? normalizedValue * verticalScale * 2.0 
      : -normalizedValue * verticalScale * 2.0;
    
    // Verificar si el punto actual corresponde a una arritmia
    const isArrhythmia = !!(rawArrhythmiaData && 
      arrhythmiaStatus?.includes("ARRITMIA") && 
      now - rawArrhythmiaData.timestamp < 1000);
    
    // Registrar arritmia si se detecta
    if (isArrhythmia) {
      lastArrhythmiaTime.current = now;
      arrhythmiaCountRef.current++;
    }

    // Añadir el punto al buffer circular
    const dataPoint: PPGDataPoint = {
      time: now,
      value: scaledValue,
      isArrhythmia
    };
    
    dataBufferRef.current.push(dataPoint);

    // Dibujar cuadrícula de fondo
    drawGrid(ctx);

    // Obtener puntos visibles en la ventana de tiempo actual
    const points = dataBufferRef.current.getPoints();
    if (points.length > 1) {
      const visiblePoints = points.filter(
        point => (now - point.time) <= WINDOW_WIDTH_MS
      );
      
      if (visiblePoints.length > 1) {
        // Dibujar la línea de la señal
        ctx.beginPath();
        ctx.strokeStyle = '#0EA5E9';
        ctx.lineWidth = 2;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        
        let firstPoint = true;
        
        for (let i = 0; i < visiblePoints.length; i++) {
          const point = visiblePoints[i];
          const x = canvas.width - ((now - point.time) * canvas.width / WINDOW_WIDTH_MS);
          const y = (canvas.height * 0.35) + point.value;
          
          if (firstPoint) {
            ctx.moveTo(x, y);
            firstPoint = false;
          } else {
            ctx.lineTo(x, y);
          }
          
          // Destacar segmentos con arritmias
          if (point.isArrhythmia && i < visiblePoints.length - 1) {
            ctx.stroke();
            ctx.beginPath();
            ctx.strokeStyle = '#DC2626';
            ctx.lineWidth = 3;
            ctx.setLineDash([3, 2]);
            ctx.moveTo(x, y);
            
            const nextPoint = visiblePoints[i + 1];
            const nextX = canvas.width - ((now - nextPoint.time) * canvas.width / WINDOW_WIDTH_MS);
            const nextY = canvas.height * 0.4 + nextPoint.value;
            ctx.lineTo(nextX, nextY);
            ctx.stroke();
            
            ctx.beginPath();
            ctx.strokeStyle = '#0EA5E9';
            ctx.lineWidth = 2;
            ctx.setLineDash([]);
            ctx.moveTo(nextX, nextY);
            firstPoint = false;
          }
        }
        
        ctx.stroke();
      }

      // Detectar y marcar los picos
      for (let i = 1; i < visiblePoints.length - 1; i++) {
        const prevPoint = visiblePoints[i - 1];
        const point = visiblePoints[i];
        const nextPoint = visiblePoints[i + 1];
        
        // DETECTOR OPTIMIZADO: Detector de picos mejorado
        // Asegura la correcta detección de picos hacia arriba
        // Busca picos que son puntos altos en la curva (crestas)
        const isPeak = 
          point.value > prevPoint.value && 
          point.value > nextPoint.value && 
          Math.abs(point.value) > 2.0;  // Filtro adicional para evitar detectar ruido como picos
        
        if (isPeak) {
          const x = canvas.width - ((now - point.time) * canvas.width / WINDOW_WIDTH_MS);
          const y = (canvas.height * 0.35) + point.value;
          
          // Depuración mejorada
          if (i === 1) { // Solo reportar para el pico más reciente
            console.log('PPGSignalMeter - Pico detectado:', {
              amplitud: (point.value / verticalScale).toFixed(2),
              valorNormalizado: normalizedValue.toFixed(2),
              valorEscalado: scaledValue.toFixed(2),
              posY: y,
              esArrhythmia: point.isArrhythmia,
              timestamp: new Date().toISOString()
            });
          }
          
          // Destacar visualmente el pico detectado con línea vertical
          ctx.beginPath();
          ctx.strokeStyle = point.isArrhythmia ? '#FF0000' : '#22D3EE';
          ctx.lineWidth = 1;
          ctx.setLineDash([]);
          ctx.moveTo(x, y);
          ctx.lineTo(x, y - 40); // Línea vertical hacia arriba
          ctx.stroke();
          
          // Marcar el pico
          ctx.beginPath();
          ctx.arc(x, y, point.isArrhythmia ? 6 : 4, 0, Math.PI * 2);
          ctx.fillStyle = point.isArrhythmia ? '#DC2626' : '#0EA5E9';
          ctx.fill();
          
          // Añadir segundo círculo más grande para mejor visibilidad
          ctx.beginPath();
          ctx.arc(x, y, 8, 0, Math.PI * 2);
          ctx.strokeStyle = point.isArrhythmia ? '#FF0000' : '#0EA5E9';
          ctx.lineWidth = 1;
          ctx.stroke();
          
          // Mostrar valor del pico
          ctx.font = 'bold 12px Inter';
          ctx.fillStyle = '#666666';
          ctx.textAlign = 'center';
          ctx.fillText(Math.abs(point.value / verticalScale).toFixed(2), x, y - 15);
          
          // Destacar arritmias
          if (point.isArrhythmia) {
            // Círculo destacado para arritmia
            ctx.beginPath();
            ctx.arc(x, y, 10, 0, Math.PI * 2);
            ctx.strokeStyle = '#FF3030';
            ctx.lineWidth = 2;
            ctx.stroke();
            
            // Etiqueta de latido prematuro
            ctx.font = 'bold 10px Inter';
            ctx.fillStyle = '#DC2626';
            ctx.fillText("LATIDO PREMATURO", x, y - 28);
            
            // Mostrar pausa compensatoria si hay suficientes puntos
            if (i < visiblePoints.length - 2) {
              const nextPoint = visiblePoints[i + 1];
              const nextNextPoint = visiblePoints[i + 2];
              
              const nextX = canvas.width - ((now - nextPoint.time) * canvas.width / WINDOW_WIDTH_MS);
              const nextNextX = canvas.width - ((now - nextNextPoint.time) * canvas.width / WINDOW_WIDTH_MS);
              
              ctx.beginPath();
              ctx.setLineDash([2, 2]);
              ctx.strokeStyle = 'rgba(220, 38, 38, 0.6)';
              ctx.lineWidth = 1;
              ctx.moveTo(x, y + 15);
              ctx.lineTo(nextNextX, y + 15);
              ctx.stroke();
              ctx.setLineDash([]);
              
              const compensatoryY = y + 25;
              ctx.font = '9px Inter';
              ctx.fillStyle = '#DC2626';
              ctx.fillText("PAUSA COMPENSATORIA", (x + nextNextX) / 2, compensatoryY);
            }
          }
        }
      }
    }

    lastRenderTimeRef.current = currentTime;
    animationFrameRef.current = requestAnimationFrame(renderSignal);
  }, [value, quality, isFingerDetected, rawArrhythmiaData, arrhythmiaStatus, drawGrid, smoothValue]);

  // Iniciar y detener el renderizado
  useEffect(() => {
    renderSignal();
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [renderSignal]);

  // Marcar arritmias en el buffer cuando se detectan
  useEffect(() => {
    if (!dataBufferRef.current) return;
    
    if (rawArrhythmiaData && arrhythmiaStatus?.includes("ARRITMIA DETECTADA") && 
        Date.now() - (rawArrhythmiaData.timestamp || 0) < 1000) {
      
      dataBufferRef.current.markLastAsArrhythmia(true);
      
      console.log("PPGSignalMeter: Arritmia detectada en visualización", {
        timestamp: new Date().toISOString()
      });
    }
  }, [rawArrhythmiaData, arrhythmiaStatus]);

  return (
    <>
      <div className="absolute top-0 right-1 z-30 flex items-center gap-2 rounded-lg p-2"
           style={{ top: '5px', right: '5px' }}>
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
          <span className={`text-[9px] text-center mt-0.5 font-medium ${
            !isFingerDetected ? 'text-gray-400' : 'text-green-500'
          }`}>
            {isFingerDetected ? "Dedo detectado" : "Ubique su dedo en la Lente"}
          </span>
        </div>
      </div>

      <div className="absolute inset-0 w-full" style={{ height: '50vh', top: 0 }}>
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          className="w-full h-full"
          style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 }}
        />
      </div>
      
      <div className="absolute" style={{ top: 'calc(50vh + 5px)', left: 0, right: 0, textAlign: 'center', zIndex: 30 }}>
        <h1 className="text-xl font-bold">
          <span className="text-white">Chars</span>
          <span className="text-[#ea384c]">Healt</span>
        </h1>
      </div>
    </>
  );
};

export default PPGSignalMeter;
