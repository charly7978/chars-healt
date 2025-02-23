
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
  const CANVAS_WIDTH = 1000; // Aumentado de 800 a 1000
  const CANVAS_HEIGHT = 400; // Aumentado de 300 a 400
  const MIN_PEAK_INTERVAL = 800; // Aumentado de 300 a 800ms para hacer más lento el parpadeo
  const lastPeakRef = useRef<number>(0);
  const animationFrameRef = useRef<number>();

  useEffect(() => {
    if (!canvasRef.current || !isFingerDetected) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const currentTime = Date.now();
    
    // Agregar nuevo punto de datos con interpolación para suavizar
    const lastPoint = dataRef.current[dataRef.current.length - 1];
    if (lastPoint) {
      const timeDiff = currentTime - lastPoint.time;
      const valueDiff = value - lastPoint.value;
      const steps = Math.min(Math.floor(timeDiff / 16), 5); // max 5 puntos interpolados
      
      for (let i = 1; i <= steps; i++) {
        const interpolatedTime = lastPoint.time + (timeDiff * (i / steps));
        const interpolatedValue = lastPoint.value + (valueDiff * (i / steps));
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

    // Mantener solo los últimos 6 segundos de datos
    const cutoffTime = currentTime - WINDOW_WIDTH_MS;
    dataRef.current = dataRef.current.filter(point => point.time >= cutoffTime);

    const render = () => {
      // Limpiar canvas
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Dibujar cuadrícula con un verde más suave
      ctx.strokeStyle = 'rgba(0, 255, 0, 0.15)';
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

        // Dibujar onda PPG con efecto de brillo
        ctx.shadowColor = '#00ff00';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.strokeStyle = '#00ff00';
        ctx.lineWidth = 2.5;

        data.forEach((point, index) => {
          const x = canvas.width - ((currentTime - point.time) * canvas.width / WINDOW_WIDTH_MS);
          const normalizedY = (point.value - minVal) / range;
          const y = canvas.height - (normalizedY * canvas.height * 0.8 + canvas.height * 0.1);
          
          if (index === 0) {
            ctx.moveTo(x, y);
          } else {
            // Usar curvas de Bézier para suavizar la línea
            const prevPoint = data[index - 1];
            const prevX = canvas.width - ((currentTime - prevPoint.time) * canvas.width / WINDOW_WIDTH_MS);
            const xc = (prevX + x) / 2;
            ctx.quadraticCurveTo(prevX, y, xc, y);
          }

          // Detectar y marcar arritmias con una transición más suave
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
                
                // Círculo rojo en el pico con brillo
                ctx.shadowColor = '#ff0000';
                ctx.shadowBlur = 15;
                ctx.beginPath();
                ctx.arc(x, y, 6, 0, 2 * Math.PI);
                ctx.fill();
                
                // Línea vertical roja punteada con desvanecimiento
                ctx.beginPath();
                ctx.setLineDash([5, 5]);
                ctx.moveTo(x, 0);
                ctx.lineTo(x, canvas.height);
                ctx.stroke();
                
                // Texto "ARRITMIA" con mejor visibilidad
                ctx.shadowBlur = 0;
                ctx.font = 'bold 14px monospace';
                ctx.fillText('ARRITMIA', x + 8, y - 15);
                
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
    <div className="bg-black/40 backdrop-blur-sm rounded-lg p-4 w-full max-w-[95vw] mx-auto">
      <div className="flex justify-between items-center mb-2">
        <span className="text-sm font-semibold text-white/90">Monitor PPG</span>
        <span 
          className="text-sm font-medium"
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
        className="w-full h-auto rounded bg-black/60"
      />
      <div className="mt-2 text-sm text-red-500 flex items-center gap-2">
        <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse"></div>
        <span>Indicador de Arritmia</span>
      </div>
    </div>
  );
};

export default PPGSignalMeter;
