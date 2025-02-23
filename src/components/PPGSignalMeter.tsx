
import React, { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

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
  const animationFrameRef = useRef<number>();
  const [scrollPosition, setScrollPosition] = useState(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const lastBeepTimeRef = useRef<number>(0);
  
  const CANVAS_WIDTH = 600; // Aumentado para mejor visualización
  const CANVAS_HEIGHT = 200; // Aumentado para mejor visualización
  const MAX_POINTS = 900; // 30 segundos a 30fps
  const VISIBLE_POINTS = 300; // 10 segundos visibles
  const MIN_BEEP_INTERVAL = 400; // Mínimo tiempo entre beeps (ms)

  useEffect(() => {
    // Inicializar contexto de audio para los beeps
    audioContextRef.current = new AudioContext();
    
    console.log("PPGSignalMeter effect - IsFingerDetected:", isFingerDetected, "IsComplete:", isComplete);
    
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  const playBeep = async (isPeak: boolean) => {
    if (!audioContextRef.current) return;
    
    const now = Date.now();
    if (now - lastBeepTimeRef.current < MIN_BEEP_INTERVAL) return;
    
    const oscillator = audioContextRef.current.createOscillator();
    const gainNode = audioContextRef.current.createGain();
    
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(880, audioContextRef.current.currentTime);
    
    gainNode.gain.setValueAtTime(0, audioContextRef.current.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.3, audioContextRef.current.currentTime + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContextRef.current.currentTime + 0.1);
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContextRef.current.destination);
    
    oscillator.start();
    oscillator.stop(audioContextRef.current.currentTime + 0.1);
    
    lastBeepTimeRef.current = now;
  };

  const render = () => {
    if (!canvasRef.current || !isFingerDetected) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Agregar punto actual
    const isPeak = quality > 75;
    if (isPeak) {
      playBeep(true);
    }
    
    dataRef.current.push({
      time: Date.now() - startTime,
      value: value,
      isPeak: isPeak
    });

    if (dataRef.current.length > MAX_POINTS) {
      if (onDataReady) {
        onDataReady(dataRef.current);
      }
      dataRef.current.shift();
    }

    // Limpiar canvas
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Dibujar grid
    ctx.strokeStyle = '#003300';
    ctx.lineWidth = 0.5;
    
    // Grid vertical (tiempo)
    for (let x = 0; x < CANVAS_WIDTH; x += 50) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, CANVAS_HEIGHT);
      ctx.stroke();
    }
    
    // Grid horizontal (amplitud)
    for (let y = 0; y < CANVAS_HEIGHT; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(CANVAS_WIDTH, y);
      ctx.stroke();
    }

    // Dibujar señal PPG
    if (dataRef.current.length > 1) {
      const startIdx = Math.max(0, dataRef.current.length - VISIBLE_POINTS - Math.floor(scrollPosition));
      const visibleData = dataRef.current.slice(startIdx, startIdx + VISIBLE_POINTS);

      // Señal principal
      ctx.beginPath();
      ctx.strokeStyle = '#00FF00';
      ctx.lineWidth = 2;

      visibleData.forEach((point, index) => {
        const x = (index / VISIBLE_POINTS) * CANVAS_WIDTH;
        const y = CANVAS_HEIGHT - (point.value * CANVAS_HEIGHT);
        
        if (index === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }

        // Marcar picos
        if (point.isPeak) {
          ctx.save();
          ctx.fillStyle = '#FF0000';
          ctx.beginPath();
          ctx.arc(x, y, 3, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      });
      ctx.stroke();
    }

    if (!isComplete) {
      animationFrameRef.current = requestAnimationFrame(render);
    }
  };

  useEffect(() => {
    if (isFingerDetected && !isComplete) {
      animationFrameRef.current = requestAnimationFrame(render);
    }
  }, [isFingerDetected, isComplete]);

  const handleScroll = (e: React.WheelEvent) => {
    if (isComplete && dataRef.current.length > VISIBLE_POINTS) {
      setScrollPosition(prev => {
        const newPos = prev + e.deltaY;
        const maxScroll = dataRef.current.length - VISIBLE_POINTS;
        return Math.max(0, Math.min(newPos, maxScroll));
      });
    }
  };

  return (
    <div className="bg-black/90 backdrop-blur rounded-lg p-3 border border-green-900">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${isFingerDetected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
          <span className="text-xs font-medium text-green-400">
            {isFingerDetected ? `Monitor PPG - ${quality}% Calidad` : 'Coloque su dedo en la cámara'}
          </span>
        </div>
        {isComplete && dataRef.current.length > VISIBLE_POINTS && (
          <span className="text-xs text-green-400">
            Scroll para ver historial
          </span>
        )}
      </div>
      <div 
        className="relative overflow-hidden"
        onWheel={handleScroll}
      >
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          className="w-full rounded bg-black"
        />
      </div>
    </div>
  );
};

export default PPGSignalMeter;
