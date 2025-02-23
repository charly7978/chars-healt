
import React, { useEffect, useRef, useState } from 'react';

interface PPGSignalMeterProps {
  value: number;
  quality: number;
  isFingerDetected: boolean;
  isComplete?: boolean; // Nueva prop para saber si la medición terminó
}

const PPGSignalMeter = ({ value, quality, isFingerDetected, isComplete }: PPGSignalMeterProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dataRef = useRef<{time: number, value: number, isPeak: boolean}[]>([]);
  const [startTime] = useState<number>(Date.now());
  const MAX_TIME = 30000; // 30 segundos en milisegundos
  const CANVAS_WIDTH = 400;
  const CANVAS_HEIGHT = 100;

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
        isPeak: quality > 75 // Consideramos un pico cuando la calidad es alta
      });
    }

    // Limpiar canvas
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Dibujar líneas de grid
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;
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

      // Dibujar señal histórica completa
      ctx.beginPath();
      ctx.strokeStyle = '#00ff00';
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

    } else {
      // Mostrar señal en tiempo real
      const recentData = dataRef.current.slice(-150); // Últimos 150 puntos
      const minVal = Math.min(...recentData.map(d => d.value));
      const maxVal = Math.max(...recentData.map(d => d.value));
      const range = maxVal - minVal || 1;

      // Dibujar señal actual
      ctx.beginPath();
      ctx.strokeStyle = quality > 75 ? '#00ff00' : quality > 50 ? '#ffff00' : '#ff0000';
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
    }

  }, [value, quality, isFingerDetected, isComplete, startTime]);

  return (
    <div className="bg-black/40 backdrop-blur-sm rounded-lg p-2">
      <div className="flex justify-between items-center mb-2">
        <span className="text-xs font-semibold text-white/90">PPG Signal</span>
        <span 
          className="text-xs font-medium"
          style={{ 
            color: quality > 75 ? '#00ff00' : quality > 50 ? '#ffff00' : '#ff0000' 
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
