import React, { useEffect, useRef, useState } from 'react';
import { Fingerprint } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { CircularProgress } from "@/components/ui/circular-progress";
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
  visualAmplitude = 0
}: PPGSignalMeterProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [startTime, setStartTime] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const bufferRef = useRef(new CircularBuffer(150));
  const frameRef = useRef(0);
  
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
    }
  };

  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (isRecording) {
      interval = setInterval(() => {
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
    
    const point: PPGDataPoint = {
      time: Date.now(),
      value: visualAmplitude > 0 ? visualAmplitude : value,
      isArrhythmia: arrhythmiaDetected
    };
    
    bufferRef.current.push(point);
    
    drawWaveform();
    
    if (isDicroticPoint) {
      drawPointMarker(point);
    }
    
  }, [value, isRecording, arrhythmiaStatus, isDicroticPoint, visualAmplitude]);

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
      const y = yMiddle - (points[i].value * yScale);
      
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
    const y = yMiddle - (point.value * yScale);
    
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
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
    ctx.moveTo(0, height/2);
    ctx.lineTo(width, height/2);
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
          <CircularProgress 
            value={quality} 
            max={100} 
            className="w-6 h-6" 
            strokeWidth={3}
            color={quality > 50 ? "#10B981" : quality > 20 ? "#F59E0B" : "#EF4444"}
          />
          <span className="text-xs font-medium">
            {quality > 70 ? "Excelente" : 
             quality > 40 ? "Buena" : 
             quality > 20 ? "Regular" : "Baja"}
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
