
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
  const MAX_TIME = 30000; // 30 segundos en milisegundos
  const CANVAS_WIDTH = 800; // Duplicado el ancho
  const CANVAS_HEIGHT = 300; // Triplicado el alto

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

    // Dibujar líneas de grid y números
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    ctx.fillStyle = '#8E9196'; // Color para números
    ctx.font = '12px monospace';

    // Grid vertical con números (tiempo en segundos)
    for (let i = 0; i <= 10; i++) {
      const x = (canvas.width / 10) * i;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
      ctx.fillText(`${i * 3}s`, x, canvas.height - 5);
    }

    // Grid horizontal con valores de amplitud
    for (let i = 0; i <= 5; i++) {
      const y = (canvas.height / 5) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
      ctx.fillText(`${100 - (i * 20)}`, 5, y + 15);
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

        // Marcar arritmias (cuando hay un cambio brusco en el ritmo)
        if (index > 0) {
          const prevPoint = fullData[index - 1];
          const deltaValue = Math.abs(point.value - prevPoint.value);
          const threshold = range * 0.3; // 30% del rango como umbral

          if (deltaValue > threshold) {
            ctx.save();
            ctx.fillStyle = '#ea384c'; // Color distintivo para arritmias
            ctx.beginPath();
            ctx.arc(x, y, 5, 0, 2 * Math.PI);
            ctx.fill();
            ctx.restore();
          }
        }
      });
      ctx.stroke();

      if (onDataReady) {
        onDataReady(dataRef.current);
      }
    } else {
      // Mostrar señal en tiempo real
      const recentData = dataRef.current.slice(-150);
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

        // Marcar arritmias en tiempo real
        if (index > 0) {
          const prevPoint = recentData[index - 1];
          const deltaValue = Math.abs(point.value - prevPoint.value);
          const threshold = range * 0.3;

          if (deltaValue > threshold) {
            ctx.save();
            ctx.fillStyle = '#ea384c';
            ctx.beginPath();
            ctx.arc(x, y, 5, 0, 2 * Math.PI);
            ctx.fill();
            ctx.restore();
          }
        }
      });
      ctx.stroke();
    }

  }, [value, quality, isFingerDetected, isComplete, startTime]);

  return (
    <div className="bg-black/40 backdrop-blur-sm rounded-lg p-4">
      <div className="flex justify-between items-center mb-2">
        <span className="text-xs font-semibold text-white/90">Monitor PPG</span>
        <span 
          className="text-xs font-medium"
          style={{ 
            color: quality > 75 ? '#00ff00' : quality > 50 ? '#ffff00' : '#ff0000' 
          }}
        >
          {isFingerDetected ? (
            isComplete ? 
              'Medición Completa' : 
              `Calidad: ${quality}%`
          ) : 'Sin Señal'}
        </span>
      </div>
      <canvas
        ref={canvasRef}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        className="w-full rounded bg-black/60"
      />
      <div className="mt-2 text-xs text-red-500 flex items-center gap-2">
        <div className="w-3 h-3 rounded-full bg-[#ea384c]"></div>
        <span>Indicador de Arritmia</span>
      </div>
    </div>
  );
};

export default PPGSignalMeter;
