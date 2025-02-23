
import React, { useEffect, useRef, useState } from 'react';

interface PPGSignalMeterProps {
  value: number;
  quality: number;
  isFingerDetected: boolean;
  isComplete?: boolean;
}

const PPGSignalMeter = ({ value, quality, isFingerDetected, isComplete }: PPGSignalMeterProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dataRef = useRef<number[]>([]);
  const peaksRef = useRef<boolean[]>([]);
  const arrhythmiaRef = useRef<boolean[]>([]);
  const positionRef = useRef(0);
  const [gridVisible, setGridVisible] = useState(true);
  const BUFFER_SIZE = 400; // Tamaño del buffer para datos históricos
  const MIN_PEAK_DISTANCE = 20; // Distancia mínima entre picos
  const PEAK_THRESHOLD = 0.6; // Umbral para detección de picos
  const lastPeakRef = useRef(-MIN_PEAK_DISTANCE);

  useEffect(() => {
    if (!isFingerDetected) {
      dataRef.current = [];
      peaksRef.current = [];
      arrhythmiaRef.current = [];
      positionRef.current = 0;
      return;
    }

    // Añadir nuevo valor al buffer
    dataRef.current.push(value);
    if (dataRef.current.length > BUFFER_SIZE) {
      dataRef.current.shift();
      peaksRef.current.shift();
      arrhythmiaRef.current.shift();
    }

    // Detección de picos y arritmias
    const isPeak = detectPeak(dataRef.current, positionRef.current);
    peaksRef.current.push(isPeak);
    
    // Detección de arritmias basada en intervalos RR
    const isArrhythmia = detectArrhythmia(dataRef.current, peaksRef.current);
    arrhythmiaRef.current.push(isArrhythmia);

    // Renderizar señal
    renderSignal();

    // Actualizar posición
    positionRef.current = (positionRef.current + 1) % BUFFER_SIZE;
  }, [value, isFingerDetected]);

  const detectPeak = (data: number[], currentPos: number): boolean => {
    if (currentPos < 2 || currentPos >= data.length - 2) return false;
    if (currentPos - lastPeakRef.current < MIN_PEAK_DISTANCE) return false;

    const current = data[currentPos];
    const prev1 = data[currentPos - 1];
    const prev2 = data[currentPos - 2];
    const next1 = data[currentPos + 1];
    const next2 = data[currentPos + 2];

    const isPeak = current > prev1 && current > prev2 && 
                  current > next1 && current > next2 && 
                  current > PEAK_THRESHOLD;

    if (isPeak) {
      lastPeakRef.current = currentPos;
    }

    return isPeak;
  };

  const detectArrhythmia = (data: number[], peaks: boolean[]): boolean => {
    if (peaks.length < 4) return false;

    // Encontrar los últimos 4 picos
    let lastPeaks: number[] = [];
    for (let i = peaks.length - 1; i >= 0 && lastPeaks.length < 4; i--) {
      if (peaks[i]) lastPeaks.unshift(i);
    }

    if (lastPeaks.length < 4) return false;

    // Calcular intervalos RR
    const intervals = [];
    for (let i = 1; i < lastPeaks.length; i++) {
      intervals.push(lastPeaks[i] - lastPeaks[i-1]);
    }

    // Detectar irregularidad en intervalos RR
    const avgInterval = intervals.reduce((a, b) => a + b) / intervals.length;
    const maxDeviation = avgInterval * 0.2; // 20% de desviación permitida

    return intervals.some(interval => 
      Math.abs(interval - avgInterval) > maxDeviation
    );
  };

  const renderSignal = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Limpiar canvas
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Dibujar grid si está activado
    if (gridVisible) {
      drawGrid(ctx, canvas.width, canvas.height);
    }

    // No dibujar si no hay suficientes datos
    if (dataRef.current.length < 2) return;

    // Calcular escala y offset
    const maxVal = Math.max(...dataRef.current);
    const minVal = Math.min(...dataRef.current);
    const range = maxVal - minVal || 1;
    const scale = (canvas.height * 0.8) / range;
    const offset = canvas.height * 0.1;

    // Dibujar línea base
    ctx.strokeStyle = '#1a4721';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, canvas.height / 2);
    ctx.lineTo(canvas.width, canvas.height / 2);
    ctx.stroke();

    // Dibujar señal principal
    ctx.strokeStyle = quality > 75 ? '#00ff00' : quality > 50 ? '#ffff00' : '#ff0000';
    ctx.lineWidth = 2;
    ctx.beginPath();

    dataRef.current.forEach((val, i) => {
      const x = (canvas.width * i) / BUFFER_SIZE;
      const y = canvas.height - ((val - minVal) * scale + offset);
      
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }

      // Marcar picos
      if (peaksRef.current[i]) {
        ctx.save();
        ctx.fillStyle = '#ff0000';
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // Marcar arritmias
      if (arrhythmiaRef.current[i]) {
        ctx.save();
        ctx.strokeStyle = '#ff0000';
        ctx.setLineDash([2, 2]);
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
        ctx.restore();
      }
    });

    ctx.stroke();
  };

  const drawGrid = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    ctx.strokeStyle = '#1a4721';
    ctx.lineWidth = 0.5;

    // Líneas verticales
    for (let x = 0; x < width; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }

    // Líneas horizontales
    for (let y = 0; y < height; y += 40) {
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
              ? `Monitor PPG - ${quality}% Calidad${arrhythmiaRef.current?.some(a => a) ? ' - ¡Arritmia Detectada!' : ''}`
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
