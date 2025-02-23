
import React, { useRef, useEffect } from 'react';

interface PPGSignalMeterProps {
  value: number;
  quality: number;
  isFingerDetected: boolean;
  isComplete?: boolean;
}

const PPGSignalMeter = ({ value, quality, isFingerDetected, isComplete }: PPGSignalMeterProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lastValueRef = useRef(0);
  const positionRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw signal
    if (isFingerDetected) {
      ctx.strokeStyle = '#00FF00';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(positionRef.current - 1, canvas.height - lastValueRef.current * canvas.height);
      ctx.lineTo(positionRef.current, canvas.height - value * canvas.height);
      ctx.stroke();
    }

    // Update position
    positionRef.current = (positionRef.current + 1) % canvas.width;
    if (positionRef.current === 0) {
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    lastValueRef.current = value;
  }, [value, isFingerDetected]);

  return (
    <div className="bg-black/90 backdrop-blur rounded-lg p-3 border border-green-900">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${isFingerDetected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
          <span className="text-xs font-medium text-green-400">
            {isFingerDetected ? `Monitor PPG - ${quality}% Calidad` : 'Coloque su dedo en la cámara'}
          </span>
        </div>
      </div>
      <canvas
        ref={canvasRef}
        width={400}
        height={200}
        className="w-full rounded bg-black"
      />
    </div>
  );
};

export default PPGSignalMeter;
