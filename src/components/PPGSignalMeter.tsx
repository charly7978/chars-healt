
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
  const WINDOW_WIDTH_MS = 6000;
  const CANVAS_WIDTH = 2000;
  const CANVAS_HEIGHT = 1000;
  const MIN_PEAK_INTERVAL = 1500;
  const lastPeakRef = useRef<number>(0);
  const animationFrameRef = useRef<number>();
  const smoothingFactor = 0.2;

  useEffect(() => {
    if (!canvasRef.current || !isFingerDetected) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const currentTime = Date.now();
    
    const lastPoint = dataRef.current[dataRef.current.length - 1];
    if (lastPoint) {
      const timeDiff = currentTime - lastPoint.time;
      const valueDiff = value - lastPoint.value;
      const steps = Math.min(Math.floor(timeDiff / 8), 12);

      for (let i = 1; i <= steps; i++) {
        const interpolatedTime = lastPoint.time + (timeDiff * (i / steps));
        const interpolatedValue = lastPoint.value + 
          (valueDiff * (i / steps)) * (1 - smoothingFactor) + 
          lastPoint.value * smoothingFactor;
        
        dataRef.current.push({
          time: interpolatedTime,
          value: interpolatedValue
        });
      }
    } else {
      dataRef.current.push({
        time: currentTime,
        value: value
      });
    }

    const cutoffTime = currentTime - WINDOW_WIDTH_MS;
    dataRef.current = dataRef.current.filter(point => point.time >= cutoffTime);

    const render = () => {
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.strokeStyle = 'rgba(0, 255, 0, 0.1)';
      ctx.lineWidth = 2;

      const timeInterval = WINDOW_WIDTH_MS / 30;
      for (let i = 0; i <= 30; i++) {
        const x = canvas.width - (canvas.width * (i * timeInterval) / WINDOW_WIDTH_MS);
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }

      for (let i = 0; i <= 10; i++) {
        const y = (canvas.height / 10) * i;
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
        ctx.shadowBlur = 15;
        ctx.beginPath();
        ctx.strokeStyle = '#00ff00';
        ctx.lineWidth = 6;

        let firstPoint = true;
        data.forEach((point, index) => {
          const x = canvas.width - ((currentTime - point.time) * canvas.width / WINDOW_WIDTH_MS);
          const normalizedY = (point.value - minVal) / range;
          const y = canvas.height - (normalizedY * canvas.height * 0.8 + canvas.height * 0.1);
          
          if (firstPoint) {
            ctx.moveTo(x, y);
            firstPoint = false;
          } else {
            const prevPoint = data[index - 1];
            const prevX = canvas.width - ((currentTime - prevPoint.time) * canvas.width / WINDOW_WIDTH_MS);
            const xc = (prevX + x) / 2;
            const yc = (y + canvas.height - (((prevPoint.value - minVal) / range) * canvas.height * 0.8 + canvas.height * 0.1)) / 2;
            ctx.quadraticCurveTo(prevX, y, xc, yc);
          }

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
                const opacity = Math.max(0.4, Math.min(1, (currentTime - lastPeakRef.current) / MIN_PEAK_INTERVAL));
                
                ctx.save();
                ctx.fillStyle = `rgba(255, 0, 0, ${opacity})`;
                ctx.strokeStyle = `rgba(255, 0, 0, ${opacity})`;
                
                ctx.shadowColor = '#ff0000';
                ctx.shadowBlur = 25;
                
                ctx.beginPath();
                ctx.arc(x, y, 15, 0, 2 * Math.PI);
                ctx.fill();
                
                ctx.beginPath();
                ctx.setLineDash([15, 15]);
                ctx.lineWidth = 4;
                ctx.moveTo(x, 0);
                ctx.lineTo(x, canvas.height);
                ctx.stroke();
                
                ctx.shadowBlur = 8;
                ctx.font = 'bold 28px monospace';
                ctx.fillText('ARRITMIA', x + 20, y - 25);
                
                ctx.restore();
                lastPeakRef.current = currentTime;
              }
            }
          }
        });
        ctx.stroke();
      }

      animationFrameRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [value, quality, isFingerDetected]);

  return (
    <div className="fixed inset-0 bg-black">
      {/* Canvas a pantalla completa */}
      <canvas
        ref={canvasRef}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        className="w-full h-full"
      />

      {/* Overlay con los indicadores */}
      <div className="absolute inset-0 pointer-events-none">
        {/* Header con título y calidad */}
        <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center bg-gradient-to-b from-black/70 to-transparent">
          <span className="text-2xl font-bold text-white/90">Monitor PPG</span>
          <span 
            className="text-xl font-medium px-3 py-1 rounded-full bg-black/40 backdrop-blur-sm"
            style={{ 
              color: quality > 75 ? '#00ff00' : quality > 50 ? '#ffff00' : '#ff0000' 
            }}
          >
            {isFingerDetected ? `Calidad: ${quality}%` : 'Sin Señal'}
          </span>
        </div>

        {/* Indicador de arritmia en la parte inferior */}
        <div className="absolute bottom-20 left-0 right-0 p-4 bg-gradient-to-t from-black/70 to-transparent">
          <div className="flex items-center gap-3 justify-center">
            <div className="w-5 h-5 rounded-full bg-red-500 animate-pulse"></div>
            <span className="text-xl font-medium text-red-500">
              Indicador de Arritmia
            </span>
          </div>
        </div>

        {/* Botones en la parte inferior */}
        <div className="absolute bottom-0 left-0 right-0 p-4 bg-black/40 backdrop-blur-sm pointer-events-auto">
          <div className="container mx-auto flex justify-center gap-4">
            <button 
              className="measure-button bg-green-600/80 hover:bg-green-600 text-white px-8 py-3 rounded-full text-lg font-medium flex items-center gap-2"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Iniciar Medición
            </button>

            <button 
              className="bg-blue-600/80 hover:bg-blue-600 text-white px-8 py-3 rounded-full text-lg font-medium flex items-center gap-2"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Reiniciar
            </button>
          </div>
        </div>

        {/* Gradiente sutil en los bordes para mejorar la visibilidad */}
        <div className="absolute inset-0 pointer-events-none bg-gradient-to-t from-black/20 via-transparent to-black/20"></div>
      </div>
    </div>
  );
};

export default PPGSignalMeter;
