
import React, { useEffect, useRef, useCallback, useMemo } from 'react';
import { Fingerprint } from 'lucide-react';
import { CircularBuffer, PPGDataPoint } from '../utils/CircularBuffer';
import { debounce } from '../utils/performance';

interface PPGSignalMeterProps {
  value: number;
  quality: number;
  isFingerDetected: boolean;
  onStartMeasurement: () => void;
  onReset: () => void;
  arrhythmiaStatus?: string;
  rawArrhythmiaData?: {
    timestamp: number;
    rmssd: number;
    rrVariation: number;
  } | null;
}

const WINDOW_WIDTH_MS = 3000;
const CANVAS_WIDTH = window.innerWidth;
const CANVAS_HEIGHT = 200;
const GRID_SIZE_X = 50;
const GRID_SIZE_Y = 25;
const VERTICAL_SCALE = 50.0;
const SIGNAL_LINE_WIDTH = 2;
const GRID_COLOR = 'rgba(51, 65, 85, 0.1)';
const SIGNAL_COLOR = '#0EA5E9';
const ARRHYTHMIA_COLOR = '#DC2626';
const POINTS_PER_SEGMENT = 3;

const PPGSignalMeter: React.FC<PPGSignalMeterProps> = ({ 
  value, 
  quality, 
  isFingerDetected,
  onStartMeasurement,
  onReset,
  arrhythmiaStatus,
  rawArrhythmiaData
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dataBufferRef = useRef<CircularBuffer>(new CircularBuffer(300));
  const audioContextRef = useRef<AudioContext | null>(null);
  const oscillatorRef = useRef<OscillatorNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const lastBeepTimeRef = useRef<number>(0);
  const baselineRef = useRef<number>(0);
  const animationFrameRef = useRef<number>();

  useEffect(() => {
    // Inicializar el contexto de audio
    audioContextRef.current = new AudioContext();
    oscillatorRef.current = audioContextRef.current.createOscillator();
    gainNodeRef.current = audioContextRef.current.createGain();
    
    oscillatorRef.current.connect(gainNodeRef.current);
    gainNodeRef.current.connect(audioContextRef.current.destination);
    
    oscillatorRef.current.frequency.setValueAtTime(880, audioContextRef.current.currentTime);
    gainNodeRef.current.gain.setValueAtTime(0, audioContextRef.current.currentTime);
    oscillatorRef.current.start();

    return () => {
      if (oscillatorRef.current) {
        oscillatorRef.current.stop();
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  const playBeep = useCallback((peakValue: number) => {
    const now = Date.now();
    if (now - lastBeepTimeRef.current < 200) return;

    if (gainNodeRef.current && audioContextRef.current) {
      const gain = gainNodeRef.current.gain;
      const currentTime = audioContextRef.current.currentTime;
      
      gain.cancelScheduledValues(currentTime);
      gain.setValueAtTime(0, currentTime);
      gain.linearRampToValueAtTime(0.5, currentTime + 0.01);
      gain.linearRampToValueAtTime(0, currentTime + 0.05);
    }
    
    lastBeepTimeRef.current = now;
  }, []);

  const drawGrid = useCallback((ctx: CanvasRenderingContext2D) => {
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    
    // Dibujar cuadrícula
    ctx.beginPath();
    ctx.strokeStyle = GRID_COLOR;
    ctx.lineWidth = 0.5;

    for (let x = 0; x <= CANVAS_WIDTH; x += GRID_SIZE_X) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, CANVAS_HEIGHT);
    }

    for (let y = 0; y <= CANVAS_HEIGHT; y += GRID_SIZE_Y) {
      ctx.moveTo(0, y);
      ctx.lineTo(CANVAS_WIDTH, y);
    }
    ctx.stroke();

    // Línea central
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(51, 65, 85, 0.3)';
    ctx.lineWidth = 1;
    ctx.moveTo(0, CANVAS_HEIGHT / 2);
    ctx.lineTo(CANVAS_WIDTH, CANVAS_HEIGHT / 2);
    ctx.stroke();
    
    ctx.restore();
  }, []);

  const renderSignal = useCallback(() => {
    if (!canvasRef.current || !dataBufferRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    const now = Date.now();
    
    // Actualizar baseline
    if (baselineRef.current === 0) {
      baselineRef.current = value;
    } else {
      baselineRef.current = baselineRef.current * 0.95 + value * 0.05;
    }

    const normalizedValue = value - baselineRef.current;
    const scaledValue = normalizedValue * VERTICAL_SCALE;

    // Detectar picos para el beep
    if (Math.abs(scaledValue) > 30) {
      playBeep(scaledValue);
    }

    const dataPoint: PPGDataPoint = {
      time: now,
      value: scaledValue,
      isArrhythmia: arrhythmiaStatus?.includes("ARRITMIA") || false
    };
    
    dataBufferRef.current.push(dataPoint);

    // Renderizado optimizado
    ctx.save();
    drawGrid(ctx);

    const points = dataBufferRef.current.getPoints();
    if (points.length > 1) {
      let currentPath: PPGDataPoint[] = [];
      let isArrhythmiaSegment = points[0].isArrhythmia;

      points.forEach((point, index) => {
        if (point.isArrhythmia !== isArrhythmiaSegment || index === points.length - 1) {
          // Dibujar segmento actual
          if (currentPath.length > 0) {
            ctx.beginPath();
            ctx.strokeStyle = isArrhythmiaSegment ? ARRHYTHMIA_COLOR : SIGNAL_COLOR;
            ctx.lineWidth = SIGNAL_LINE_WIDTH;
            ctx.lineJoin = 'round';
            ctx.lineCap = 'round';

            currentPath.forEach((p, i) => {
              const x = canvas.width - ((now - p.time) * canvas.width / WINDOW_WIDTH_MS);
              const y = canvas.height / 2 - p.value;

              if (i === 0) {
                ctx.moveTo(x, y);
              } else if (i % POINTS_PER_SEGMENT === 0 || i === currentPath.length - 1) {
                ctx.lineTo(x, y);
              }
            });

            ctx.stroke();
          }

          // Comenzar nuevo segmento
          currentPath = [point];
          isArrhythmiaSegment = point.isArrhythmia;
        } else {
          currentPath.push(point);
        }
      });
    }

    ctx.restore();
    animationFrameRef.current = requestAnimationFrame(renderSignal);
  }, [value, arrhythmiaStatus, drawGrid, playBeep]);

  useEffect(() => {
    renderSignal();
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [renderSignal]);

  const handleStartMeasurement = useMemo(() => 
    debounce(onStartMeasurement, 300), 
    [onStartMeasurement]
  );

  const handleReset = useMemo(() => 
    debounce(onReset, 300), 
    [onReset]
  );

  const getQualityColor = useMemo(() => {
    if (!isFingerDetected) return 'from-gray-400 to-gray-500';
    if (quality > 75) return 'from-green-500 to-emerald-500';
    if (quality > 50) return 'from-yellow-500 to-orange-500';
    return 'from-red-500 to-rose-500';
  }, [quality, isFingerDetected]);

  const getQualityText = useMemo(() => {
    if (!isFingerDetected) return 'Sin detección';
    if (quality > 75) return 'Señal óptima';
    if (quality > 50) return 'Señal aceptable';
    return 'Señal débil';
  }, [quality, isFingerDetected]);

  return (
    <div className="fixed inset-0 bg-gradient-to-b from-white to-slate-50/30">
      <div className="absolute top-0 left-0 right-0 p-2 flex justify-between items-center bg-white/60 backdrop-blur-[2px] border-b border-slate-100">
        <div className="flex items-center gap-3">
          <span className="text-xl font-bold text-slate-700">PPG</span>
          <div className="w-[200px]">
            <div className={`h-1.5 w-full rounded-full bg-gradient-to-r ${getQualityColor}`}>
              <div
                className="h-full rounded-full bg-white/20 transition-all duration-1000"
                style={{ width: `${isFingerDetected ? quality : 0}%` }}
              />
            </div>
            <span className="text-[9px] text-center mt-0.5 font-medium block text-sky-500">
              {getQualityText}
            </span>
          </div>
        </div>

        <div className="flex flex-col items-center">
          <Fingerprint
            className={`h-12 w-12 transition-colors duration-300 ${
              !isFingerDetected ? 'text-gray-400' :
              quality > 75 ? 'text-green-500' :
              quality > 50 ? 'text-yellow-500' :
              'text-red-500'
            }`}
            strokeWidth={1.5}
          />
          <span className="text-[10px] text-center mt-0.5 font-medium text-slate-600">
            {isFingerDetected ? "Dedo detectado" : "Ubique su dedo"}
          </span>
        </div>
      </div>

      <canvas
        ref={canvasRef}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        className="w-full h-[calc(40vh)] mt-20"
        style={{ imageRendering: 'pixelated' }}
      />
    </div>
  );
};

export default PPGSignalMeter;
