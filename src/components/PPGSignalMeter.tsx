
import React, { useEffect, useRef, useState } from 'react';

interface PPGSignalMeterProps {
  value: number;
  quality: number;
  isFingerDetected: boolean;
  isComplete?: boolean;
}

const PPGSignalMeter = ({ 
  value, 
  quality, 
  isFingerDetected
}: PPGSignalMeterProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dataRef = useRef<{time: number, value: number}[]>([]);
  const [startTime] = useState<number>(Date.now());
  const WINDOW_WIDTH_MS = 6000; // Ventana de 6 segundos visible
  const CANVAS_WIDTH = 800;
  const CANVAS_HEIGHT = 300;
  const MIN_PEAK_INTERVAL = 300;
  const lastPeakRef = useRef<number>(0);

  useEffect(() => {
    if (!canvasRef.current || !isFingerDetected) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const currentTime = Date.now();
    
    // Agregar nuevo punto de datos
    dataRef.current.push({
      time: currentTime,
      value: value
    });

    // Mantener solo los últimos 6 segundos de datos
    const cutoffTime = currentTime - WINDOW_WIDTH_MS;
    dataRef.current = dataRef.current.filter(point => point.time >= cutoffTime);

    // Limpiar canvas
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Dibujar cuadrícula
    ctx.strokeStyle = 'rgba(0, 255, 0, 0.1)';
    ctx.lineWidth = 1;

    // Grid vertical (tiempo) - cada línea representa 0.2 segundos
    const timeInterval = WINDOW_WIDTH_MS / 30; // 30 divisiones
    for (let i = 0; i <= 30; i++) {
      const x = canvas.width - (canvas.width * (i * timeInterval) / WINDOW_WIDTH_MS);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }

    // Grid horizontal (amplitud)
    for (let i = 0; i <= 8; i++) {
      const y = (canvas.height / 8) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

    // Procesar y dibujar señal PPG
    const data = dataRef.current;
    if (data.length > 1) {
      const minVal = Math.min(...data.map(d => d.value));
      const maxVal = Math.max(...data.map(d => d.value));
      const range = maxVal - minVal || 1;

      // Dibujar onda PPG
      ctx.beginPath();
      ctx.strokeStyle = '#00ff00';
      ctx.lineWidth = 2;

      data.forEach((point, index) => {
        const x = canvas.width - ((currentTime - point.time) * canvas.width / WINDOW_WIDTH_MS);
        const normalizedY = (point.value - minVal) / range;
        const y = canvas.height - (normalizedY * canvas.height * 0.8 + canvas.height * 0.1);
        
        if (index === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }

        // Detectar y marcar arritmias
        if (index > 2 && index < data.length - 1) {
          const prev2 = data[index - 2].value;
          const prev1 = data[index - 1].value;
          const current = point.value;
          const next = data[index + 1]?.value;

          if (next !== undefined) {
            const isAbnormalPeak = 
              (current > prev1 && current > next) && 
              (currentTime - lastPeakRef.current > MIN_PEAK_INTERVAL) &&
              (Math.abs(current - prev1) > range * 0.4 || 
               Math.abs(current - prev2) > range * 0.5);

            if (isAbnormalPeak) {
              // Marcar arritmia
              ctx.save();
              ctx.fillStyle = '#ff0000';
              ctx.strokeStyle = '#ff0000';
              
              // Círculo rojo en el pico
              ctx.beginPath();
              ctx.arc(x, y, 4, 0, 2 * Math.PI);
              ctx.fill();
              
              // Línea vertical roja punteada
              ctx.beginPath();
              ctx.setLineDash([5, 5]);
              ctx.moveTo(x, 0);
              ctx.lineTo(x, canvas.height);
              ctx.stroke();
              
              // Texto "ARRITMIA"
              ctx.font = '12px monospace';
              ctx.fillText('ARRITMIA', x + 5, y - 10);
              
              ctx.restore();
              lastPeakRef.current = currentTime;
            }
          }
        }
      });
      ctx.stroke();
    }

  }, [value, quality, isFingerDetected]);

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
          {isFingerDetected ? `Calidad: ${quality}%` : 'Sin Señal'}
        </span>
      </div>
      <canvas
        ref={canvasRef}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        className="w-full rounded bg-black/60"
      />
      <div className="mt-2 text-xs text-red-500 flex items-center gap-2">
        <div className="w-3 h-3 rounded-full bg-red-500"></div>
        <span>Indicador de Arritmia</span>
      </div>
    </div>
  );
};

export default PPGSignalMeter;
