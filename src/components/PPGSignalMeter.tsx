
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
  const MAX_TIME = 30000; // 30 segundos
  const CANVAS_WIDTH = 400;
  const CANVAS_HEIGHT = 100;
  const GRID_COLOR = 'rgba(255, 255, 255, 0.1)';
  const SIGNAL_COLORS = {
    high: '#00ff00',
    medium: '#ffff00',
    low: '#ff0000',
    inactive: '#666666'
  };

  useEffect(() => {
    if (!canvasRef.current || !isFingerDetected) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const currentTime = Date.now();
    const elapsedTime = currentTime - startTime;

    // Solo agregamos datos si no hemos superado los 30 segundos
    if (elapsedTime <= MAX_TIME) {
      dataRef.current.push({
        time: elapsedTime,
        value: value,
        isPeak: quality > 75
      });
    }

    // Limpiar canvas
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Dibujar grid vertical (líneas de tiempo)
    ctx.strokeStyle = GRID_COLOR;
    ctx.lineWidth = 1;
    const timeIntervals = 6; // Una línea cada 5 segundos
    for (let i = 0; i <= timeIntervals; i++) {
      const x = (canvas.width / timeIntervals) * i;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();

      // Añadir etiquetas de tiempo
      const seconds = (i * 5).toString();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.font = '10px Arial';
      ctx.fillText(`${seconds}s`, x, canvas.height - 2);
    }

    // Dibujar grid horizontal (amplitud)
    for (let i = 0; i < 5; i++) {
      const y = (canvas.height / 4) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

    // Si la medición está completa, mostramos todo el histórico
    if (isComplete) {
      const fullData = dataRef.current;
      const minVal = Math.min(...fullData.map(d => d.value));
      const maxVal = Math.max(...fullData.map(d => d.value));
      const range = maxVal - minVal || 1;

      // Dibujar señal histórica completa con gradiente
      ctx.beginPath();
      ctx.strokeStyle = SIGNAL_COLORS.high;
      ctx.lineWidth = 2;

      fullData.forEach((point, index) => {
        const x = (canvas.width * point.time) / MAX_TIME;
        const normalizedY = (point.value - minVal) / range;
        const y = normalizedY * canvas.height * 0.8 + canvas.height * 0.1;
        
        if (index === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });
      ctx.stroke();

      // Dibujar picos detectados
      fullData.forEach(point => {
        if (point.isPeak) {
          const x = (canvas.width * point.time) / MAX_TIME;
          const normalizedY = (point.value - minVal) / range;
          const y = normalizedY * canvas.height * 0.8 + canvas.height * 0.1;
          
          ctx.beginPath();
          ctx.arc(x, y, 3, 0, 2 * Math.PI);
          ctx.fillStyle = '#ff0000';
          ctx.fill();
        }
      });

      if (onDataReady) {
        onDataReady(dataRef.current);
      }
    } else {
      // Mostrar señal en tiempo real con desplazamiento
      const recentData = dataRef.current.slice(-150); // Últimos 150 puntos
      const minVal = Math.min(...recentData.map(d => d.value));
      const maxVal = Math.max(...recentData.map(d => d.value));
      const range = maxVal - minVal || 1;

      // Dibujar señal actual con color basado en calidad
      ctx.beginPath();
      ctx.strokeStyle = quality > 75 ? SIGNAL_COLORS.high : 
                       quality > 50 ? SIGNAL_COLORS.medium : 
                       SIGNAL_COLORS.low;
      ctx.lineWidth = 2;

      recentData.forEach((point, index) => {
        const x = (canvas.width / 150) * index;
        const normalizedY = (point.value - minVal) / range;
        const y = normalizedY * canvas.height * 0.8 + canvas.height * 0.1;
        
        if (index === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });
      ctx.stroke();

      // Añadir línea de tiempo actual
      const timeProgress = (elapsedTime / MAX_TIME) * canvas.width;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(timeProgress, 0);
      ctx.lineTo(timeProgress, canvas.height);
      ctx.stroke();
      ctx.setLineDash([]);
    }

  }, [value, quality, isFingerDetected, isComplete, startTime]);

  return (
    <div className="bg-black/40 backdrop-blur-sm rounded-lg p-2">
      <div className="flex justify-between items-center mb-2">
        <span className="text-xs font-semibold text-white/90">PPG Signal</span>
        <span 
          className="text-xs font-medium"
          style={{ 
            color: quality > 75 ? SIGNAL_COLORS.high : 
                   quality > 50 ? SIGNAL_COLORS.medium : 
                   SIGNAL_COLORS.low 
          }}
        >
          {isFingerDetected ? (
            isComplete ? 
              'Medición Completa' : 
              `Quality: ${quality}%`
          ) : 'No Signal'}
        </span>
      </div>
      <canvas
        ref={canvasRef}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        className="w-full h-20 rounded bg-black/60"
      />
    </div>
  );
};

export default PPGSignalMeter;
