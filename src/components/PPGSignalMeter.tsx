import React, { useEffect, useRef, useState } from 'react';
import { Fingerprint } from 'lucide-react';
import VitalSign from '@/components/VitalSign';

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
  const animationFrameRef = useRef<number>();
  const [startTime, setStartTime] = useState<number>(Date.now());
  
  const WINDOW_WIDTH_MS = 3000;
  const CANVAS_WIDTH = 800;
  const CANVAS_HEIGHT = 200;
  const verticalScale = 25.0;
  const baselineRef = useRef<number | null>(null);
  const lastValueRef = useRef<number>(0);

  const handleReset = () => {
    dataRef.current = [];
    baselineRef.current = null;
    lastValueRef.current = 0;
    setStartTime(Date.now());
    onReset();
  };

  const getQualityColor = (quality: number) => {
    if (quality > 90) return 'from-emerald-500/80 to-emerald-400/80';
    if (quality > 75) return 'from-sky-500/80 to-sky-400/80';
    if (quality > 60) return 'from-indigo-500/80 to-indigo-400/80';
    if (quality > 40) return 'from-amber-500/80 to-amber-400/80';
    return 'from-red-500/80 to-red-400/80';
  };

  const getQualityText = (quality: number) => {
    if (quality > 90) return 'Excellent';
    if (quality > 75) return 'Very Good';
    if (quality > 60) return 'Good';
    if (quality > 40) return 'Fair';
    return 'Poor';
  };

  useEffect(() => {
    if (!canvasRef.current || !isFingerDetected) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const currentTime = Date.now();

    if (baselineRef.current === null) {
      baselineRef.current = value;
    } else {
      const alpha = 0.02;
      baselineRef.current = baselineRef.current * (1 - alpha) + value * alpha;
    }

    const normalizedValue = (value - (baselineRef.current || 0)) * verticalScale;
    
    dataRef.current.push({
      time: currentTime,
      value: normalizedValue,
      isWaveStart: lastValueRef.current < 0 && normalizedValue >= 0,
      isArrhythmia: false
    });

    lastValueRef.current = normalizedValue;

    const cutoffTime = currentTime - WINDOW_WIDTH_MS;
    dataRef.current = dataRef.current.filter(point => point.time >= cutoffTime);

    const drawFrame = () => {
      ctx.fillStyle = '#F8FAFC';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.strokeStyle = 'rgba(51, 65, 85, 0.1)';
      ctx.lineWidth = 0.5;

      for (let i = 0; i <= WINDOW_WIDTH_MS; i += 200) {
        const x = canvas.width - (i * canvas.width / WINDOW_WIDTH_MS);
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }

      for (let i = 0; i <= 4; i++) {
        const y = (canvas.height / 4) * i;
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

      if (dataRef.current.length > 1) {
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#0ea5e9';
        ctx.beginPath();

        const points = dataRef.current;
        const firstPoint = points[0];
        
        ctx.moveTo(
          canvas.width - ((currentTime - firstPoint.time) * canvas.width / WINDOW_WIDTH_MS),
          canvas.height / 2 + firstPoint.value
        );

        for (let i = 1; i < points.length; i++) {
          const point = points[i];
          const prevPoint = points[i - 1];
          
          const x = canvas.width - ((currentTime - point.time) * canvas.width / WINDOW_WIDTH_MS);
          const y = canvas.height / 2 + point.value;
          
          const prevX = canvas.width - ((currentTime - prevPoint.time) * canvas.width / WINDOW_WIDTH_MS);
          const prevY = canvas.height / 2 + prevPoint.value;
          
          const cpx = (prevX + x) / 2;
          ctx.quadraticCurveTo(prevX, prevY, cpx, (prevY + y) / 2);
        }
        
        ctx.stroke();
      }

      animationFrameRef.current = requestAnimationFrame(drawFrame);
    };

    drawFrame();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [value, isFingerDetected]);

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 flex justify-between items-center bg-white/60 backdrop-blur-sm border-b border-slate-100 shadow-sm">
        <span className="text-xl font-bold text-slate-700">PPG</span>
        <div className="flex flex-col items-center flex-1 mx-4">
          <div className={`h-1.5 w-[80%] rounded-full bg-gradient-to-r ${getQualityColor(quality)} transition-all duration-1000 ease-in-out`}>
            <div
              className="h-full rounded-full bg-white/20 animate-pulse transition-all duration-1000"
              style={{ width: `${quality}%` }}
            />
          </div>
          <span className="text-xs text-center mt-1 font-medium" 
                style={{ color: quality > 60 ? '#0EA5E9' : '#F59E0B' }}>
            {getQualityText(quality)}
          </span>
        </div>
        <div className="flex flex-col items-center">
          <Fingerprint 
            size={48}
            className={`transition-all duration-300 ${
              isFingerDetected 
                ? 'text-green-500'
                : 'text-gray-400'
            }`}
          />
          <span className="text-xs font-medium text-slate-600 text-center mt-1">
            {isFingerDetected ? 'Dedo detectado' : 'Ubique su dedo'}
          </span>
        </div>
      </div>

      <canvas
        ref={canvasRef}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        className="w-full h-[20vh] mt-2"
      />

      <div className="mt-auto">
        <div className="bg-gray-900/30 backdrop-blur-sm p-2 mb-[100px]">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <VitalSign 
              label="FRECUENCIA CARDÍACA"
              value={value || "--"}
              unit="BPM"
            />
            <VitalSign 
              label="SPO2"
              value={quality || "--"}
              unit="%"
            />
            <VitalSign 
              label="PRESIÓN ARTERIAL"
              value="--/--"
              unit="mmHg"
            />
            <VitalSign 
              label="ARRITMIAS"
              value={arrhythmiaStatus || "SIN ARRITMIAS"}
            />
          </div>
        </div>

        <div className="fixed bottom-0 left-0 right-0 h-[80px] grid grid-cols-2 gap-px bg-gray-900">
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
    </div>
  );
};

export default PPGSignalMeter;
