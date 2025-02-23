
import React, { useEffect, useRef, useState } from 'react';

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
  const positionRef = useRef(0);
  const [gridVisible, setGridVisible] = useState(true);
  const BUFFER_SIZE = 400;
  const MIN_PEAK_DISTANCE = 20;
  const lastPeakRef = useRef(-MIN_PEAK_DISTANCE);

  useEffect(() => {
    if (!isFingerDetected) {
      dataRef.current = [];
      peaksRef.current = [];
      positionRef.current = 0;
      return;
    }

    // Actualizar datos
    dataRef.current.push(value);
    if (dataRef.current.length > BUFFER_SIZE) {
      dataRef.current.shift();
      peaksRef.current.shift();
    }

    // Detectar picos
    const isPeak = detectPeak(value);
    peaksRef.current.push(isPeak);

    // Renderizar
    renderSignal();

    // Actualizar posición
    positionRef.current = (positionRef.current + 1) % BUFFER_SIZE;

    // Si está completo, enviar datos
    if (isComplete && onDataReady) {
      const resultData = dataRef.current.map((val, i) => ({
        time: i,
        value: val,
        isPeak: peaksRef.current[i] || false
      }));
      onDataReady(resultData);
    }
  }, [value, isFingerDetected, isComplete, onDataReady]);

  const detectPeak = (currentValue: number): boolean => {
    const currentPos = dataRef.current.length - 1;
    if (currentPos < 2) return false;
    if (currentPos - lastPeakRef.current < MIN_PEAK_DISTANCE) return false;

    const data = dataRef.current;
    const isPeak = currentValue > data[currentPos - 1] && 
                  data[currentPos - 1] > data[currentPos - 2];

    if (isPeak) {
      lastPeakRef.current = currentPos;
    }

    return isPeak;
  };

  const renderSignal = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Limpiar canvas
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Dibujar grid
    if (gridVisible) {
      drawGrid(ctx, canvas.width, canvas.height);
    }

    if (dataRef.current.length < 2) return;

    // Preparar escala
    const maxVal = Math.max(...dataRef.current);
    const minVal = Math.min(...dataRef.current);
    const range = maxVal - minVal || 1;
    const scale = (canvas.height * 0.8) / range;
    const offset = canvas.height * 0.1;

    // Dibujar líneas guía
    ctx.strokeStyle = '#1a4721';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.setLineDash([5, 5]);
    ctx.moveTo(0, canvas.height / 2);
    ctx.lineTo(canvas.width, canvas.height / 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Dibujar señal PPG con estilo más profesional
    ctx.strokeStyle = '#ff0000'; // Color rojo para la señal principal
    ctx.lineWidth = 2;
    ctx.shadowColor = '#ff0000';
    ctx.shadowBlur = 4;
    ctx.beginPath();

    dataRef.current.forEach((val, i) => {
      const x = (canvas.width * i) / BUFFER_SIZE;
      const y = canvas.height - ((val - minVal) * scale + offset);
      
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }

      // Marcar picos con círculos más sutiles
      if (peaksRef.current[i]) {
        ctx.save();
        ctx.fillStyle = '#ff6b6b';
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(x, y, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    });

    ctx.stroke();
    ctx.shadowBlur = 0;

    // Dibujar escala de tiempo
    ctx.fillStyle = '#2a5a31';
    ctx.font = '10px monospace';
    for (let x = 0; x < canvas.width; x += 80) {
      const seconds = (x / canvas.width * 4).toFixed(1);
      ctx.fillText(`${seconds}s`, x, canvas.height - 5);
    }

    // Dibujar indicador de calidad
    if (isFingerDetected) {
      const qualityColor = quality > 75 ? '#00ff00' : quality > 50 ? '#ffff00' : '#ff0000';
      ctx.fillStyle = qualityColor;
      ctx.font = '12px monospace';
      ctx.fillText(`${quality}%`, 5, 15);
    }
  };

  const drawGrid = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    // Grid grande (cuadrados de 1 segundo)
    ctx.strokeStyle = '#1a4721';
    ctx.lineWidth = 0.5;

    for (let x = 0; x < width; x += 80) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }

    for (let y = 0; y < height; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Grid pequeño (divisiones de 0.2 segundos)
    ctx.strokeStyle = '#0a2711';
    for (let x = 0; x < width; x += 20) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }

    for (let y = 0; y < height; y += 20) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
  };

  return (
    <div className="bg-black/90 backdrop-blur rounded-lg p-3 border border-green-900">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${
            isFingerDetected 
              ? quality > 75 
                ? 'bg-green-500 animate-pulse' 
                : quality > 50 
                  ? 'bg-yellow-500 animate-pulse' 
                  : 'bg-red-500 animate-pulse'
              : 'bg-red-500'
          }`} />
          <span className="text-xs font-medium text-green-400">
            {isFingerDetected 
              ? `Monitor PPG - ${quality}% Calidad` 
              : 'Coloque su dedo en la cámara'}
          </span>
        </div>
        <button
          onClick={() => setGridVisible(!gridVisible)}
          className="text-xs text-green-400 hover:text-green-300"
        >
          {gridVisible ? 'Ocultar Grid' : 'Mostrar Grid'}
        </button>
      </div>
      <canvas
        ref={canvasRef}
        width={400}
        height={200}
        className="w-full rounded bg-black"
      />
    </div>
  );
};

export default PPGSignalMeter;
