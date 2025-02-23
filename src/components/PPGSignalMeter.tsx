
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
  const [scrollPosition, setScrollPosition] = useState(0);
  
  // Constantes del monitor
  const MAX_TIME = 30000; // 30 segundos
  const CANVAS_WIDTH = 600; // Aumentado para mejor visualización
  const CANVAS_HEIGHT = 200; // Aumentado para mejor visualización
  const PIXELS_PER_SECOND = CANVAS_WIDTH / 6; // 5 segundos visibles en tiempo real
  const GRID_MAJOR = 25; // 25 pixels = 1 segundo (estándar médico)
  const GRID_MINOR = 5;  // 5 pixels = 0.2 segundos
  
  const COLORS = {
    background: '#000000',
    gridMajor: 'rgba(0, 127, 0, 0.5)',
    gridMinor: 'rgba(0, 127, 0, 0.2)',
    signal: '#00ff00',
    peaks: '#ffffff',
    arrhythmia: '#ff00ff',
    text: '#00ff00'
  };

  // Detectar arritmias (mantenemos la lógica existente)
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

  // Dibujar la cuadrícula del monitor
  const drawGrid = (ctx: CanvasRenderingContext2D) => {
    ctx.save();
    
    // Cuadrícula menor
    ctx.beginPath();
    ctx.strokeStyle = COLORS.gridMinor;
    ctx.lineWidth = 0.5;
    
    for (let x = 0; x < CANVAS_WIDTH; x += GRID_MINOR) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, CANVAS_HEIGHT);
    }
    for (let y = 0; y < CANVAS_HEIGHT; y += GRID_MINOR) {
      ctx.moveTo(0, y);
      ctx.lineTo(CANVAS_WIDTH, y);
    }
    ctx.stroke();
    
    // Cuadrícula mayor
    ctx.beginPath();
    ctx.strokeStyle = COLORS.gridMajor;
    ctx.lineWidth = 1;
    
    for (let x = 0; x < CANVAS_WIDTH; x += GRID_MAJOR) {
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

  // Efecto principal de renderizado
  useEffect(() => {
    if (!canvasRef.current || !isFingerDetected) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const currentTime = Date.now();
    const elapsedTime = currentTime - startTime;

    // Agregar nuevo dato si estamos dentro de los 30 segundos
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

    // Dibujar cuadrícula
    drawGrid(ctx);

    if (isComplete) {
      // Modo revisión: mostrar toda la señal con scroll
      const fullData = dataRef.current;
      const minVal = Math.min(...fullData.map(d => d.value));
      const maxVal = Math.max(...fullData.map(d => d.value));
      const range = maxVal - minVal || 1;

      // Ajustar desplazamiento para visualización
      const timeScale = CANVAS_WIDTH / (MAX_TIME / 1000); // pixels por segundo
      const offset = -scrollPosition * timeScale;

      // Dibujar señal
      ctx.beginPath();
      ctx.strokeStyle = COLORS.signal;
      ctx.lineWidth = 2;

      fullData.forEach((point, index) => {
        const x = (point.time / 1000) * timeScale + offset;
        const normalizedY = (point.value - minVal) / range;
        const y = CANVAS_HEIGHT - (normalizedY * CANVAS_HEIGHT * 0.8 + CANVAS_HEIGHT * 0.1);
        
        if (index === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });
      ctx.stroke();

      // Dibujar marcadores
      fullData.forEach(point => {
        if (point.isPeak) {
          const x = (point.time / 1000) * timeScale + offset;
          const normalizedY = (point.value - minVal) / range;
          const y = CANVAS_HEIGHT - (normalizedY * CANVAS_HEIGHT * 0.8 + CANVAS_HEIGHT * 0.1);
          
          if (point.isArrhythmia) {
            // Marcador de arritmia
            ctx.beginPath();
            ctx.arc(x, y, 4, 0, 2 * Math.PI);
            ctx.fillStyle = COLORS.arrhythmia;
            ctx.fill();
            
            ctx.beginPath();
            ctx.moveTo(x, y - 10);
            ctx.lineTo(x, y + 10);
            ctx.strokeStyle = COLORS.arrhythmia;
            ctx.stroke();
          } else {
            // Marcador de pico normal
            ctx.beginPath();
            ctx.arc(x, y, 2, 0, 2 * Math.PI);
            ctx.fillStyle = COLORS.peaks;
            ctx.fill();
          }
        }
      });

      // Dibujar tiempo
      ctx.font = '12px monospace';
      ctx.fillStyle = COLORS.text;
      for (let i = 0; i <= 30; i += 5) {
        const x = (i * timeScale) + offset;
        if (x >= 0 && x <= CANVAS_WIDTH) {
          ctx.fillText(`${i}s`, x, CANVAS_HEIGHT - 5);
        }
      }

      if (onDataReady) {
        onDataReady(dataRef.current);
      }
    } else {
      // Modo tiempo real: mostrar últimos 5 segundos
      const recentData = dataRef.current.slice(-150);
      const minVal = Math.min(...recentData.map(d => d.value));
      const maxVal = Math.max(...recentData.map(d => d.value));
      const range = maxVal - minVal || 1;

      // Dibujar señal en tiempo real
      ctx.beginPath();
      ctx.strokeStyle = COLORS.signal;
      ctx.lineWidth = 2;

      recentData.forEach((point, index) => {
        const x = (index / 150) * CANVAS_WIDTH;
        const normalizedY = (point.value - minVal) / range;
        const y = CANVAS_HEIGHT - (normalizedY * CANVAS_HEIGHT * 0.8 + CANVAS_HEIGHT * 0.1);
        
        if (index === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }

        // Dibujar marcadores en tiempo real
        if (point.isPeak) {
          if (point.isArrhythmia) {
            ctx.save();
            ctx.beginPath();
            ctx.arc(x, y, 4, 0, 2 * Math.PI);
            ctx.fillStyle = COLORS.arrhythmia;
            ctx.fill();
            
            ctx.beginPath();
            ctx.moveTo(x, y - 10);
            ctx.lineTo(x, y + 10);
            ctx.strokeStyle = COLORS.arrhythmia;
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

      // Dibujar línea de tiempo
      const timeProgress = (elapsedTime / MAX_TIME) * CANVAS_WIDTH;
      ctx.strokeStyle = COLORS.text;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(timeProgress, 0);
      ctx.lineTo(timeProgress, CANVAS_HEIGHT);
      ctx.stroke();
      ctx.setLineDash([]);
    }

  }, [value, quality, isFingerDetected, isComplete, startTime, scrollPosition]);

  // Manejar scroll horizontal en modo revisión
  const handleScroll = (e: React.WheelEvent) => {
    if (isComplete) {
      e.preventDefault();
      setScrollPosition(prev => 
        Math.max(0, Math.min(30, prev + e.deltaY / 100))
      );
    }
  };

  return (
    <div className="bg-black/40 backdrop-blur-sm rounded-lg p-4">
      <div className="flex justify-between items-center mb-2">
        <span className="text-sm font-semibold text-green-400">PPG Monitor</span>
        <span 
          className="text-sm font-medium"
          style={{ color: COLORS.text }}
        >
          {isFingerDetected ? (
            isComplete ? 
              'Review Mode - Use scroll to navigate' : 
              `Quality: ${quality}%`
          ) : 'No Signal'}
        </span>
      </div>
      <div 
        className="relative overflow-hidden"
        onWheel={handleScroll}
      >
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          className="w-full h-[200px] rounded bg-black"
        />
      </div>
    </div>
  );
};

export default PPGSignalMeter;
