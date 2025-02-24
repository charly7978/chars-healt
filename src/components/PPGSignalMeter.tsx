
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Progress } from "@/components/ui/progress";
import VitalSign from '@/components/VitalSign';
import { Fingerprint } from 'lucide-react';

interface PPGDataPoint {
  time: number;
  value: number;
  isArrhythmia: boolean;
}

class CircularBuffer {
  private buffer: PPGDataPoint[];
  private maxSize: number;
  private head: number = 0;
  private tail: number = 0;
  private count: number = 0;

  constructor(size: number) {
    this.maxSize = size;
    this.buffer = new Array(size);
  }

  push(point: PPGDataPoint) {
    this.buffer[this.head] = point;
    this.head = (this.head + 1) % this.maxSize;
    if (this.count < this.maxSize) {
      this.count++;
    } else {
      this.tail = (this.tail + 1) % this.maxSize;
    }
  }

  getPoints(): PPGDataPoint[] {
    const points: PPGDataPoint[] = [];
    let current = this.tail;
    for (let i = 0; i < this.count; i++) {
      points.push(this.buffer[current]);
      current = (current + 1) % this.maxSize;
    }
    return points;
  }

  clear() {
    this.head = 0;
    this.tail = 0;
    this.count = 0;
  }
}

interface PPGSignalMeterProps {
  value: number;
  quality: number;
  isFingerDetected: boolean;
  onStartMeasurement: () => void;
  onReset: () => void;
  arrhythmiaStatus?: string;
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
  const dataBufferRef = useRef<CircularBuffer>(new CircularBuffer(1000));
  const baselineRef = useRef<number | null>(null);
  const lastValueRef = useRef<number>(0);
  const WINDOW_WIDTH_MS = 5000;
  const CANVAS_WIDTH = 1000;
  const CANVAS_HEIGHT = 200;
  const verticalScale = 32.0;

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

    const normalizedValue = (value - (baselineRef.current || 0)) * verticalScale;
    const isCurrentArrhythmia = arrhythmiaStatus?.includes('ARRITMIA DETECTADA') || false;
    
    dataBufferRef.current.push({
      time: currentTime,
      value: normalizedValue,
      isArrhythmia: isCurrentArrhythmia
    });

    // Limpiar canvas
    ctx.fillStyle = '#F8FAFC';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Dibujar grid
    ctx.strokeStyle = 'rgba(51, 65, 85, 0.15)';
    ctx.lineWidth = 0.5;
    
    // Dibujar líneas de grid
    for (let i = 0; i < 40; i++) {
      const x = canvas.width - (canvas.width * (i / 40));
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }

    const points = dataBufferRef.current.getPoints();
    
    if (points.length > 1) {
      ctx.lineWidth = 3;
      let lastX = 0;
      let lastY = 0;
      let lastWasArrhythmia = false;
      
      points.forEach((point, index) => {
        const x = canvas.width - ((currentTime - point.time) * canvas.width / WINDOW_WIDTH_MS);
        const y = canvas.height / 2 + point.value;

        if (index === 0) {
          ctx.beginPath();
          ctx.moveTo(x, y);
          lastWasArrhythmia = point.isArrhythmia;
        } else {
          if (point.isArrhythmia !== lastWasArrhythmia) {
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(lastX, lastY);
          }
          
          ctx.strokeStyle = point.isArrhythmia ? '#FF2E2E' : '#0ea5e9';
          ctx.lineTo(x, y);
          lastWasArrhythmia = point.isArrhythmia;
        }

        lastX = x;
        lastY = y;
      });

      ctx.stroke();
    }

  }, [value, quality, isFingerDetected, arrhythmiaStatus]);

  const handleReset = useCallback(() => {
    dataBufferRef.current.clear();
    baselineRef.current = null;
    lastValueRef.current = 0;
    onReset();
  }, [onReset]);

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
          onClick={handleReset}
          className="w-full h-full bg-white/80 hover:bg-slate-50/80 text-xl font-bold text-slate-700 transition-all duration-300"
        >
          RESET
        </button>
      </div>
    </div>
  );
};

export default PPGSignalMeter;
