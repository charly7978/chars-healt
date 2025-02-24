
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Progress } from "@/components/ui/progress";
import VitalSign from '@/components/VitalSign';
import { Fingerprint } from 'lucide-react';

interface PPGSignalMeterProps {
  value: number;
  quality: number;
  isFingerDetected: boolean;
  onStartMeasurement: () => void;
  onReset: () => void;
  arrhythmiaStatus?: string;
}

interface PPGDataPoint {
  time: number;
  value: number;
  isWaveStart: boolean;
  isArrhythmia: boolean;
}

const PPGSignalMeter = ({ 
  value, 
  quality, 
  isFingerDetected,
  onStartMeasurement,
  onReset,
  arrhythmiaStatus
}: PPGSignalMeterProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dataRef = useRef<PPGDataPoint[]>([]);
  const [startTime, setStartTime] = useState<number>(Date.now());
  const WINDOW_WIDTH_MS = 6000;
  const CANVAS_WIDTH = 400;
  const CANVAS_HEIGHT = 800;
  const verticalScale = 40.0;
  const baselineRef = useRef<number | null>(null);
  const maxAmplitudeRef = useRef<number>(0);
  const lastValueRef = useRef<number>(0);
  const requestIdRef = useRef<number>();
  
  const POINTS_PER_PIXEL = 2;
  const BUFFER_PADDING = 100;

  const handleReset = useCallback(() => {
    dataRef.current = [];
    baselineRef.current = null;
    maxAmplitudeRef.current = 0;
    lastValueRef.current = 0;
    setStartTime(Date.now());
    onReset();
  }, [onReset]);

  const getQualityColor = useCallback((quality: number) => {
    if (quality > 90) return 'from-emerald-500/80 to-emerald-400/80';
    if (quality > 75) return 'from-sky-500/80 to-sky-400/80';
    if (quality > 60) return 'from-indigo-500/80 to-indigo-400/80';
    if (quality > 40) return 'from-amber-500/80 to-amber-400/80';
    return 'from-red-500/80 to-red-400/80';
  }, []);

  const getQualityText = useCallback((quality: number) => {
    if (quality > 90) return 'Excellent';
    if (quality > 75) return 'Very Good';
    if (quality > 60) return 'Good';
    if (quality > 40) return 'Fair';
    return 'Poor';
  }, []);

  const getVisiblePoints = useCallback((allPoints: PPGDataPoint[], currentTime: number, canvasWidth: number) => {
    if (allPoints.length === 0) return [];
    
    const pointsNeeded = canvasWidth * POINTS_PER_PIXEL + BUFFER_PADDING;
    
    const startIndex = Math.max(0, allPoints.length - pointsNeeded);
    
    return allPoints.slice(startIndex);
  }, []);

  useEffect(() => {
    if (!canvasRef.current) return;
    if (!isFingerDetected) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const currentTime = Date.now();
    
    if (baselineRef.current === null) {
      baselineRef.current = value;
    } else {
      baselineRef.current = baselineRef.current * 0.95 + value * 0.05;
    }

    const normalizedValue = (value - (baselineRef.current || 0)) * verticalScale;
    const isWaveStart = lastValueRef.current < 0 && normalizedValue >= 0;
    lastValueRef.current = normalizedValue;
    
    const isCurrentPointArrhythmic = arrhythmiaStatus?.includes('ARRITMIA DETECTADA') || false;
    
    dataRef.current.push({
      time: currentTime,
      value: normalizedValue,
      isWaveStart,
      isArrhythmia: isCurrentPointArrhythmic
    });

    const cutoffTime = currentTime - WINDOW_WIDTH_MS;
    dataRef.current = dataRef.current.filter(point => point.time >= cutoffTime);

    const visiblePoints = getVisiblePoints(dataRef.current, currentTime, canvas.width);

    ctx.fillStyle = '#F8FAFC';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = 'rgba(51, 65, 85, 0.15)';
    ctx.lineWidth = 0.5;
    
    for (let i = 0; i < 40; i++) {
      const x = canvas.width - (canvas.width * (i / 40));
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
      
      if (i % 4 === 0) {
        ctx.fillStyle = 'rgba(51, 65, 85, 0.5)';
        ctx.font = '12px Inter';
        ctx.fillText(`${i * 50}ms`, x - 25, canvas.height - 5);
      }
    }

    const amplitudeLines = 10;
    for (let i = 0; i <= amplitudeLines; i++) {
      const y = (canvas.height / amplitudeLines) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(51, 65, 85, 0.2)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, canvas.height / 2);
    ctx.lineTo(canvas.width, canvas.height / 2);
    ctx.stroke();

    if (visiblePoints.length > 1) {
      ctx.lineWidth = 3;
      let lastX = 0;
      let lastY = 0;
      let isFirstPoint = true;

      visiblePoints.forEach((point, index) => {
        const x = canvas.width - ((currentTime - point.time) * canvas.width / WINDOW_WIDTH_MS);
        const y = canvas.height / 2 + point.value;

        if (isFirstPoint) {
          ctx.beginPath();
          ctx.moveTo(x, y);
          isFirstPoint = false;
        } else {
          if (point.isArrhythmia !== visiblePoints[index - 1]?.isArrhythmia) {
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(lastX, lastY);
          }
          
          ctx.strokeStyle = point.isArrhythmia ? '#FF2E2E' : '#0ea5e9';
          ctx.lineTo(x, y);
        }

        lastX = x;
        lastY = y;
      });

      ctx.stroke();
    }

  }, [value, quality, isFingerDetected, arrhythmiaStatus, getVisiblePoints]);

  useEffect(() => {
    return () => {
      if (requestIdRef.current) {
        cancelAnimationFrame(requestIdRef.current);
      }
    };
  }, []);

  return (
    <div className="fixed inset-0 bg-gradient-to-b from-white to-slate-50/30">
      <div className="absolute top-0 left-0 right-0 p-2 flex justify-between items-center bg-white/60 backdrop-blur-sm border-b border-slate-100 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="text-xl font-bold text-slate-700">PPG</span>
          <div className="flex flex-col flex-1">
            <div className={`h-1.5 w-full mx-auto rounded-full bg-gradient-to-r ${getQualityColor(quality)} transition-all duration-1000 ease-in-out`}>
              <div
                className="h-full rounded-full bg-white/20 animate-pulse transition-all duration-1000"
                style={{ width: `${quality}%` }}
              />
            </div>
            <span className="text-[9px] text-center mt-0.5 font-medium transition-colors duration-700" 
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
          className="w-full h-full bg-white/80 hover:bg-slate-50/80 text-xl font-bold text-slate-700 transition-all duration-300"
        >
          INICIAR
        </button>
        <button 
          onClick={onReset}
          className="w-full h-full bg-white/80 hover:bg-slate-50/80 text-xl font-bold text-slate-700 transition-all duration-300"
        >
          RESET
        </button>
      </div>
    </div>
  );
};

export default PPGSignalMeter;
