
import React, { useEffect, useRef, useState } from 'react';
import { Fingerprint } from 'lucide-react';

interface PPGSignalMeterProps {
  value: number;
  quality: number;
  isFingerDetected: boolean;
  isComplete?: boolean;
  onStartMeasurement: () => void;
  onReset: () => void;
}

const PPGSignalMeter = ({ 
  value, 
  quality, 
  isFingerDetected,
  onStartMeasurement,
  onReset
}: PPGSignalMeterProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dataRef = useRef<{time: number, value: number}[]>([]);
  const [startTime] = useState<number>(Date.now());
  const WINDOW_WIDTH_MS = 4000; // Reducido para ver mejor los detalles
  const CANVAS_WIDTH = 2000;
  const CANVAS_HEIGHT = 1000;
  const MIN_PEAK_INTERVAL = 500; // Ajustado para detección de picos
  const lastPeakRef = useRef<number>(0);
  const animationFrameRef = useRef<number>();
  const smoothingFactor = 0.05; // Reducido significativamente para ver cambios más rápidos
  const verticalScale = 5.0; // Aumentado significativamente para ver mejor la amplitud
  const baselineRef = useRef<number | null>(null);

  useEffect(() => {
    if (!canvasRef.current || !isFingerDetected) {
      dataRef.current = [];
      baselineRef.current = null;
      return;
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const currentTime = Date.now();
    
    // Establecer línea base
    if (baselineRef.current === null) {
      baselineRef.current = value;
    }

    // Normalizar valor respecto a la línea base
    const normalizedValue = value - (baselineRef.current || 0);
    
    const lastPoint = dataRef.current[dataRef.current.length - 1];
    if (lastPoint) {
      const timeDiff = currentTime - lastPoint.time;
      const valueDiff = normalizedValue - lastPoint.value;
      const steps = Math.min(Math.floor(timeDiff / 16), 4); // Menos pasos para más detalle

      for (let i = 1; i <= steps; i++) {
        const interpolatedTime = lastPoint.time + (timeDiff * (i / steps));
        const interpolatedValue = lastPoint.value + 
          (valueDiff * (i / steps)) * (1 - smoothingFactor) + 
          lastPoint.value * smoothingFactor;
        
        dataRef.current.push({
          time: interpolatedTime,
          value: interpolatedValue * verticalScale
        });
      }
    } else {
      dataRef.current.push({
        time: currentTime,
        value: normalizedValue * verticalScale
      });
    }

    // Limitar ventana de tiempo
    const cutoffTime = currentTime - WINDOW_WIDTH_MS;
    dataRef.current = dataRef.current.filter(point => point.time >= cutoffTime);

    // Limpiar canvas
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Dibujar grilla
    ctx.strokeStyle = 'rgba(0, 255, 0, 0.05)';
    ctx.lineWidth = 1;

    // Grilla temporal (vertical)
    for (let i = 0; i <= 20; i++) {
      const x = canvas.width - (canvas.width * (i / 20));
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }

    // Grilla de amplitud (horizontal)
    for (let i = 0; i <= 10; i++) {
      const y = (canvas.height / 10) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

    // Dibujar línea central
    ctx.strokeStyle = 'rgba(0, 255, 0, 0.2)';
    ctx.beginPath();
    ctx.moveTo(0, canvas.height / 2);
    ctx.lineTo(canvas.width, canvas.height / 2);
    ctx.stroke();

    // Dibujar señal
    const data = dataRef.current;
    if (data.length > 1) {
      // Calcular rango dinámico
      const values = data.map(d => d.value);
      const meanValue = values.reduce((a, b) => a + b, 0) / values.length;
      const maxDeviation = Math.max(...values.map(v => Math.abs(v - meanValue))) || 1;
      const scaleFactor = (canvas.height * 0.4) / maxDeviation;

      ctx.strokeStyle = '#00ff00';
      ctx.lineWidth = 3;
      ctx.shadowColor = '#00ff00';
      ctx.shadowBlur = 5;
      ctx.beginPath();

      data.forEach((point, index) => {
        const x = canvas.width - ((currentTime - point.time) * canvas.width / WINDOW_WIDTH_MS);
        const y = canvas.height / 2 - ((point.value - meanValue) * scaleFactor);
        
        if (index === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });
      
      ctx.stroke();
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [value, quality, isFingerDetected]);

  return (
    <div className="fixed inset-0 bg-black">
      <canvas
        ref={canvasRef}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        className="w-full h-[calc(100%-180px)]"
      />

      <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center bg-black/40">
        <div className="flex items-center gap-4">
          <span className="text-2xl font-bold text-white">PPG</span>
          <span 
            className="text-xl font-bold"
            style={{ 
              color: isFingerDetected ? 
                (quality > 75 ? '#00ff00' : quality > 50 ? '#ffff00' : '#ff0000') : 
                '#ff0000'
            }}
          >
            {isFingerDetected ? `${quality}%` : 'NO SIGNAL'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Fingerprint 
            size={32}
            className={`transition-colors duration-300 ${
              !isFingerDetected ? 'text-gray-600' : 
              quality > 75 ? 'text-green-500' : 
              quality > 50 ? 'text-yellow-500' : 
              'text-red-500'
            }`}
          />
          <span className={`text-sm font-medium ${isFingerDetected ? 'text-green-500' : 'text-gray-500'}`}>
            {isFingerDetected ? 'OK' : 'NO FINGER'}
          </span>
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 h-[100px] grid grid-cols-2">
        <button 
          onClick={onStartMeasurement}
          className="w-full h-full bg-black hover:bg-black/80 text-3xl font-bold text-white border-t border-r border-gray-800 transition-colors"
        >
          INICIAR
        </button>
        <button 
          onClick={onReset}
          className="w-full h-full bg-black hover:bg-black/80 text-3xl font-bold text-white border-t border-gray-800 transition-colors"
        >
          RESET
        </button>
      </div>
    </div>
  );
};

export default PPGSignalMeter;
