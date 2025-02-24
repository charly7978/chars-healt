
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
  const [startTime, setStartTime] = useState<number>(Date.now());
  const WINDOW_WIDTH_MS = 2000;
  const CANVAS_WIDTH = 1000;
  const CANVAS_HEIGHT = 200;
  const verticalScale = 32.0;
  const baselineRef = useRef<number | null>(null);
  const maxAmplitudeRef = useRef<number>(0);
  const lastValueRef = useRef<number>(0);
  const lastArrhythmiaRef = useRef<boolean>(false);

  const handleReset = () => {
    dataRef.current = [];
    baselineRef.current = null;
    maxAmplitudeRef.current = 0;
    lastValueRef.current = 0;
    lastArrhythmiaRef.current = false;
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
    
    dataRef.current.push({
      time: currentTime,
      value: normalizedValue,
      isWaveStart,
      isArrhythmia: false
    });

    const cutoffTime = currentTime - WINDOW_WIDTH_MS;
    dataRef.current = dataRef.current.filter(point => point.time >= cutoffTime);

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

    if (dataRef.current.length > 1) {
      ctx.lineWidth = 3;
      
      let waveStartIndex = 0;

      dataRef.current.forEach((point, index) => {
        if (point.isWaveStart || index === dataRef.current.length - 1) {
          if (index > waveStartIndex) {
            ctx.beginPath();
            ctx.strokeStyle = '#0ea5e9';
            
            const startPoint = dataRef.current[waveStartIndex];
            ctx.moveTo(
              canvas.width - ((currentTime - startPoint.time) * canvas.width / WINDOW_WIDTH_MS),
              canvas.height / 2 + startPoint.value
            );

            for (let i = waveStartIndex + 1; i <= index; i++) {
              const p = dataRef.current[i];
              ctx.lineTo(
                canvas.width - ((currentTime - p.time) * canvas.width / WINDOW_WIDTH_MS),
                canvas.height / 2 + p.value
              );
            }
            
            ctx.stroke();
          }
          waveStartIndex = index;
        }
      });
    }

  }, [value, quality, isFingerDetected, arrhythmiaStatus]);

  return (
    <div className="fixed inset-0 bg-gradient-to-b from-white to-slate-50/30">
      <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center bg-white/60 backdrop-blur-sm border-b border-slate-100 shadow-sm">
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
        className="w-full h-[calc(40vh)] mt-20"
      />

      <div className="fixed bottom-0 left-0 right-0">
        <div className="bg-gray-900/30 backdrop-blur-sm p-4 mb-[80px]">
          <div className="grid grid-cols-2 gap-4">
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
          </div>
        </div>
        
        <div className="h-[80px] grid grid-cols-2 gap-px bg-gray-900">
          <button 
            onClick={onStartMeasurement}
            className="w-full h-full bg-white/80 hover:bg-slate-50/80 text-xl font-bold text-slate-700 transition-all duration-300"
          >
            INICIAR
          </button>
          <button 
            onClick={handleReset}
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
