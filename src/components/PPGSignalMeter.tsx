
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
  const WINDOW_WIDTH_MS = 6000; // Ventana de 6 segundos
  const CANVAS_WIDTH = 1500; // SIGNIFICATIVAMENTE más grande
  const CANVAS_HEIGHT = 600; // SIGNIFICATIVAMENTE más grande
  const MIN_PEAK_INTERVAL = 1200; // Mucho más lento para mejor visualización
  const lastPeakRef = useRef<number>(0);
  const animationFrameRef = useRef<number>();
  const smoothingFactor = 0.15; // Factor de suavizado para el barrido

  useEffect(() => {
    if (!canvasRef.current || !isFingerDetected) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const currentTime = Date.now();
    
    // Suavizado mejorado con más puntos de interpolación
    const lastPoint = dataRef.current[dataRef.current.length - 1];
    if (lastPoint) {
      const timeDiff = currentTime - lastPoint.time;
      const valueDiff = value - lastPoint.value;
      const steps = Math.min(Math.floor(timeDiff / 8), 10); // Más puntos de interpolación
      
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

      // Cuadrícula mejorada con efecto de profundidad
      ctx.strokeStyle = 'rgba(0, 255, 0, 0.08)';
      ctx.lineWidth = 1;

      // Grid vertical más denso
      const timeInterval = WINDOW_WIDTH_MS / 60; // 60 divisiones
      for (let i = 0; i <= 60; i++) {
        const x = canvas.width - (canvas.width * (i * timeInterval) / WINDOW_WIDTH_MS);
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }

      // Grid horizontal más denso
      for (let i = 0; i <= 12; i++) {
        const y = (canvas.height / 12) * i;
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

        // Efecto de resplandor mejorado
        ctx.shadowColor = '#00ff00';
        ctx.shadowBlur = 20;
        ctx.beginPath();
        ctx.strokeStyle = '#00ff00';
        ctx.lineWidth = 4; // Línea más gruesa

        // Dibujar línea principal con curvas suaves
        let firstPoint = true;
        data.forEach((point, index) => {
          const x = canvas.width - ((currentTime - point.time) * canvas.width / WINDOW_WIDTH_MS);
          const normalizedY = (point.value - minVal) / range;
          const y = canvas.height - (normalizedY * canvas.height * 0.8 + canvas.height * 0.1);
          
          if (firstPoint) {
            ctx.moveTo(x, y);
            firstPoint = false;
          } else {
            // Curvas de Bézier más suaves
            const prevPoint = data[index - 1];
            const prevX = canvas.width - ((currentTime - prevPoint.time) * canvas.width / WINDOW_WIDTH_MS);
            const xc = (prevX + x) / 2;
            const yc = (y + canvas.height - (((prevPoint.value - minVal) / range) * canvas.height * 0.8 + canvas.height * 0.1)) / 2;
            ctx.quadraticCurveTo(prevX, y, xc, yc);
          }

          // Sistema mejorado de detección de arritmias
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
                const opacity = Math.max(0.3, Math.min(1, (currentTime - lastPeakRef.current) / MIN_PEAK_INTERVAL));
                
                ctx.save();
                ctx.fillStyle = `rgba(255, 0, 0, ${opacity})`;
                ctx.strokeStyle = `rgba(255, 0, 0, ${opacity})`;
                
                // Marcador de arritmia mejorado
                ctx.shadowColor = '#ff0000';
                ctx.shadowBlur = 30;
                
                // Círculo más grande
                ctx.beginPath();
                ctx.arc(x, y, 12, 0, 2 * Math.PI);
                ctx.fill();
                
                // Línea vertical con patrón mejorado
                ctx.beginPath();
                ctx.setLineDash([10, 10]);
                ctx.lineWidth = 3;
                ctx.moveTo(x, 0);
                ctx.lineTo(x, canvas.height);
                ctx.stroke();
                
                // Texto de arritmia más visible
                ctx.shadowBlur = 5;
                ctx.font = 'bold 20px monospace';
                ctx.fillText('ARRITMIA', x + 15, y - 20);
                
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
    <div className="bg-black/40 backdrop-blur-sm rounded-lg p-4 w-full h-[80vh] max-h-[800px]">
      <div className="flex justify-between items-center mb-2">
        <span className="text-lg font-semibold text-white/90">Monitor PPG</span>
        <span 
          className="text-lg font-medium"
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
        className="w-full h-full rounded bg-black/60"
      />
      <div className="mt-4 text-lg text-red-500 flex items-center gap-3">
        <div className="w-4 h-4 rounded-full bg-red-500 animate-pulse"></div>
        <span>Indicador de Arritmia</span>
      </div>
    </div>
  );
};

export default PPGSignalMeter;
