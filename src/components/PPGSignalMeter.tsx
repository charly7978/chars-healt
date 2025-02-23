
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
  
  const CANVAS_WIDTH = 320;
  const CANVAS_HEIGHT = 160;
  const MAX_POINTS = 100;

  const render = () => {
    if (!canvasRef.current || !isFingerDetected) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Agregar el valor RAW directo del sensor
    dataRef.current.push({
      time: Date.now() - startTime,
      value: value, // Valor directo sin modificar
      isPeak: quality > 75
    });

    if (dataRef.current.length > MAX_POINTS) {
      dataRef.current.shift();
    }

    // Limpiar canvas
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Dibujar SOLO la señal RAW
    if (dataRef.current.length > 1) {
      ctx.beginPath();
      ctx.strokeStyle = '#00FF00';
      ctx.lineWidth = 2;

      dataRef.current.forEach((point, index) => {
        const x = (index / MAX_POINTS) * CANVAS_WIDTH;
        // Usamos el valor directo del sensor, solo ajustado a la altura del canvas
        const y = CANVAS_HEIGHT - (point.value * CANVAS_HEIGHT);
        
        if (index === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });
      ctx.stroke();
    }

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
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${isFingerDetected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
          <span className="text-xs font-medium text-green-400">
            {isFingerDetected ? 'Señal PPG RAW' : 'Sin Señal'}
          </span>
        </div>
      </div>
      <div className="relative">
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
