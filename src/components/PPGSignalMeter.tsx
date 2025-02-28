
import React, { useEffect, useRef, useCallback } from 'react';
import { Fingerprint } from 'lucide-react';

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

const PPGSignalMeter: React.FC<PPGSignalMeterProps> = ({ 
  value, 
  quality, 
  isFingerDetected,
  onStartMeasurement,
  onReset,
  arrhythmiaStatus,
  rawArrhythmiaData
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dataBufferRef = useRef<any>(null);
  const baselineRef = useRef<number | null>(null);
  const lastValueRef = useRef<number | null>(null);
  const animationFrameRef = useRef<number>();
  const lastRenderTimeRef = useRef<number>(0);
  const lastArrhythmiaTimeRef = useRef<number>(0);
  const arrhythmiaCountRef = useRef<number>(0);
  
  const WINDOW_WIDTH_MS = 3500;
  const CANVAS_WIDTH = 450;
  const CANVAS_HEIGHT = 450;
  const GRID_SIZE_X = 30;
  const GRID_SIZE_Y = 30;
  const verticalScale = 39.0;
  const SMOOTHING_FACTOR = 0.9;
  const TARGET_FPS = 60;
  const FRAME_TIME = 1000 / TARGET_FPS;
  const BUFFER_SIZE = 200;
  
  useEffect(() => {
    // Inicializar el buffer circular
    if (!dataBufferRef.current) {
      dataBufferRef.current = {
        data: Array(BUFFER_SIZE).fill({ value: 0, timestamp: 0 }),
        head: 0,
        tail: 0,
        isFull: false,
        
        push: function(value: number, timestamp: number) {
          this.data[this.head] = { value, timestamp };
          this.head = (this.head + 1) % BUFFER_SIZE;
          
          if (this.head === this.tail) {
            this.tail = (this.tail + 1) % BUFFER_SIZE;
            this.isFull = true;
          }
        },
        
        getAll: function() {
          const result = [];
          let idx = this.tail;
          
          do {
            if (idx === this.head && !this.isFull) break;
            result.push(this.data[idx]);
            idx = (idx + 1) % BUFFER_SIZE;
          } while (idx !== this.head);
          
          return result;
        },
        
        getNewest: function(count: number) {
          const allData = this.getAll();
          return allData.slice(Math.max(0, allData.length - count));
        }
      };
    }
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const resetCanvas = () => {
      if (!canvas || !ctx) return;
      
      // Limpiar el canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Dibujar cuadrícula
      ctx.strokeStyle = 'rgba(60, 60, 60, 0.5)';
      ctx.lineWidth = 0.5;
      
      // Líneas verticales
      for (let x = 0; x <= canvas.width; x += GRID_SIZE_X) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }
      
      // Líneas horizontales
      for (let y = 0; y <= canvas.height; y += GRID_SIZE_Y) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }
    };
    
    const renderSignal = (timestamp: number) => {
      if (!canvas || !ctx) return;
      
      // Calcular tiempo delta para mantener consistencia
      const delta = timestamp - lastRenderTimeRef.current;
      
      // Limitar FPS
      if (delta < FRAME_TIME) {
        animationFrameRef.current = requestAnimationFrame(renderSignal);
        return;
      }
      
      lastRenderTimeRef.current = timestamp;
      
      // Obtener los datos más recientes
      let data = dataBufferRef.current.getAll();
      
      if (data.length === 0) {
        resetCanvas();
        animationFrameRef.current = requestAnimationFrame(renderSignal);
        return;
      }
      
      // Suavizado para la animación fluida
      if (lastValueRef.current !== null && value !== null) {
        const smoothedValue = SMOOTHING_FACTOR * lastValueRef.current + (1 - SMOOTHING_FACTOR) * value;
        lastValueRef.current = smoothedValue;
      } else {
        lastValueRef.current = value;
      }
      
      // Añadir el punto actual
      if (lastValueRef.current !== null) {
        dataBufferRef.current.push(lastValueRef.current, Date.now());
      }
      
      // Actualizar la visualización
      data = dataBufferRef.current.getAll();
      
      // No dibujar si no hay datos
      if (data.length < 2) {
        resetCanvas();
        animationFrameRef.current = requestAnimationFrame(renderSignal);
        return;
      }
      
      // Calcular la línea base para centrar la señal (media móvil)
      if (baselineRef.current === null) {
        const sum = data.reduce((acc: number, point: any) => acc + point.value, 0);
        baselineRef.current = sum / data.length;
      } else {
        baselineRef.current = 0.99 * baselineRef.current + 0.01 * (lastValueRef.current || 0);
      }
      
      // Limpiar y preparar el canvas
      resetCanvas();
      
      // Calcular el rango visible de tiempo
      const now = Date.now();
      const startTime = now - WINDOW_WIDTH_MS;
      
      // Dibujar la línea de señal
      ctx.beginPath();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = isFingerDetected ? 
        (quality > 60 ? '#0EA5E9' : '#F59E0B') : 
        'rgba(100, 100, 100, 0.7)';
      
      let first = true;
      
      // Filtrar y mapear los puntos al canvas
      for (const point of data) {
        if (point.timestamp < startTime) continue;
        
        // Mapear el tiempo al eje X
        const x = canvas.width - ((now - point.timestamp) / WINDOW_WIDTH_MS) * canvas.width;
        
        // Mapear el valor al eje Y (invertido porque el origen es arriba)
        const y = canvas.height / 2 - (point.value - (baselineRef.current || 0)) * verticalScale;
        
        if (first) {
          ctx.moveTo(x, y);
          first = false;
        } else {
          ctx.lineTo(x, y);
        }
      }
      
      ctx.stroke();
      
      // Continuar la animación
      animationFrameRef.current = requestAnimationFrame(renderSignal);
    };
    
    // Iniciar el bucle de renderizado
    animationFrameRef.current = requestAnimationFrame(renderSignal);
    
    // Limpieza
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [value, quality, isFingerDetected]);
  
  // Obtener el color según la calidad de la señal
  const getQualityColor = (quality: number) => {
    if (!isFingerDetected) return 'from-gray-700 to-gray-500';
    if (quality > 75) return 'from-blue-700 via-blue-500 to-cyan-400';
    if (quality > 50) return 'from-yellow-700 via-yellow-500 to-yellow-400';
    return 'from-red-700 via-red-500 to-red-400';
  };
  
  // Texto descriptivo de la calidad
  const getQualityText = (quality: number) => {
    if (!isFingerDetected) return 'Esperando dedo...';
    if (quality > 75) return 'Señal óptima';
    if (quality > 60) return 'Señal buena';
    if (quality > 40) return 'Señal aceptable';
    if (quality > 20) return 'Señal débil';
    return 'Señal muy débil';
  };
  
  return (
    <div className="h-full relative">
      {/* Sensor de calidad */}
      <div className="absolute top-1 right-1 z-30 flex items-center gap-2 bg-black/40 rounded-lg p-2">
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

      {/* Visualizador de señal PPG */}
      <canvas
        ref={canvasRef}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        className="w-full h-full"
      />

      {/* Se elimina el título duplicado que estaba aquí */}
    </div>
  );
};

export default PPGSignalMeter;
