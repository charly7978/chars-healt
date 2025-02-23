
import React, { useEffect, useRef } from 'react';

interface PPGSignalMeterProps {
  value: number;
  quality: number;
  isFingerDetected: boolean;
  isComplete?: boolean;
  onDataReady?: (data: Array<{time: number, value: number, isPeak: boolean}>) => void;
}

const PPGSignalMeter = ({ value, quality, isFingerDetected, isComplete, onDataReady }: PPGSignalMeterProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dataRef = useRef<number[]>([]);
  const peaksRef = useRef<boolean[]>([]);
  const BUFFER_SIZE = 400;

  useEffect(() => {
    if (!isFingerDetected) {
      dataRef.current = [];
      peaksRef.current = [];
      return;
    }

    // Actualizar buffer de datos
    dataRef.current.push(value);
    if (dataRef.current.length > BUFFER_SIZE) {
      dataRef.current.shift();
    }

    // Renderizar señal
    renderSignal();

    // Si completó la medición, enviar datos
    if (isComplete && onDataReady && dataRef.current.length > 0) {
      const resultData = dataRef.current.map((val, i) => ({
        time: i,
        value: val,
        isPeak: false
      }));
      onDataReady(resultData);
    }
  }, [value, isFingerDetected, isComplete, onDataReady]);

  const renderSignal = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Limpiar canvas
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Dibujar cuadrícula base
    const cellSize = 20;
    ctx.strokeStyle = '#1a4721';
    ctx.lineWidth = 0.5;

    // Cuadrícula vertical
    for (let x = 0; x <= canvas.width; x += cellSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }

    // Cuadrícula horizontal
    for (let y = 0; y <= canvas.height; y += cellSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

    // Mostrar datos PPG como bloques de colores
    if (dataRef.current.length > 0) {
      const values = dataRef.current;
      const maxVal = Math.max(...values);
      const minVal = Math.min(...values);
      const range = maxVal - minVal || 1;

      values.forEach((val, i) => {
        const x = Math.floor((canvas.width * i) / BUFFER_SIZE);
        const normalizedValue = (val - minVal) / range;
        const y = Math.floor(canvas.height * (1 - normalizedValue));
        
        // Dibujar bloque de color
        ctx.fillStyle = quality > 75 ? '#4ade80' : quality > 50 ? '#fbbf24' : '#ef4444';
        ctx.fillRect(x, y, 2, 2);
      });
    }

    // Indicador de estado
    ctx.fillStyle = isFingerDetected ? '#22c55e' : '#ef4444';
    ctx.font = '12px monospace';
    ctx.fillText(isFingerDetected ? 'Señal OK' : 'Sin Señal', 10, 20);
  };

  return (
    <div className="bg-black rounded-lg p-4 border border-green-900">
      <canvas
        ref={canvasRef}
        width={400}
        height={200}
        className="w-full bg-black rounded"
      />
    </div>
  );
};

export default PPGSignalMeter;
