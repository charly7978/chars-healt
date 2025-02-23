import React, { useEffect, useRef, useState } from 'react';

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
      <canvas
        ref={canvasRef}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        className="w-full h-full"
      />

      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-0 right-0 bg-black/40">
          <div className="flex justify-between items-center px-6 py-4">
            <div className="flex items-center gap-4">
              <span className="text-2xl font-bold text-gray-100">PPG</span>
              <span 
                className="text-lg font-medium"
                style={{ 
                  color: quality > 75 ? '#00ff00' : quality > 50 ? '#ffff00' : '#ff0000' 
                }}
              >
                {isFingerDetected ? `${quality}%` : 'NO SIGNAL'}
              </span>
            </div>
          </div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 bg-black/40">
          <div className="grid grid-cols-2">
            <button 
              onClick={onStartMeasurement}
              className="measure-button flex items-center justify-center gap-3 px-6 py-4 text-gray-100 hover:text-green-500 transition-colors"
            >
              <span className="text-lg font-medium">INICIAR</span>
            </button>

            <button 
              onClick={onReset}
              className="flex items-center justify-center gap-3 px-6 py-4 text-gray-100 hover:text-red-500 transition-colors"
            >
              <span className="text-lg font-medium">RESET</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PPGSignalMeter;
