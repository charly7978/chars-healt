
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
  const [startTime, setStartTime] = useState<number>(Date.now());
  const WINDOW_WIDTH_MS = 3000; // Ventana más corta para ver mejor los pulsos
  const CANVAS_WIDTH = 2000;
  const CANVAS_HEIGHT = 1000;
  const verticalScale = 15.0; // Amplificación mucho mayor
  const baselineRef = useRef<number | null>(null);
  const maxAmplitudeRef = useRef<number>(0);

  const handleReset = () => {
    // Limpiar datos y referencias
    dataRef.current = [];
    baselineRef.current = null;
    maxAmplitudeRef.current = 0;
    setStartTime(Date.now());

    // Limpiar el canvas
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
    }

    // Llamar al reset del padre
    onReset();
  };

  useEffect(() => {
    if (!canvasRef.current) return;
    if (!isFingerDetected) {
      dataRef.current = [];
      baselineRef.current = null;
      maxAmplitudeRef.current = 0;
      return;
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const currentTime = Date.now();
    
    // Establecer y actualizar línea base
    if (baselineRef.current === null) {
      baselineRef.current = value;
    } else {
      baselineRef.current = baselineRef.current * 0.95 + value * 0.05;
    }

    // Normalizar y escalar el valor
    const normalizedValue = (value - (baselineRef.current || 0)) * verticalScale;
    
    // Actualizar amplitud máxima
    maxAmplitudeRef.current = Math.max(maxAmplitudeRef.current, Math.abs(normalizedValue));

    // Agregar nuevo punto
    dataRef.current.push({
      time: currentTime,
      value: normalizedValue
    });

    // Mantener solo los datos dentro de la ventana de tiempo
    const cutoffTime = currentTime - WINDOW_WIDTH_MS;
    dataRef.current = dataRef.current.filter(point => point.time >= cutoffTime);

    // Limpiar canvas
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Dibujar grilla
    ctx.strokeStyle = 'rgba(0, 255, 0, 0.1)';
    ctx.lineWidth = 1;

    // Líneas de tiempo (verticales)
    for (let i = 0; i < 6; i++) {
      const x = canvas.width - (canvas.width * (i / 6));
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
      
      // Agregar marca de tiempo
      ctx.fillStyle = 'rgba(0, 255, 0, 0.5)';
      ctx.font = '14px monospace';
      ctx.fillText(`${i * 500}ms`, x - 30, canvas.height - 10);
    }

    // Líneas de amplitud (horizontales)
    const amplitudeLines = 8;
    for (let i = 0; i <= amplitudeLines; i++) {
      const y = (canvas.height / amplitudeLines) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

    // Línea central más visible
    ctx.strokeStyle = 'rgba(0, 255, 0, 0.3)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, canvas.height / 2);
    ctx.lineTo(canvas.width, canvas.height / 2);
    ctx.stroke();

    // Dibujar señal PPG
    if (dataRef.current.length > 1) {
      ctx.strokeStyle = '#00ff00';
      ctx.lineWidth = 4;
      ctx.shadowColor = '#00ff00';
      ctx.shadowBlur = 10;
      ctx.beginPath();

      dataRef.current.forEach((point, index) => {
        const x = canvas.width - ((currentTime - point.time) * canvas.width / WINDOW_WIDTH_MS);
        const y = canvas.height / 2 - point.value;
        
        if (index === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });
      
      ctx.stroke();
    }

    return () => {};
  }, [value, quality, isFingerDetected]);

  return (
    <div className="fixed inset-0 bg-black">
      <canvas
        ref={canvasRef}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        className="w-full h-[calc(100%-120px)]" // Ajustado para botones más pequeños
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

      <div className="fixed bottom-0 left-0 right-0 h-[80px] grid grid-cols-2"> {/* Altura reducida de 100px a 80px */}
        <button 
          onClick={onStartMeasurement}
          className="w-full h-full bg-black hover:bg-black/80 text-2xl font-bold text-white border-t border-r border-gray-800 transition-colors" // Texto más pequeño
        >
          INICIAR
        </button>
        <button 
          onClick={handleReset}
          className="w-full h-full bg-black hover:bg-black/80 text-2xl font-bold text-white border-t border-gray-800 transition-colors" // Texto más pequeño
        >
          RESET
        </button>
      </div>
    </div>
  );
};

export default PPGSignalMeter;
