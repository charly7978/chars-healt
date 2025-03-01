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
  
  // Configuración óptima para visualización
  const WINDOW_WIDTH_MS = 5000;         // Ventana de tiempo más amplia para ver mejor
  const CANVAS_WIDTH = 450;
  const CANVAS_HEIGHT = 450;
  const GRID_SIZE_X = 10;
  const GRID_SIZE_Y = 10;
  const verticalScale = 20.0;           // Ajustado para mejor visualización
  const SMOOTHING_FACTOR = 0.6;         // Suavizado para la visualización
  const TARGET_FPS = 60;
  const FRAME_TIME = 1000 / TARGET_FPS;
  const BUFFER_SIZE = 300;              // Buffer más grande para mostrar más historia

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
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    
    // Fondo del gráfico
    ctx.fillStyle = '#f3f3f3';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Dibujar líneas de cuadrícula fina
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(0, 180, 120, 0.15)';
    ctx.lineWidth = 0.5;

    for (let x = 0; x <= CANVAS_WIDTH; x += GRID_SIZE_X) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, CANVAS_HEIGHT);
      if (x % (GRID_SIZE_X * 4) === 0) {
        ctx.fillStyle = 'rgba(0, 150, 100, 0.9)';
        ctx.font = '10px Inter';
        ctx.textAlign = 'center';
        ctx.fillText(`${Math.round(x / CANVAS_WIDTH * WINDOW_WIDTH_MS / 100) / 10}s`, x, CANVAS_HEIGHT - 5);
      }
    }

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

    // Dibujar líneas principales más gruesas
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

    // Línea de cero/línea base
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(0, 150, 100, 0.5)';
    ctx.lineWidth = 1.5;
    ctx.moveTo(0, CANVAS_HEIGHT / 2);
    ctx.lineTo(CANVAS_WIDTH, CANVAS_HEIGHT / 2);
    ctx.stroke();
  }, [WINDOW_WIDTH_MS]);

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
    
    // Actualizar la línea base de manera más gradual
    if (baselineRef.current === null) {
      baselineRef.current = value;
    } else {
      baselineRef.current = baselineRef.current * 0.95 + value * 0.05;
    }

    // Suavizar valor para visualización más agradable
    const smoothedValue = smoothValue(value, lastValueRef.current);
    lastValueRef.current = smoothedValue;

    // CORREGIDO: Ahora la señal sube cuando aumenta (valores positivos hacia arriba)
    const normalizedValue = (smoothedValue - (baselineRef.current || 0));
    const scaledValue = normalizedValue * verticalScale;
    
    // Determinar si este punto es un punto de arritmia
    let isArrhythmia = false;
    if (rawArrhythmiaData && 
        arrhythmiaStatus?.includes("ARRITMIA") && 
        now - rawArrhythmiaData.timestamp < 1000) {
      isArrhythmia = true;
      lastArrhythmiaTime.current = now;
      arrhythmiaCountRef.current++;
    }

    // Crear punto de datos para almacenar en buffer
    const dataPoint: PPGDataPoint = {
      time: now,
      value: scaledValue,
      isArrhythmia
    };
    
    dataBufferRef.current.push(dataPoint);

    // Dibujar fondo y cuadrícula
    drawGrid(ctx);

    // Obtener puntos a visualizar
    const points = dataBufferRef.current.getPoints();
    if (points.length > 1) {
      // Filtrar solo puntos que están dentro de la ventana de tiempo visible
      const visiblePoints = points.filter(
        point => (now - point.time) <= WINDOW_WIDTH_MS
      );
      
      if (visiblePoints.length > 1) {
        // Dibujar la línea de señal principal
        ctx.beginPath();
        ctx.strokeStyle = '#0EA5E9';  // Azul
        ctx.lineWidth = 2.5;          // Línea más gruesa
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        
        let firstPoint = true;
        
        for (let i = 0; i < visiblePoints.length; i++) {
          const point = visiblePoints[i];
          const x = canvas.width - ((now - point.time) * canvas.width / WINDOW_WIDTH_MS);
          // CORREGIDO: Los valores positivos suben en el gráfico
          const y = CANVAS_HEIGHT / 2 - point.value;
          
          if (firstPoint) {
            ctx.moveTo(x, y);
            firstPoint = false;
          } else {
            ctx.lineTo(x, y);
          }
          
          // Marcar segmentos de arritmia en rojo
          if (point.isArrhythmia && i < visiblePoints.length - 1) {
            ctx.stroke();
            ctx.beginPath();
            ctx.strokeStyle = '#DC2626';  // Rojo
            ctx.lineWidth = 3.5;          // Más grueso para destacar
            ctx.setLineDash([3, 2]);
            ctx.moveTo(x, y);
            
            const nextPoint = visiblePoints[i + 1];
            const nextX = canvas.width - ((now - nextPoint.time) * canvas.width / WINDOW_WIDTH_MS);
            const nextY = CANVAS_HEIGHT / 2 - nextPoint.value;
            ctx.lineTo(nextX, nextY);
            ctx.stroke();
            
            ctx.beginPath();
            ctx.strokeStyle = '#0EA5E9';
            ctx.lineWidth = 2.5;
            ctx.setLineDash([]);
            ctx.moveTo(nextX, nextY);
            firstPoint = false;
          }
        }
        
        ctx.stroke();
      }

      // ======= ANÁLISIS Y DETECCIÓN DE PICOS =======
      // CORREGIDO: Umbral más alto para reducir falsos picos
      const peakThreshold = 0.5 * verticalScale;
      
      // Usamos un conjunto para evitar detectar picos demasiado cercanos
      const detectedPeaks = new Set<number>();
      
      // CORREGIDO: Ahora buscamos picos hacia ARRIBA (valores positivos)
      for (let i = 4; i < visiblePoints.length - 4; i++) {
        // Verificar si estamos demasiado cerca de un pico ya detectado
        let tooClose = false;
        for (const peakIdx of detectedPeaks) {
          if (Math.abs(i - peakIdx) < 6) { // Evitar picos muy cercanos
            tooClose = true;
            break;
          }
        }
        if (tooClose) continue;
        
        // Considerar más puntos alrededor para mejor detección
        const prevPoint4 = visiblePoints[i - 4];
        const prevPoint3 = visiblePoints[i - 3];
        const prevPoint2 = visiblePoints[i - 2];
        const prevPoint = visiblePoints[i - 1];
        const point = visiblePoints[i];
        const nextPoint = visiblePoints[i + 1];
        const nextPoint2 = visiblePoints[i + 2];
        const nextPoint3 = visiblePoints[i + 3];
        const nextPoint4 = visiblePoints[i + 4];
        
        // CORREGIDO: Picos positivos (hacia arriba), valores mayores que vecinos
        // Para PPG: un pico real debe ser MAYOR que sus vecinos (no menor)
        const isPeak = 
          point.value > peakThreshold &&               // Altura mínima significativa
          point.value > prevPoint.value &&             // Mayor que punto anterior
          point.value > prevPoint2.value &&            // Mayor que dos puntos antes
          point.value > prevPoint3.value &&            // Mayor que tres puntos antes
          point.value > prevPoint4.value &&            // Mayor que cuatro puntos antes
          point.value > nextPoint.value &&             // Mayor que punto siguiente
          point.value > nextPoint2.value &&            // Mayor que dos puntos después
          point.value > nextPoint3.value &&            // Mayor que tres puntos después
          point.value > nextPoint4.value;              // Mayor que cuatro puntos después
        
        if (isPeak) {
          detectedPeaks.add(i); // Registrar este pico para evitar duplicados cercanos
          
          const x = canvas.width - ((now - point.time) * canvas.width / WINDOW_WIDTH_MS);
          const y = CANVAS_HEIGHT / 2 - point.value;
          
          // Dibujar círculo de pico más grande y visible
          ctx.beginPath();
          ctx.arc(x, y, point.isArrhythmia ? 6 : 5, 0, Math.PI * 2);
          ctx.fillStyle = point.isArrhythmia ? '#DC2626' : '#0EA5E9';
          ctx.fill();

          // Mostrar solo valores de amplitud significativos
          const amplitude = (point.value / verticalScale).toFixed(2);
          if (parseFloat(amplitude) > 0.6) {
            ctx.font = 'bold 11px Inter';
            ctx.fillStyle = '#666666';
            ctx.textAlign = 'center';
            ctx.fillText(amplitude, x, y - 12);
          }
          
          // Destacar información de latidos prematuros/arritmias
          if (point.isArrhythmia) {
            // Anillos destacando el latido prematuro
            ctx.beginPath();
            ctx.arc(x, y, 9, 0, Math.PI * 2);
            ctx.strokeStyle = '#FFFF00';  // Amarillo
            ctx.lineWidth = 2;
            ctx.stroke();
            
            ctx.beginPath();
            ctx.arc(x, y, 14, 0, Math.PI * 2);
            ctx.strokeStyle = '#FF6B6B';  // Rojo claro
            ctx.lineWidth = 1;
            ctx.setLineDash([2, 2]);
            ctx.stroke();
            ctx.setLineDash([]);
            
            // Etiqueta de latido prematuro
            ctx.font = 'bold 10px Inter';
            ctx.fillStyle = '#DC2626';
            ctx.fillText("LATIDO PREMATURO", x, y - 30);
            
            // Líneas conectando latidos para visualizar intervalos
            // Buscar picos normales antes y después para mostrar el patrón N-P-N
            let prevNormalIdx = -1;
            let nextNormalIdx = -1;
            
            // Buscar el último pico normal antes del prematuro
            for (let j = i - 1; j >= 4; j--) {
              if (detectedPeaks.has(j) && !visiblePoints[j].isArrhythmia) {
                prevNormalIdx = j;
                break;
              }
            }
            
            // Buscar el próximo pico normal después del prematuro
            for (let j = i + 1; j < visiblePoints.length - 4; j++) {
              if (detectedPeaks.has(j) && !visiblePoints[j].isArrhythmia) {
                nextNormalIdx = j;
                break;
              }
            }
            
            // Dibujar conexiones entre latidos
            ctx.beginPath();
            ctx.setLineDash([2, 2]);
            ctx.strokeStyle = 'rgba(255, 107, 107, 0.8)';
            ctx.lineWidth = 1.5;
            
            if (prevNormalIdx !== -1) {
              const prevPeak = visiblePoints[prevNormalIdx];
              const prevX = canvas.width - ((now - prevPeak.time) * canvas.width / WINDOW_WIDTH_MS);
              const prevY = CANVAS_HEIGHT / 2 - prevPeak.value;
              
              ctx.moveTo(prevX, prevY - 15);
              ctx.lineTo(x, y - 15);
              ctx.stroke();
              
              // Mostrar intervalo RR corto como rasgo distintivo de extrasístole
              const rrPre = point.time - prevPeak.time;
              ctx.font = 'bold 9px Inter';
              ctx.fillStyle = '#FF4500';
              ctx.fillText(`RR: ${rrPre}ms`, (prevX + x) / 2, y - 25);
            }
            
            if (nextNormalIdx !== -1) {
              const nextPeak = visiblePoints[nextNormalIdx];
              const nextX = canvas.width - ((now - nextPeak.time) * canvas.width / WINDOW_WIDTH_MS);
              const nextY = CANVAS_HEIGHT / 2 - nextPeak.value;
              
              ctx.beginPath();
              ctx.setLineDash([2, 2]);
              ctx.strokeStyle = 'rgba(255, 107, 107, 0.8)';
              ctx.moveTo(x, y - 15);
              ctx.lineTo(nextX, nextY - 15);
              ctx.stroke();
              
              // Mostrar pausa compensatoria (intervalo largo tras un prematuro)
              const rrPost = nextPeak.time - point.time;
              ctx.font = 'bold 9px Inter';
              ctx.fillStyle = '#FF4500';
              ctx.fillText(`RR: ${rrPost}ms`, (nextX + x) / 2, y - 25);
            }
            
            ctx.setLineDash([]);
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
