
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
  const verticalScale = 35.0;
  const SMOOTHING_FACTOR = 0.85;
  const TARGET_FPS = 60;
  const FRAME_TIME = 1000 / TARGET_FPS;

  useEffect(() => {
    if (!dataBufferRef.current) {
      dataBufferRef.current = new CircularBuffer(1000);
    }
  }, []);

  const getQualityColor = useCallback((quality: number) => {
    if (quality > 75) return 'from-green-500 to-emerald-500';
    if (quality > 50) return 'from-yellow-500 to-orange-500';
    return 'from-red-500 to-rose-500';
  }, []);

  const getQualityText = useCallback((quality: number) => {
    if (quality > 75) return 'Señal óptima';
    if (quality > 50) return 'Señal aceptable';
    return 'Señal débil';
  }, []);

  const smoothValue = useCallback((currentValue: number, previousValue: number | null): number => {
    if (previousValue === null) return currentValue;
    return previousValue + SMOOTHING_FACTOR * (currentValue - previousValue);
  }, []);

  const renderSignal = useCallback(() => {
    if (!canvasRef.current || !isFingerDetected || !dataBufferRef.current) return;

    const currentTime = performance.now();
    const timeSinceLastRender = currentTime - lastRenderTimeRef.current;

    if (timeSinceLastRender < FRAME_TIME) {
      animationFrameRef.current = requestAnimationFrame(renderSignal);
      return;
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

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
    
    // Solo marcamos como arritmia si detectamos un latido anormal
    let isArrhythmia = false;
    if (rawArrhythmiaData?.rrIntervals && rawArrhythmiaData.rrIntervals.length > 0) {
      const lastRRInterval = rawArrhythmiaData.rrIntervals[rawArrhythmiaData.rrIntervals.length - 1];
      // Solo marcamos como arritmia si el intervalo es muy largo o muy corto
      isArrhythmia = lastRRInterval > 1200 || lastRRInterval < 600;
    }

    const dataPoint: PPGDataPoint = {
      time: now,
      value: scaledValue,
      isArrhythmia
    };
    
    dataBufferRef.current.push(dataPoint);

    // Limpiar canvas
    ctx.fillStyle = '#F8FAFC';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Dibujar señal PPG
    const points = dataBufferRef.current.getPoints();
    if (points.length > 1) {
      let lastX = 0;
      let lastY = 0;
      let firstPoint = true;

      // Luego dibujamos la línea de la señal
      points.forEach((point, index) => {
        const x = canvas.width - ((now - point.time) * canvas.width / WINDOW_WIDTH_MS);
        const y = canvas.height / 2 - point.value;

        if (firstPoint) {
          firstPoint = false;
        } else {
          ctx.beginPath();
          ctx.moveTo(lastX, lastY);
          ctx.lineTo(x, y);
          ctx.strokeStyle = '#0EA5E9'; // Siempre azul para la línea
          ctx.lineWidth = 2;
          ctx.stroke();
        }

        // Detectar y marcar picos
        if (index > 0 && index < points.length - 1) {
          const prevPoint = points[index - 1];
          const nextPoint = points[index + 1];
          
          if (point.value > prevPoint.value && point.value > nextPoint.value) {
            // Dibujar círculo en el pico
            ctx.beginPath();
            ctx.arc(x, y, 4, 0, Math.PI * 2);
            ctx.fillStyle = point.isArrhythmia ? '#DC2626' : '#0EA5E9';
            ctx.fill();

            // Mostrar valor numérico
            const displayValue = Math.abs(Math.round(point.value));
            ctx.font = '12px Inter';
            ctx.fillStyle = point.isArrhythmia ? 'rgba(220, 38, 38, 0.8)' : 'rgba(51, 65, 85, 0.8)';
            ctx.textAlign = 'left';
            ctx.fillText(`${displayValue}`, x + 8, y - 8);

            // Si es arritmia, añadir indicador
            if (point.isArrhythmia) {
              ctx.font = '10px Inter';
              ctx.fillStyle = '#DC2626';
              ctx.fillText('⚠️', x + 8, y - 20);
            }
          }
        }

        lastX = x;
        lastY = y;
      });
    }

    // Dibujar grilla
    ctx.strokeStyle = 'rgba(51, 65, 85, 0.15)';
    ctx.lineWidth = 0.5;

    // Grilla horizontal
    for (let i = 0; i <= CANVAS_HEIGHT; i += 50) {
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(CANVAS_WIDTH, i);
      ctx.stroke();
    }

    // Grilla vertical
    for (let i = 0; i <= CANVAS_WIDTH; i += 100) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, CANVAS_HEIGHT);
      ctx.stroke();
    }

    // Línea central
    ctx.strokeStyle = 'rgba(51, 65, 85, 0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, CANVAS_HEIGHT / 2);
    ctx.lineTo(CANVAS_WIDTH, CANVAS_HEIGHT / 2);
    ctx.stroke();

    lastRenderTimeRef.current = currentTime;
    animationFrameRef.current = requestAnimationFrame(renderSignal);
  }, [value, quality, isFingerDetected, rawArrhythmiaData, smoothValue]);

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
      <div className="absolute top-0 left-0 right-0 p-2 flex justify-between items-center bg-white/60 backdrop-blur-sm border-b border-slate-100 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="text-xl font-bold text-slate-700">PPG</span>
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
            size={48}
            className={`transition-colors duration-300 ${
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
