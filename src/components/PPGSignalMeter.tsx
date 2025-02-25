
import React, { useEffect, useRef } from 'react';
import { Fingerprint } from 'lucide-react';

interface PPGDataPoint {
  value: number;
  quality: number;
  timestamp: number;
  time?: number;
  isArrhythmia?: boolean;
}

class CircularBuffer<T> {
  private buffer: T[];
  private size: number;
  private currentIndex: number = 0;
  private isFull: boolean = false;

  constructor(size: number) {
    this.size = size;
    this.buffer = new Array<T>(size);
  }

  push(item: T): void {
    this.buffer[this.currentIndex] = item;
    this.currentIndex = (this.currentIndex + 1) % this.size;
    if (this.currentIndex === 0) {
      this.isFull = true;
    }
  }

  getPoints(): T[] {
    if (!this.isFull) {
      return this.buffer.slice(0, this.currentIndex);
    }
    return [...this.buffer.slice(this.currentIndex), ...this.buffer.slice(0, this.currentIndex)];
  }
}

interface PPGSignalMeterProps {
  value: number;
  quality: number;
  isFingerDetected: boolean;
  onStartMeasurement: () => void;
  onReset: () => void;
  arrhythmiaStatus: string;
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
}: PPGSignalMeterProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dataBuffer = useRef<CircularBuffer<PPGDataPoint>>(new CircularBuffer<PPGDataPoint>(100));
  const baselineRef = useRef<number | null>(null);
  const lastValueRef = useRef<number>(0);

  const WINDOW_WIDTH_MS = 5000;
  const CANVAS_WIDTH = 1000;
  const CANVAS_HEIGHT = 200;
  const verticalScale = 32.0;

  const handleReset = () => {
    dataBuffer.current = new CircularBuffer<PPGDataPoint>(100);
    baselineRef.current = null;
    lastValueRef.current = 0;
    onReset();
  };

  const getQualityColor = (quality: number): string => {
    if (quality > 90) return 'from-emerald-500/80 to-emerald-400/80';
    if (quality > 75) return 'from-sky-500/80 to-sky-400/80';
    if (quality > 60) return 'from-indigo-500/80 to-indigo-400/80';
    if (quality > 40) return 'from-amber-500/80 to-amber-400/80';
    return 'from-red-500/80 to-red-400/80';
  };

  const getQualityText = (quality: number): string => {
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
      baselineRef.current = baselineRef.current * 0.95 + value * 0.05;
    }

    const normalizedValue = (value - (baselineRef.current ?? 0)) * verticalScale;
    const isWaveStart = lastValueRef.current < 0 && normalizedValue >= 0;
    lastValueRef.current = normalizedValue;
    
    const newPoint: PPGDataPoint = {
      value: normalizedValue,
      quality,
      timestamp: currentTime,
      time: currentTime,
      isArrhythmia: false
    };
    
    dataBuffer.current.push(newPoint);

    // Drawing logic
    ctx.fillStyle = '#F8FAFC';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const points = dataBuffer.current.getPoints();
    if (points.length > 1) {
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#0ea5e9';
      ctx.beginPath();

      points.forEach((point: PPGDataPoint, index: number) => {
        const x = canvas.width - ((currentTime - point.timestamp) * canvas.width / WINDOW_WIDTH_MS);
        const y = canvas.height / 2 + point.value;

        if (index === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });

      ctx.stroke();
    }

  }, [value, quality, isFingerDetected, arrhythmiaStatus]);

  return (
    <div className="fixed inset-0 bg-gradient-to-b from-white to-slate-50/30">
      <div className="absolute top-0 left-0 right-0 p-2 flex justify-between items-center bg-white/60 backdrop-blur-sm border-b border-slate-100 shadow-sm">
        <div className="flex items-center gap-3 flex-1">
          <span className="text-xl font-bold text-slate-700">PPG</span>
          <div className="flex flex-col flex-1">
            <div className={`h-1.5 w-[80%] mx-auto rounded-full bg-gradient-to-r ${getQualityColor(quality)} transition-all duration-1000 ease-in-out`}>
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
          
          <div className="flex flex-col items-center">
            <Fingerprint 
              size={56}
              className={`transition-all duration-700 ${
                isFingerDetected 
                  ? 'text-emerald-500 scale-100 drop-shadow-md'
                  : 'text-slate-300 scale-95'
              }`}
            />
            <span className="text-xs font-medium text-slate-600 transition-all duration-700">
              {isFingerDetected ? 'Dedo detectado' : 'Ubique su dedo en el lente'}
            </span>
          </div>
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
