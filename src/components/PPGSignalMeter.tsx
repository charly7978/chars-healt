
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
  isFingerDetected
}: PPGSignalMeterProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dataRef = useRef<{time: number, value: number}[]>([]);
  const [startTime] = useState<number>(Date.now());
  const MAX_TIME = 30000;
  const CANVAS_WIDTH = 800;
  const CANVAS_HEIGHT = 300;
  const MIN_PEAK_INTERVAL = 300; // Mínimo tiempo entre picos (ms)
  const lastPeakRef = useRef<number>(0);

  useEffect(() => {
    if (!canvasRef.current || !isFingerDetected) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const currentTime = Date.now();
    const elapsedTime = currentTime - startTime;

    // Agregar nuevo punto de datos
    if (elapsedTime <= MAX_TIME) {
      dataRef.current.push({
        time: elapsedTime,
        value: value
      });
    }

    // Limpiar canvas
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Dibujar cuadrícula y números
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    ctx.fillStyle = '#8E9196';
    ctx.font = '12px monospace';

    // Grid vertical (tiempo)
    for (let i = 0; i <= 10; i++) {
      const x = (canvas.width / 10) * i;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
      ctx.fillText(`${i * 3}s`, x, canvas.height - 5);
    }

    // Grid horizontal (amplitud)
    for (let i = 0; i <= 5; i++) {
      const y = (canvas.height / 5) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
      ctx.fillText(`${100 - (i * 20)}`, 5, y + 15);
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
        const x = (canvas.width * point.time) / MAX_TIME;
        const normalizedY = (point.value - minVal) / range;
        const y = normalizedY * canvas.height * 0.8 + canvas.height * 0.1;
        
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
          const next = data[index + 1].value;

          // Detectar picos anormales o intervalos irregulares
          const isAbnormalPeak = 
            (current > prev1 && current > next) && // Es un pico
            (currentTime - lastPeakRef.current > MIN_PEAK_INTERVAL) && // Suficiente tiempo desde último pico
            (Math.abs(current - prev1) > range * 0.4 || // Amplitud anormal
             Math.abs(current - prev2) > range * 0.5); // O patrón irregular

          if (isAbnormalPeak) {
            // Marcar arritmia
            ctx.save();
            ctx.fillStyle = '#ea384c';
            ctx.strokeStyle = '#ea384c';
            
            // Círculo en el pico
            ctx.beginPath();
            ctx.arc(x, y, 5, 0, 2 * Math.PI);
            ctx.fill();
            
            // Línea vertical indicadora
            ctx.beginPath();
            ctx.setLineDash([5, 5]);
            ctx.moveTo(x, 0);
            ctx.lineTo(x, canvas.height);
            ctx.stroke();
            
            // Texto "ARRITMIA"
            ctx.fillStyle = '#ea384c';
            ctx.fillText('ARRITMIA', x + 5, y - 10);
            
            ctx.restore();
            lastPeakRef.current = currentTime;
          }
        }
      });
      ctx.stroke();
    }

  }, [value, quality, isFingerDetected, startTime]);

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
        <div className="w-3 h-3 rounded-full bg-[#ea384c]"></div>
        <span>Indicador de Arritmia</span>
      </div>
    </div>
  );
};

export default PPGSignalMeter;
