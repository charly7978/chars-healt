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
  
  const WINDOW_WIDTH_MS = 5000;
  const CANVAS_WIDTH = 1000;
  const CANVAS_HEIGHT = 200;
  const verticalScale = 22.0;
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
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    const now = Date.now();
    
    if (baselineRef.current === null) {
      baselineRef.current = value;
    } else {
      baselineRef.current = baselineRef.current * 0.95 + value * 0.05;
    }

    const smoothedValue = smoothValue(value, lastValueRef.current);
    lastValueRef.current = smoothedValue;

    const normalizedValue = (smoothedValue - (baselineRef.current || 0)) * verticalScale;
    
    const isCurrentArrhythmia = arrhythmiaStatus?.includes('ARRITMIA DETECTADA') || false;
    const lastPeakTime = rawArrhythmiaData?.lastPeakTime;
    const timeSinceLastPeak = lastPeakTime ? now - lastPeakTime : Infinity;
    const isNearPeak = timeSinceLastPeak < 50;

    const dataPoint: PPGDataPoint = {
      time: now,
      value: normalizedValue,
      isArrhythmia: isCurrentArrhythmia && isNearPeak
    };
    
    dataBufferRef.current.push(dataPoint);

    const offscreenCanvas = new OffscreenCanvas(canvas.width, canvas.height);
    const offscreenCtx = offscreenCanvas.getContext('2d', { alpha: false });
    
    if (!offscreenCtx) return;

    offscreenCtx.fillStyle = '#F8FAFC';
    offscreenCtx.fillRect(0, 0, canvas.width, canvas.height);

    offscreenCtx.strokeStyle = 'rgba(51, 65, 85, 0.15)';
    offscreenCtx.lineWidth = 0.5;
    offscreenCtx.font = '10px Inter';
    offscreenCtx.fillStyle = 'rgba(51, 65, 85, 0.6)';
    offscreenCtx.textAlign = 'right';
    
    const amplitudeStep = 50;
    const maxAmplitude = 200;
    for (let y = 0; y <= maxAmplitude; y += amplitudeStep) {
      const yPos = (canvas.height / 2) + y;
      const yNeg = (canvas.height / 2) - y;
      
      offscreenCtx.beginPath();
      offscreenCtx.moveTo(0, yPos);
      offscreenCtx.lineTo(canvas.width, yPos);
      offscreenCtx.moveTo(0, yNeg);
      offscreenCtx.lineTo(canvas.width, yNeg);
      offscreenCtx.stroke();
      
      if (y > 0) {
        offscreenCtx.fillText(`${y}`, 25, yPos + 4);
        offscreenCtx.fillText(`-${y}`, 25, yNeg + 4);
      }
    }

    const timeStep = 1000; // 1 segundo
    offscreenCtx.textAlign = 'center';
    for (let t = 0; t <= WINDOW_WIDTH_MS; t += timeStep) {
      const x = canvas.width - (t * canvas.width / WINDOW_WIDTH_MS);
      
      offscreenCtx.beginPath();
      offscreenCtx.moveTo(x, 0);
      offscreenCtx.lineTo(x, canvas.height);
      offscreenCtx.stroke();
      
      const seconds = t / 1000;
      offscreenCtx.fillText(`${seconds}s`, x, canvas.height - 5);
    }

    offscreenCtx.strokeStyle = 'rgba(51, 65, 85, 0.3)';
    offscreenCtx.lineWidth = 1;
    offscreenCtx.beginPath();
    offscreenCtx.moveTo(0, canvas.height / 2);
    offscreenCtx.lineTo(canvas.width, canvas.height / 2);
    offscreenCtx.stroke();
    
    const points = dataBufferRef.current.getPoints();
    
    if (points.length > 1) {
      offscreenCtx.lineWidth = 2;
      offscreenCtx.lineJoin = 'round';
      offscreenCtx.lineCap = 'round';
      offscreenCtx.beginPath();
      
      let firstPoint = true;
      points.forEach((point) => {
        const x = canvas.width - ((now - point.time) * canvas.width / WINDOW_WIDTH_MS);
        const y = canvas.height / 2 + point.value;
        
        if (firstPoint) {
          offscreenCtx.moveTo(x, y);
          firstPoint = false;
        } else {
          offscreenCtx.lineTo(x, y);
        }
      });
      
      offscreenCtx.strokeStyle = '#0EA5E9';
      offscreenCtx.stroke();
      
      points.forEach((point, i) => {
        if (i > 0 && i < points.length - 1) {
          const prevValue = points[i-1].value;
          const nextValue = points[i+1].value;
          
          if (point.value > prevValue && point.value > nextValue) {
            const x = canvas.width - ((now - point.time) * canvas.width / WINDOW_WIDTH_MS);
            const y = canvas.height / 2 + point.value;
            
            offscreenCtx.beginPath();
            offscreenCtx.arc(x, y, 4, 0, Math.PI * 2);
            offscreenCtx.fillStyle = point.isArrhythmia ? '#DC2626' : '#0EA5E9';
            offscreenCtx.fill();
            
            offscreenCtx.font = '10px Inter';
            offscreenCtx.fillStyle = 'rgba(51, 65, 85, 0.8)';
            offscreenCtx.textAlign = 'left';
            offscreenCtx.fillText(`${Math.round(point.value)}`, x + 8, y - 8);
          }
        }
      });
    }

    ctx.drawImage(offscreenCanvas, 0, 0);
    
    lastRenderTimeRef.current = currentTime;
    animationFrameRef.current = requestAnimationFrame(renderSignal);
  }, [value, quality, isFingerDetected, rawArrhythmiaData, arrhythmiaStatus, smoothValue]);

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
