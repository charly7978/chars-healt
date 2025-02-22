
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
  const SIGNAL_SCALE = 2; // Aumentamos la escala para ver mejor los picos

  useEffect(() => {
    if (!canvasRef.current || !isFingerDetected) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Actualizar buffer de datos
    dataRef.current.push(value);
    if (dataRef.current.length > MAX_POINTS) {
      dataRef.current.shift();
    }

    // Calcular media móvil para centrar la señal
    const mean = dataRef.current.reduce((a, b) => a + b, 0) / dataRef.current.length;

    // Limpiar canvas
    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Dibujar señal
    ctx.beginPath();
    ctx.strokeStyle = quality > 75 ? '#00ff00' : quality > 50 ? '#ffff00' : '#ff0000';
    ctx.lineWidth = 2;

    const points = dataRef.current;
    const step = canvas.width / (MAX_POINTS - 1);

    points.forEach((point, i) => {
      const x = i * step;
      // Centramos la señal alrededor del punto medio y aplicamos escala
      const y = canvas.height / 2 + (point - mean) * SIGNAL_SCALE;
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });

    ctx.stroke();

    // Dibujar línea central
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.setLineDash([5, 5]);
    ctx.moveTo(0, canvas.height / 2);
    ctx.lineTo(canvas.width, canvas.height / 2);
    ctx.stroke();
    ctx.setLineDash([]);

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
