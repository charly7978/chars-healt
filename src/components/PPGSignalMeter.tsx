
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
  const dataRef = useRef<{time: number, value: number, isPeak: boolean}[]>([]);
  const [startTime] = useState<number>(Date.now());
  const animationFrameRef = useRef<number>();
  const [scrollPosition, setScrollPosition] = useState(0);
  
  const CANVAS_WIDTH = 320;
  const CANVAS_HEIGHT = 160;
  const MAX_POINTS = 450; // 30 segundos a 15 muestras por segundo
  const VISIBLE_POINTS = 150; // 10 segundos visibles

  const render = () => {
    if (!canvasRef.current || !isFingerDetected) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Agregar el valor RAW directo del sensor
    dataRef.current.push({
      time: Date.now() - startTime,
      value: value,
      isPeak: quality > 75
    });

    // Mantener 30 segundos de datos
    if (dataRef.current.length > MAX_POINTS) {
      if (onDataReady) {
        onDataReady(dataRef.current);
      }
      dataRef.current.shift();
    }

    // Limpiar canvas
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Grid de fondo (estilo ECG)
    ctx.strokeStyle = '#003300';
    ctx.lineWidth = 0.5;
    const gridSize = 20;
    
    for (let x = 0; x < CANVAS_WIDTH; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, CANVAS_HEIGHT);
      ctx.stroke();
    }
    for (let y = 0; y < CANVAS_HEIGHT; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(CANVAS_WIDTH, y);
      ctx.stroke();
    }

    // Dibujar señal PPG con desplazamiento
    if (dataRef.current.length > 1) {
      const startIdx = Math.max(0, dataRef.current.length - VISIBLE_POINTS - Math.floor(scrollPosition));
      const visibleData = dataRef.current.slice(startIdx, startIdx + VISIBLE_POINTS);

      // Dibujar la señal PPG
      ctx.beginPath();
      ctx.strokeStyle = '#00FF00';
      ctx.lineWidth = 2;

      visibleData.forEach((point, index) => {
        const x = (index / VISIBLE_POINTS) * CANVAS_WIDTH;
        const y = CANVAS_HEIGHT - (point.value * CANVAS_HEIGHT);
        
        if (index === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }

        // Marcar picos con círculos blancos
        if (point.isPeak) {
          ctx.save();
          ctx.fillStyle = '#FFFFFF';
          ctx.beginPath();
          ctx.arc(x, y, 3, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      });
      ctx.stroke();
    }

    if (!isComplete) {
      animationFrameRef.current = requestAnimationFrame(render);
    }
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

  // Habilitar scroll horizontal cuando la medición está completa
  const handleScroll = (e: React.WheelEvent) => {
    if (isComplete && dataRef.current.length > VISIBLE_POINTS) {
      setScrollPosition(prev => {
        const newPos = prev + e.deltaY;
        const maxScroll = dataRef.current.length - VISIBLE_POINTS;
        return Math.max(0, Math.min(newPos, maxScroll));
      });
    }
  };

  return (
    <div className="bg-black/90 backdrop-blur rounded-lg p-3 border border-green-900">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${isFingerDetected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
          <span className="text-xs font-medium text-green-400">
            {isFingerDetected ? `Monitor PPG - ${quality}% Calidad` : 'Sin Señal'}
          </span>
        </div>
        {isComplete && (
          <span className="text-xs text-green-400">
            Scroll para revisar señal
          </span>
        )}
      </div>
      <div 
        className="relative" 
        onWheel={handleScroll}
      >
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          className="w-full rounded bg-black"
        />
      </div>
    </div>
  );
};

export default PPGSignalMeter;
