
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
  
  // Dimensiones compactas
  const CANVAS_WIDTH = 320;
  const CANVAS_HEIGHT = 160;
  const MAX_DATA_POINTS = 100;

  const render = () => {
    if (!canvasRef.current || !isFingerDetected) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Agregar nuevo dato
    dataRef.current.push({
      time: Date.now() - startTime,
      value,
      isPeak: quality > 75
    });

    // Mantener solo los últimos N puntos
    if (dataRef.current.length > MAX_DATA_POINTS) {
      dataRef.current.shift();
    }

    // Limpiar canvas
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Dibujar línea base (centro)
    ctx.strokeStyle = '#113311';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, CANVAS_HEIGHT / 2);
    ctx.lineTo(CANVAS_WIDTH, CANVAS_HEIGHT / 2);
    ctx.stroke();

    // Dibujar señal PPG
    if (dataRef.current.length > 1) {
      const recentData = dataRef.current.slice(-MAX_DATA_POINTS);
      
      // Normalizar valores
      const values = recentData.map(d => d.value);
      const min = Math.min(...values);
      const max = Math.max(...values);
      const range = max - min || 1;

      // Dibujar línea principal
      ctx.beginPath();
      ctx.strokeStyle = '#00FF00';
      ctx.lineWidth = 2;

      recentData.forEach((point, index) => {
        const x = (index / MAX_DATA_POINTS) * CANVAS_WIDTH;
        const normalizedValue = (point.value - min) / range;
        const y = CANVAS_HEIGHT - (normalizedValue * CANVAS_HEIGHT * 0.8 + CANVAS_HEIGHT * 0.1);

        if (index === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }

        // Marcar picos
        if (point.isPeak) {
          ctx.save();
          ctx.beginPath();
          ctx.fillStyle = '#FFFFFF';
          ctx.arc(x, y, 2, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      });
      ctx.stroke();

      // Mostrar escala de tiempo
      ctx.fillStyle = '#00FF00';
      ctx.font = '10px monospace';
      ctx.fillText('0s', CANVAS_WIDTH - 20, CANVAS_HEIGHT - 5);
      ctx.fillText('3s', 0, CANVAS_HEIGHT - 5);
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
            {isFingerDetected ? (
              quality > 75 ? 'Señal Óptima' :
              quality > 50 ? 'Señal Aceptable' :
              'Señal Débil'
            ) : 'Sin Señal'}
          </span>
        </div>
        <span className="text-xs text-green-400">
          {quality}%
        </span>
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
              Ajuste la posición del dedo
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export default PPGSignalMeter;
