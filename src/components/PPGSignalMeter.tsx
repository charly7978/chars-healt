
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
  const WINDOW_WIDTH_MS = 6000;
  const CANVAS_WIDTH = 2000;
  const CANVAS_HEIGHT = 1000;
  const MIN_PEAK_INTERVAL = 1500;
  const lastPeakRef = useRef<number>(0);
  const animationFrameRef = useRef<number>();
  const smoothingFactor = 0.1; // Reducido para suavizar menos la señal
  const verticalScale = 2.0; // Aumentado para amplificar la señal verticalmente

  useEffect(() => {
    if (!canvasRef.current || !isFingerDetected) {
      dataRef.current = []; // Limpia los datos cuando no hay dedo detectado
      return;
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const currentTime = Date.now();
    
    const lastPoint = dataRef.current[dataRef.current.length - 1];
    if (lastPoint) {
      const timeDiff = currentTime - lastPoint.time;
      const valueDiff = value - lastPoint.value;
      const steps = Math.min(Math.floor(timeDiff / 16), 8); // Reducido para más detalle

      for (let i = 1; i <= steps; i++) {
        const interpolatedTime = lastPoint.time + (timeDiff * (i / steps));
        const interpolatedValue = lastPoint.value + 
          (valueDiff * (i / steps)) * (1 - smoothingFactor) + 
          lastPoint.value * smoothingFactor;
        
        dataRef.current.push({
          time: interpolatedTime,
          value: interpolatedValue * verticalScale // Amplifica la señal
        });
      }
    } else {
      dataRef.current.push({
        time: currentTime,
        value: value * verticalScale
      });
    }

    const cutoffTime = currentTime - WINDOW_WIDTH_MS;
    dataRef.current = dataRef.current.filter(point => point.time >= cutoffTime);

    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = 'rgba(0, 255, 0, 0.1)';
    ctx.lineWidth = 1;

    // Draw time grid
    const timeInterval = WINDOW_WIDTH_MS / 30;
    for (let i = 0; i <= 30; i++) {
      const x = canvas.width - (canvas.width * (i * timeInterval) / WINDOW_WIDTH_MS);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }

    // Draw amplitude grid
    const gridLines = 20; // Aumentado para más detalle vertical
    for (let i = 0; i <= gridLines; i++) {
      const y = (canvas.height / gridLines) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

    const data = dataRef.current;
    if (data.length > 1) {
      const minVal = Math.min(...data.map(d => d.value));
      const maxVal = Math.max(...data.map(d => d.value));
      const range = maxVal - minVal || 1;

      ctx.shadowColor = '#00ff00';
      ctx.shadowBlur = 3; // Reducido para líneas más nítidas
      ctx.beginPath();
      ctx.strokeStyle = '#00ff00';
      ctx.lineWidth = 2; // Línea más fina para ver mejor los detalles

      let firstPoint = true;
      data.forEach((point, index) => {
        const x = canvas.width - ((currentTime - point.time) * canvas.width / WINDOW_WIDTH_MS);
        const normalizedY = (point.value - minVal) / range;
        const y = canvas.height - (normalizedY * canvas.height * 0.8 + canvas.height * 0.1);
        
        if (firstPoint) {
          ctx.moveTo(x, y);
          firstPoint = false;
        } else {
          ctx.lineTo(x, y); // Cambiado a lineTo para ver mejor los picos
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
