
import React, { useEffect, useRef, useState } from 'react';

interface PPGSignalMeterProps {
  value: number;
  quality: number;
  isFingerDetected: boolean;
  isComplete?: boolean;
  onDataReady?: (data: Array<{time: number, value: number, isPeak: boolean}>) => void;
}

const PPGSignalMeter = ({ 
  value, 
  quality, 
  isFingerDetected, 
  isComplete,
  onDataReady 
}: PPGSignalMeterProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dataRef = useRef<{time: number, value: number, isPeak: boolean, isArrhythmia?: boolean}[]>([]);
  const [startTime] = useState<number>(Date.now());
  const animationFrameRef = useRef<number>();
  
  // Dimensiones más compactas
  const CANVAS_WIDTH = 320;
  const CANVAS_HEIGHT = 160;
  const SCROLL_SPEED = 30;
  const MAX_TIME = 30000;

  // Colores mejorados para mejor visibilidad
  const COLORS = {
    background: '#000000',
    grid: '#0A2A0A',
    signal: '#00FF00',
    peaks: '#FFFFFF',
    arrhythmia: '#FF00FF',
    text: '#00FF00'
  };

  const detectArrhythmia = (currentTime: number, previousPeaks: {time: number}[]) => {
    if (previousPeaks.length < 3) return false;
    
    const intervals = previousPeaks.slice(-3).map((peak, i, arr) => {
      if (i === 0) return null;
      return arr[i].time - arr[i-1].time;
    }).filter((interval): interval is number => interval !== null);

    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const lastInterval = intervals[intervals.length - 1];
    
    return Math.abs(lastInterval - avgInterval) > (avgInterval * 0.3);
  };

  const render = () => {
    if (!canvasRef.current || !isFingerDetected) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const currentTime = Date.now();
    const elapsedTime = currentTime - startTime;

    // Agregar nuevo dato con detección de arritmia
    if (elapsedTime <= MAX_TIME) {
      const previousPeaks = dataRef.current.filter(d => d.isPeak);
      const isArrhythmia = quality > 75 && detectArrhythmia(elapsedTime, previousPeaks);
      
      dataRef.current.push({
        time: elapsedTime,
        value,
        isPeak: quality > 75,
        isArrhythmia
      });
    }

    // Limpiar canvas
    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Grid simple pero efectivo
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 0.5;
    for (let i = 0; i < CANVAS_WIDTH; i += 20) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, CANVAS_HEIGHT);
      ctx.stroke();
    }
    for (let i = 0; i < CANVAS_HEIGHT; i += 20) {
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(CANVAS_WIDTH, i);
      ctx.stroke();
    }

    // Obtener datos recientes
    const recentData = dataRef.current.slice(-100);
    if (recentData.length < 2) return;

    const minVal = Math.min(...recentData.map(d => d.value));
    const maxVal = Math.max(...recentData.map(d => d.value));
    const range = maxVal - minVal || 1;

    // Calcular offset para scroll
    const timeOffset = elapsedTime * SCROLL_SPEED / 1000;

    // Dibujar señal
    ctx.beginPath();
    ctx.strokeStyle = COLORS.signal;
    ctx.lineWidth = 1.5;

    recentData.forEach((point, index) => {
      const x = (index * (CANVAS_WIDTH / 100) - timeOffset % (CANVAS_WIDTH / 2) + CANVAS_WIDTH) % CANVAS_WIDTH;
      const y = CANVAS_HEIGHT - ((point.value - minVal) / range * (CANVAS_HEIGHT * 0.8) + CANVAS_HEIGHT * 0.1);

      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }

      // Marcar picos y arritmias
      if (point.isPeak) {
        if (point.isArrhythmia) {
          // Marca de arritmia prominente
          ctx.save();
          ctx.strokeStyle = COLORS.arrhythmia;
          ctx.fillStyle = COLORS.arrhythmia;
          ctx.lineWidth = 2;
          
          // Triángulo de advertencia
          ctx.beginPath();
          ctx.moveTo(x, y - 10);
          ctx.lineTo(x - 5, y);
          ctx.lineTo(x + 5, y);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          
          // Punto central
          ctx.beginPath();
          ctx.arc(x, y, 3, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        } else {
          // Marca de pico normal
          ctx.save();
          ctx.fillStyle = COLORS.peaks;
          ctx.beginPath();
          ctx.arc(x, y, 2, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }
    });
    ctx.stroke();

    // Línea de referencia
    ctx.strokeStyle = COLORS.signal;
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    ctx.moveTo(CANVAS_WIDTH - 30, 0);
    ctx.lineTo(CANVAS_WIDTH - 30, CANVAS_HEIGHT);
    ctx.stroke();
    ctx.setLineDash([]);

    animationFrameRef.current = requestAnimationFrame(render);
  };

  useEffect(() => {
    if (isFingerDetected && !isComplete) {
      animationFrameRef.current = requestAnimationFrame(render);
    }
    
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isFingerDetected, isComplete]);

  return (
    <div className="bg-black/90 backdrop-blur rounded-lg p-3 border border-green-900">
      <div className="flex justify-between items-center mb-2">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${isFingerDetected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
          <span className="text-xs font-medium text-green-400">
            {isFingerDetected ? `Quality: ${quality}%` : 'No Signal'}
          </span>
        </div>
        {isComplete && (
          <span className="text-xs text-green-400">Recording Complete</span>
        )}
      </div>
      <div className="relative">
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          className="w-full rounded bg-black"
        />
        {quality < 50 && isFingerDetected && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-xs text-yellow-400 bg-black/50 px-2 py-1 rounded">
              Adjust finger position
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export default PPGSignalMeter;
