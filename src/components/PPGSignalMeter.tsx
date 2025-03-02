
import React, { useEffect, useRef, useState } from 'react';
import { Button } from "@/components/ui/button";
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
  isDicroticPoint?: boolean;
  visualAmplitude?: number;
  isSystolicPeak?: boolean;
}

const PPGSignalMeter = ({ 
  value, 
  quality, 
  isFingerDetected,
  onStartMeasurement,
  onReset,
  arrhythmiaStatus,
  rawArrhythmiaData,
  isDicroticPoint = false,
  visualAmplitude = 0,
  isSystolicPeak = false
}: PPGSignalMeterProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [startTime, setStartTime] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const bufferRef = useRef(new CircularBuffer(150));
  const frameRef = useRef(0);
  const lastProcessedPeakTimeRef = useRef(0);
  const currentWaveMaxRef = useRef<PPGDataPoint | null>(null);
  const lastCircleDrawTimeRef = useRef(0);
  const lastValueRef = useRef(0);
  const risingEdgeDetectedRef = useRef(false);

  const colors = {
    waveform: '#0EA5E9',
    background: 'rgba(0, 0, 0, 0.9)',
    grid: 'rgba(255, 255, 255, 0.1)',
    text: 'rgba(255, 255, 255, 0.8)',
    noSignal: '#6B7280',
    arrhythmia: '#DC2626'
  };

  const toggleRecording = () => {
    if (isRecording) {
      setIsRecording(false);
      onReset();
    } else {
      setIsRecording(true);
      setStartTime(Date.now());
      onStartMeasurement();
      bufferRef.current.clear();
      lastProcessedPeakTimeRef.current = 0;
      currentWaveMaxRef.current = null;
      lastCircleDrawTimeRef.current = 0;
      lastValueRef.current = 0;
      risingEdgeDetectedRef.current = false;
    }
  };

  useEffect(() => {
    let interval: number;
    if (isRecording) {
      interval = window.setInterval(() => {
        setElapsedTime(Math.floor((Date.now() - startTime) / 1000));
      }, 1000);
    } else {
      setElapsedTime(0);
    }
    return () => {
      clearInterval(interval);
    };
  }, [isRecording, startTime]);

  useEffect(() => {
    if (!isRecording) return;
    
    const arrhythmiaDetected = arrhythmiaStatus?.includes('ARRITMIA DETECTADA') || false;
    const currentTime = Date.now();
    const displayValue = visualAmplitude > 0 ? visualAmplitude : value;
    
    const point: PPGDataPoint = {
      time: currentTime,
      value: displayValue,
      isArrhythmia: arrhythmiaDetected
    };
    
    bufferRef.current.push(point);
    drawWaveform();
    
    if (displayValue > lastValueRef.current && !risingEdgeDetectedRef.current) {
      risingEdgeDetectedRef.current = true;
      currentWaveMaxRef.current = null;
    }
    
    if (risingEdgeDetectedRef.current) {
      if (!currentWaveMaxRef.current || displayValue > currentWaveMaxRef.current.value) {
        currentWaveMaxRef.current = point;
      }
      
      if (displayValue < lastValueRef.current && currentWaveMaxRef.current && 
          currentTime - lastCircleDrawTimeRef.current > 300) {
        drawPointMarker(currentWaveMaxRef.current);
        lastCircleDrawTimeRef.current = currentTime;
        risingEdgeDetectedRef.current = false;
      }
    }
    
    lastValueRef.current = displayValue;
  }, [value, isRecording, arrhythmiaStatus, isDicroticPoint, visualAmplitude, isSystolicPeak]);

  const drawWaveform = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = colors.background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    drawGrid(ctx, canvas.width, canvas.height);
    
    const points = bufferRef.current.getPoints();
    if (points.length < 2) return;
    
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.strokeStyle = isFingerDetected ? colors.waveform : colors.noSignal;
    
    const xStep = canvas.width / 150;
    const yMiddle = canvas.height / 2;
    const yScale = canvas.height * 0.4;
    
    ctx.beginPath();
    for (let i = 0; i < points.length; i++) {
      const x = i * xStep;
      const y = yMiddle - points[i].value * yScale;
      
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
  };

  const drawPointMarker = (point: PPGDataPoint) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const points = bufferRef.current.getPoints();
    const pointIndex = points.findIndex(p => p.time === point.time);
    if (pointIndex < 0) return;
    
    const xStep = canvas.width / 150;
    const yMiddle = canvas.height / 2;
    const yScale = canvas.height * 0.4;
    
    const x = pointIndex * xStep;
    const y = yMiddle - point.value * yScale;
    
    ctx.beginPath();
    ctx.arc(x, y, 12, 0, Math.PI * 2);
    ctx.fillStyle = point.isArrhythmia ? 'rgba(220, 38, 38, 0.3)' : 'rgba(14, 165, 233, 0.2)';
    ctx.fill();
    
    ctx.beginPath();
    ctx.arc(x, y, 8, 0, Math.PI * 2);
    ctx.fillStyle = point.isArrhythmia ? 'rgba(220, 38, 38, 0.7)' : 'rgba(14, 165, 233, 0.5)';
    ctx.fill();
    
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fillStyle = point.isArrhythmia ? colors.arrhythmia : colors.waveform;
    ctx.fill();
    
    ctx.beginPath();
    ctx.arc(x, y, 2, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.fill();
  };

  const drawGrid = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    ctx.strokeStyle = colors.grid;
    ctx.lineWidth = 1;
    
    const vStep = width / 10;
    for (let x = 0; x <= width; x += vStep) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    
    const hStep = height / 6;
    for (let y = 0; y <= height; y += hStep) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();
  };

  return (
    <div className="flex flex-col gap-1 p-4 overflow-hidden">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-medium">
          {isRecording ? (
            <span className="text-indigo-500">Registrando: {elapsedTime}s</span>
          ) : (
            <span>Listo para medir</span>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 relative rounded-full overflow-hidden">
            <svg viewBox="0 0 100 100" className="w-full h-full rotate-[-90deg]">
              <circle 
                cx="50" cy="50" r="45" 
                stroke="#334155" 
                strokeWidth="10" 
                fill="none" 
              />
              <circle 
                cx="50" cy="50" r="45" 
                stroke={quality > 50 ? "#10B981" : quality > 20 ? "#F59E0B" : "#EF4444"} 
                strokeWidth="10" 
                fill="none" 
                strokeDasharray="282.7"
                strokeDashoffset={282.7 - (282.7 * quality / 100)}
              />
            </svg>
          </div>
          <span className="text-xs font-medium">
            {quality > 70 ? "Excelente" : quality > 40 ? "Buena" : quality > 20 ? "Regular" : "Baja"}
          </span>
        </div>
      </div>

      <div className="relative w-full h-24 bg-black/90 rounded-xl overflow-hidden">
        <canvas
          ref={canvasRef}
          width={300}
          height={96}
          className="w-full h-full"
        />
        
        {!isFingerDetected && !isRecording && (
          <div className="absolute inset-0 flex items-center justify-center text-white/80 text-xs font-medium">
            Coloque su dedo en la cámara
          </div>
        )}
      </div>

      <div className="flex justify-between items-center mt-3">
        <div className="text-xs font-medium">
          {arrhythmiaStatus && (
            <span className={arrhythmiaStatus.includes('ARRITMIA') ? 'text-red-500' : 'text-indigo-500'}>
              {arrhythmiaStatus.split('|')[0]}
            </span>
          )}
        </div>
        
        <Button
          onClick={toggleRecording}
          variant={isRecording ? "destructive" : "default"}
          size="sm"
          disabled={!isFingerDetected && !isRecording}
          className="px-3 py-1 h-8 text-xs font-medium"
        >
          {isRecording ? "Detener" : "Iniciar"}
        </Button>
      </div>
    </div>
  );
};

export default React.memo(PPGSignalMeter);
