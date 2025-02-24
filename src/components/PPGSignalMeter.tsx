
import React, { useEffect, useRef, useCallback } from 'react';
import { Fingerprint, Info } from 'lucide-react';
import { CircularBuffer, PPGDataPoint } from '../utils/CircularBuffer';

interface PPGSignalMeterProps {
  value: number;
  quality: number;
  isFingerDetected: boolean;
  onStartMeasurement: () => void;
  onReset: () => void;
  arrhythmiaStatus?: string;
  rawArrhythmiaData?: { rrIntervals: number[], lastPeakTime: number | null };
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
  const baselineRef = useRef<number | null>(null);
  const dataBufferRef = useRef<CircularBuffer | null>(null);
  const lastValueRef = useRef<number | null>(null);
  const animationFrameRef = useRef<number>();
  const lastRenderTimeRef = useRef<number>(0);
  const lastArrhythmiaTime = useRef<number>(0);
  
  const WINDOW_WIDTH_MS = 5000;
  const CANVAS_WIDTH = 1000;
  const CANVAS_HEIGHT = 200;
  const GRID_SIZE_X = 50;  // 50px = 250ms
  const GRID_SIZE_Y = 20;  // 20px = 0.1mV
  const verticalScale = 28.0;
  const SMOOTHING_FACTOR = 0.85;
  const TARGET_FPS = 60;
  const FRAME_TIME = 1000 / TARGET_FPS;

  useEffect(() => {
    if (!dataBufferRef.current) {
      dataBufferRef.current = new CircularBuffer(1000);
    }
  }, []);

  const getQualityColor = useCallback((q: number) => {
    if (q > 75) return 'from-green-500 to-emerald-500';
    if (q > 50) return 'from-yellow-500 to-orange-500';
    return 'from-red-500 to-rose-500';
  }, []);

  const getQualityText = useCallback((q: number) => {
    if (q > 75) return 'Señal óptima';
    if (q > 50) return 'Señal aceptable';
    return 'Señal débil';
  }, []);

  const smoothValue = useCallback((currentValue: number, previousValue: number | null): number => {
    if (previousValue === null) return currentValue;
    return previousValue + SMOOTHING_FACTOR * (currentValue - previousValue);
  }, []);

  const drawGrid = useCallback((ctx: CanvasRenderingContext2D) => {
    // Fondo con gradiente sutil
    const gradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
    gradient.addColorStop(0, '#f8fafc');
    gradient.addColorStop(1, '#f1f5f9');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Cuadrícula menor
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(51, 65, 85, 0.1)';
    ctx.lineWidth = 0.5;

    // Líneas verticales (tiempo)
    for (let x = 0; x <= CANVAS_WIDTH; x += GRID_SIZE_X) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, CANVAS_HEIGHT);
      
      // Marcadores de tiempo cada 250ms
      if (x % (GRID_SIZE_X * 2) === 0) {
        const timeMs = (WINDOW_WIDTH_MS * x) / CANVAS_WIDTH;
        ctx.fillStyle = '#475569';
        ctx.font = '10px Inter';
        ctx.textAlign = 'center';
        ctx.fillText(`${timeMs}ms`, x, CANVAS_HEIGHT - 5);
      }
    }

    // Líneas horizontales (amplitud)
    for (let y = 0; y <= CANVAS_HEIGHT; y += GRID_SIZE_Y) {
      ctx.moveTo(0, y);
      ctx.lineTo(CANVAS_WIDTH, y);
      
      // Marcadores de amplitud cada 0.1mV
      if (y % (GRID_SIZE_Y * 2) === 0) {
        const amplitude = ((CANVAS_HEIGHT/2) - y) / verticalScale;
        ctx.fillStyle = '#475569';
        ctx.font = '10px Inter';
        ctx.textAlign = 'right';
        ctx.fillText(`${amplitude.toFixed(2)} mV`, 35, y + 4);
      }
    }
    ctx.stroke();

    // Cuadrícula mayor
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(51, 65, 85, 0.2)';
    ctx.lineWidth = 1;

    // Líneas verticales mayores (cada 500ms)
    for (let x = 0; x <= CANVAS_WIDTH; x += GRID_SIZE_X * 4) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, CANVAS_HEIGHT);
      ctx.fillStyle = '#1e293b';
      ctx.font = '11px Inter';
      ctx.textAlign = 'center';
      const timeMs = (WINDOW_WIDTH_MS * x) / CANVAS_WIDTH;
      ctx.fillText(`${timeMs}ms`, x, 15);
    }

    // Líneas horizontales mayores (cada 0.5mV)
    for (let y = 0; y <= CANVAS_HEIGHT; y += GRID_SIZE_Y * 5) {
      ctx.moveTo(0, y);
      ctx.lineTo(CANVAS_WIDTH, y);
    }
    ctx.stroke();

    // Línea base (0mV)
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(51, 65, 85, 0.3)';
    ctx.lineWidth = 1.5;
    ctx.moveTo(0, CANVAS_HEIGHT / 2);
    ctx.lineTo(CANVAS_WIDTH, CANVAS_HEIGHT / 2);
    ctx.stroke();

    // Etiqueta línea base
    ctx.fillStyle = '#1e293b';
    ctx.font = 'bold 11px Inter';
    ctx.textAlign = 'left';
    ctx.fillText('Línea base (0 mV)', 10, CANVAS_HEIGHT / 2 - 8);

    // Leyenda
    ctx.fillStyle = '#1e293b';
    ctx.font = '11px Inter';
    ctx.textAlign = 'right';
    ctx.fillText('Tiempo (ms)', CANVAS_WIDTH - 10, CANVAS_HEIGHT - 20);
    ctx.save();
    ctx.translate(20, CANVAS_HEIGHT / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('Amplitud (mV)', 0, 0);
    ctx.restore();
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
    
    let isArrhythmia = false;
    if (arrhythmiaStatus?.includes("ARRITMIA DETECTADA") && rawArrhythmiaData?.rrIntervals?.length) {
      const lastRRInterval = rawArrhythmiaData.rrIntervals[rawArrhythmiaData.rrIntervals.length - 1];
      const timeNow = Date.now();
      if ((lastRRInterval > 1000 || lastRRInterval < 700) &&
          (timeNow - lastArrhythmiaTime.current > 500)) {
        isArrhythmia = true;
        lastArrhythmiaTime.current = timeNow;
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
      // Dibujar área bajo la curva
      ctx.beginPath();
      ctx.fillStyle = 'rgba(234, 56, 76, 0.05)';
      ctx.moveTo(CANVAS_WIDTH, CANVAS_HEIGHT / 2);
      
      points.forEach((point, index) => {
        const x = CANVAS_WIDTH - ((now - point.time) * CANVAS_WIDTH / WINDOW_WIDTH_MS);
        const y = CANVAS_HEIGHT / 2 - point.value;
        if (index === 0) {
          ctx.moveTo(x, CANVAS_HEIGHT / 2);
        }
        ctx.lineTo(x, y);
      });
      
      ctx.lineTo(points[0].time, CANVAS_HEIGHT / 2);
      ctx.fill();

      // Dibujar línea de señal
      ctx.beginPath();
      ctx.strokeStyle = '#EA384C';
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';

      let peakCount = 0;
      let lastPeakTime = 0;
      
      points.forEach((point, index) => {
        const x = CANVAS_WIDTH - ((now - point.time) * CANVAS_WIDTH / WINDOW_WIDTH_MS);
        const y = CANVAS_HEIGHT / 2 - point.value;

        if (index === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }

        // Detectar y marcar picos
        if (index > 0 && index < points.length - 1) {
          const prevPoint = points[index - 1];
          const nextPoint = points[index + 1];
          
          if (point.value > prevPoint.value && point.value > nextPoint.value) {
            peakCount++;
            ctx.stroke();
            ctx.beginPath();

            // Información del pico
            const amplitude = Math.abs(point.value / verticalScale).toFixed(2);
            const timeSinceLastPeak = point.time - lastPeakTime;
            lastPeakTime = point.time;

            // Dibujar número y amplitud del pico
            ctx.font = 'bold 12px Inter';
            ctx.fillStyle = '#1e293b';
            ctx.textAlign = 'center';
            ctx.fillText(`${peakCount}`, x, y - 20);
            
            ctx.font = '10px Inter';
            ctx.fillStyle = '#475569';
            ctx.fillText(`${amplitude}mV`, x, y - 35);
            
            if (timeSinceLastPeak > 0 && peakCount > 1) {
              ctx.fillText(`${Math.round(timeSinceLastPeak)}ms`, x, y + 25);
            }

            // Marcador del pico
            ctx.beginPath();
            ctx.arc(x, y, 4, 0, Math.PI * 2);
            ctx.fillStyle = point.isArrhythmia ? '#DC2626' : '#EA384C';
            ctx.fill();

            // Indicador de arritmia
            if (point.isArrhythmia) {
              ctx.save();
              ctx.beginPath();
              ctx.moveTo(x, y - 40);
              ctx.lineTo(x, y + 40);
              ctx.strokeStyle = '#DC2626';
              ctx.setLineDash([2, 2]);
              ctx.lineWidth = 1;
              ctx.stroke();
              
              ctx.font = 'bold 12px Inter';
              ctx.fillStyle = '#DC2626';
              ctx.fillText('!', x, y - 45);
              ctx.restore();
            }

            ctx.beginPath();
            ctx.strokeStyle = '#EA384C';
            ctx.lineWidth = 2;
            ctx.moveTo(x, y);
          }
        }
      });

      ctx.stroke();
    }

    lastRenderTimeRef.current = currentTime;
    animationFrameRef.current = requestAnimationFrame(renderSignal);
  }, [value, quality, isFingerDetected, rawArrhythmiaData, smoothValue, arrhythmiaStatus, drawGrid]);

  useEffect(() => {
    renderSignal();
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [renderSignal]);

  const handleReset = useCallback(() => {
    if (dataBufferRef.current) {
      dataBufferRef.current.clear();
    }
    baselineRef.current = null;
    lastValueRef.current = null;
    onReset();
  }, [onReset]);

  return (
    <div className="fixed inset-0 bg-gradient-to-b from-white to-slate-50/30">
      {/* Header con información de estado */}
      <div className="absolute top-0 left-0 right-0 p-2 flex justify-between items-center bg-white/60 backdrop-blur-sm border-b border-slate-100 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold text-slate-700">PPG</span>
            <Info className="h-4 w-4 text-slate-400" />
          </div>
          <div className="w-[200px]">
            <div className={`h-1.5 w-full rounded-full bg-gradient-to-r ${getQualityColor(quality)} transition-all duration-1000 ease-in-out`}>
              <div
                className="h-full rounded-full bg-white/20 animate-pulse transition-all duration-1000"
                style={{ width: `${quality}%` }}
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
            className={`h-12 w-12 transition-colors duration-300 ${
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

      {/* Canvas del gráfico PPG */}
      <canvas
        ref={canvasRef}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        className="w-full h-[calc(40vh)] mt-20"
      />

      {/* Leyenda de la señal */}
      <div className="absolute bottom-[80px] left-4 right-4 p-2 bg-white/80 backdrop-blur-sm rounded-lg border border-slate-100 shadow-sm">
        <div className="flex items-center gap-4 text-xs text-slate-600">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full bg-red-500"></div>
            <span>Pico sistólico</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
            <span>Dicrótico</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full bg-red-600"></div>
            <span>Arritmia</span>
          </div>
        </div>
      </div>

      {/* Botones de control */}
      <div className="fixed bottom-0 left-0 right-0 h-[60px] grid grid-cols-2 gap-px bg-white/80 backdrop-blur-sm border-t border-slate-100">
        <button 
          onClick={onStartMeasurement}
          className="w-full h-full bg-white/90 hover:bg-slate-100/90 text-xl font-bold text-slate-700 transition-all duration-300 active:bg-slate-200/90 shadow-sm"
        >
          INICIAR
        </button>
        <button 
          onClick={handleReset}
          className="w-full h-full bg-white/90 hover:bg-slate-100/90 text-xl font-bold text-slate-700 transition-all duration-300 active:bg-slate-200/90 shadow-sm"
        >
          RESET
        </button>
      </div>
    </div>
  );
};

export default PPGSignalMeter;
