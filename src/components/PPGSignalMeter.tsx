
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
  
  // Constantes mejoradas
  const MAX_TIME = 30000; // 30 segundos
  const CANVAS_WIDTH = 800;
  const CANVAS_HEIGHT = 300;
  const SCROLL_SPEED = 50; // pixels por segundo
  const GRID_MAJOR = 25;
  const GRID_MINOR = 5;

  const COLORS = {
    background: '#001100',
    gridMajor: 'rgba(0, 255, 0, 0.3)',
    gridMinor: 'rgba(0, 255, 0, 0.1)',
    signal: '#00ff00',
    peaks: '#ffffff',
    arrhythmia: '#ff00ff',
    text: '#00ff00'
  };

  // Detectar arritmias
  const detectArrhythmia = (currentTime: number, previousPeaks: {time: number}[]) => {
    if (previousPeaks.length < 2) return false;
    
    const recentIntervals = previousPeaks.slice(-3).map((peak, i, arr) => {
      if (i === 0) return null;
      return arr[i].time - arr[i-1].time;
    }).filter((interval): interval is number => interval !== null);

    if (recentIntervals.length < 2) return false;

    const avgInterval = recentIntervals.reduce((a, b) => a + b, 0) / recentIntervals.length;
    const variation = Math.abs(recentIntervals[recentIntervals.length - 1] - avgInterval);
    
    return variation > (avgInterval * 0.3);
  };

  // Dibujar grid profesional
  const drawGrid = (ctx: CanvasRenderingContext2D, offset: number = 0) => {
    ctx.save();
    
    // Grid menor (1mm)
    ctx.beginPath();
    ctx.strokeStyle = COLORS.gridMinor;
    ctx.lineWidth = 0.5;
    
    for (let x = offset % GRID_MINOR; x < CANVAS_WIDTH; x += GRID_MINOR) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, CANVAS_HEIGHT);
    }
    for (let y = 0; y < CANVAS_HEIGHT; y += GRID_MINOR) {
      ctx.moveTo(0, y);
      ctx.lineTo(CANVAS_WIDTH, y);
    }
    ctx.stroke();
    
    // Grid mayor (5mm)
    ctx.beginPath();
    ctx.strokeStyle = COLORS.gridMajor;
    ctx.lineWidth = 1;
    
    for (let x = offset % GRID_MAJOR; x < CANVAS_WIDTH; x += GRID_MAJOR) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, CANVAS_HEIGHT);
    }
    for (let y = 0; y < CANVAS_HEIGHT; y += GRID_MAJOR) {
      ctx.moveTo(0, y);
      ctx.lineTo(CANVAS_WIDTH, y);
    }
    ctx.stroke();
    
    ctx.restore();
  };

  // Renderizado principal
  const render = () => {
    if (!canvasRef.current || !isFingerDetected) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const currentTime = Date.now();
    const elapsedTime = currentTime - startTime;

    // Agregar nuevo dato
    if (elapsedTime <= MAX_TIME) {
      const previousPeaks = dataRef.current.filter(d => d.isPeak);
      const isArrhythmia = quality > 75 && detectArrhythmia(elapsedTime, previousPeaks);
      
      dataRef.current.push({
        time: elapsedTime,
        value: value,
        isPeak: quality > 75,
        isArrhythmia
      });
    }

    // Limpiar canvas
    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Ajustar visualización según modo
    if (isComplete) {
      // Modo revisión
      if (onDataReady) {
        onDataReady(dataRef.current);
      }
    } else {
      // Modo tiempo real con scroll suave
      const offset = (elapsedTime * SCROLL_SPEED / 1000) % CANVAS_WIDTH;
      drawGrid(ctx, offset);

      const recentData = dataRef.current.slice(-200);
      const minVal = Math.min(...recentData.map(d => d.value));
      const maxVal = Math.max(...recentData.map(d => d.value));
      const range = maxVal - minVal || 1;

      // Dibujar señal con antialiasing y suavizado
      ctx.beginPath();
      ctx.strokeStyle = COLORS.signal;
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';

      recentData.forEach((point, index) => {
        const x = ((index / recentData.length) * CANVAS_WIDTH - offset + CANVAS_WIDTH) % CANVAS_WIDTH;
        const normalizedY = (point.value - minVal) / range;
        const y = CANVAS_HEIGHT - (normalizedY * CANVAS_HEIGHT * 0.8 + CANVAS_HEIGHT * 0.1);
        
        if (index === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }

        // Marcadores mejorados
        if (point.isPeak) {
          if (point.isArrhythmia) {
            ctx.save();
            ctx.beginPath();
            ctx.arc(x, y, 4, 0, 2 * Math.PI);
            ctx.fillStyle = COLORS.arrhythmia;
            ctx.fill();
            ctx.strokeStyle = COLORS.arrhythmia;
            ctx.lineWidth = 1;
            ctx.moveTo(x, y - 10);
            ctx.lineTo(x, y + 10);
            ctx.stroke();
            ctx.restore();
          } else {
            ctx.save();
            ctx.beginPath();
            ctx.arc(x, y, 2, 0, 2 * Math.PI);
            ctx.fillStyle = COLORS.peaks;
            ctx.fill();
            ctx.restore();
          }
        }
      });
      ctx.stroke();

      // Línea de referencia
      ctx.strokeStyle = COLORS.text;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(CANVAS_WIDTH - 50, 0);
      ctx.lineTo(CANVAS_WIDTH - 50, CANVAS_HEIGHT);
      ctx.stroke();
      ctx.setLineDash([]);

      // Continuar animación
      animationFrameRef.current = requestAnimationFrame(render);
    }
  };

  // Iniciar/detener renderizado
  useEffect(() => {
    if (isFingerDetected && !isComplete) {
      animationFrameRef.current = requestAnimationFrame(render);
    }
    
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isFingerDetected, isComplete, value, quality]);

  return (
    <div className="bg-[#001100]/90 backdrop-blur-sm rounded-lg p-4 border border-green-900">
      <div className="flex justify-between items-center mb-2">
        <span className="text-sm font-semibold text-green-400">PPG Monitor</span>
        <span className="text-sm font-medium text-green-400">
          {isFingerDetected ? (
            isComplete ? 
              'Recording Complete' : 
              `Signal Quality: ${quality}%`
          ) : 'Place finger on camera'}
        </span>
      </div>
      <div className="relative overflow-hidden">
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          className="w-full h-[300px] rounded bg-[#001100]"
        />
      </div>
    </div>
  );
};

export default PPGSignalMeter;
