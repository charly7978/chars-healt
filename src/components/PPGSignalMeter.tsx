
import React, { useEffect, useRef } from 'react';

interface PPGSignalMeterProps {
  value: number;
  quality: number;
  isFingerDetected: boolean;
}

const PPGSignalMeter = ({ value, quality, isFingerDetected }: PPGSignalMeterProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dataRef = useRef<number[]>([]);
  const MAX_POINTS = 150;

  useEffect(() => {
    if (!canvasRef.current || !isFingerDetected) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Actualizar datos
    dataRef.current.push(value);
    if (dataRef.current.length > MAX_POINTS) {
      dataRef.current.shift();
    }

    // Encontrar min/max para auto-escala
    const values = dataRef.current;
    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);
    const range = maxVal - minVal || 1;

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

    // Dibujar señal
    ctx.beginPath();
    ctx.strokeStyle = quality > 75 ? '#00ff00' : quality > 50 ? '#ffff00' : '#ff0000';
    ctx.lineWidth = 2;

    values.forEach((point, index) => {
      const x = (canvas.width / MAX_POINTS) * index;
      const normalizedY = (point - minVal) / range;
      const y = canvas.height - (normalizedY * canvas.height * 0.8 + canvas.height * 0.1);
      
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.stroke();

  }, [value, quality, isFingerDetected]);

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
          {isFingerDetected ? `Quality: ${quality}%` : 'No Signal'}
        </span>
      </div>
      <canvas
        ref={canvasRef}
        width={400}
        height={100}
        className="w-full h-20 rounded bg-black/60"
      />
    </div>
  );
};

export default PPGSignalMeter;
