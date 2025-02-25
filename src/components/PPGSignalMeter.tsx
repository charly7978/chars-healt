
import React, { useEffect, useRef } from 'react';
import { Fingerprint } from 'lucide-react';

export interface PPGSignalMeterProps {
  value: number;
  quality: number;
  isFingerDetected: boolean;
  onStartMeasurement: () => void;
  onReset: () => void;
  arrhythmiaStatus: string;
  rawArrhythmiaData?: {
    timestamp: number;
    rmssd: number;
    rrVariation: number;
  } | null;
}

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
  const baselineRef = useRef<number | null>(null);
  const lastValueRef = useRef<number>(0);

  const WINDOW_WIDTH_MS = 5000;
  const CANVAS_WIDTH = 1000;
  const CANVAS_HEIGHT = 200;
  const verticalScale = 64.0; // Aumentado para mejor visualización

  useEffect(() => {
    if (!canvasRef.current || !isFingerDetected) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const currentTime = Date.now();
    
    if (baselineRef.current === null) {
      baselineRef.current = value;
    } else {
      baselineRef.current = baselineRef.current * 0.95 + value * 0.05;
    }

    const normalizedValue = (value - (baselineRef.current ?? 0)) * verticalScale;
    lastValueRef.current = normalizedValue;

    // Dibujar fondo
    ctx.fillStyle = '#F8FAFC';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Dibujar línea central
    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, canvas.height / 2);
    ctx.lineTo(canvas.width, canvas.height / 2);
    ctx.stroke();

    // Dibujar señal
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#0ea5e9';
    ctx.beginPath();
    ctx.moveTo(canvas.width - 10, canvas.height / 2 + normalizedValue);
    ctx.lineTo(canvas.width, canvas.height / 2 + normalizedValue);
    ctx.stroke();

    // Efecto de desvanecimiento
    ctx.fillStyle = 'rgba(248, 250, 252, 0.1)';
    ctx.fillRect(0, 0, canvas.width - 10, canvas.height);

  }, [value, quality, isFingerDetected]);

  return (
    <div className="fixed inset-0 bg-gradient-to-b from-white to-slate-50/30">
      <div className="absolute top-0 left-0 right-0 p-2 flex justify-between items-center bg-white/60 backdrop-blur-sm border-b border-slate-100 shadow-sm">
        <div className="flex items-center gap-3 flex-1">
          <span className="text-xl font-bold text-slate-700">PPG</span>
          <div className="flex flex-col flex-1">
            <div className={`h-1.5 w-[80%] mx-auto rounded-full bg-gradient-to-r ${getQualityColor(quality)} transition-all duration-1000 ease-in-out`}>
              <div
                className="h-full rounded-full bg-white/20 animate-pulse transition-all duration-1000"
                style={{ width: `${quality}%` }}
              />
            </div>
            <span className="text-[9px] text-center mt-0.5 font-medium transition-colors duration-700" 
                  style={{ color: quality > 60 ? '#0EA5E9' : '#F59E0B' }}>
              {getQualityText(quality)}
            </span>
          </div>
          
          <div className="flex flex-col items-center">
            <Fingerprint 
              size={56}
              className={`transition-all duration-700 ${
                isFingerDetected 
                  ? 'text-emerald-500 scale-100 drop-shadow-md'
                  : 'text-slate-300 scale-95'
              }`}
            />
            <span className="text-xs font-medium text-slate-600 transition-all duration-700">
              {isFingerDetected ? 'Dedo detectado' : 'Ubique su dedo en el lente'}
            </span>
          </div>
        </div>
      </div>

      <canvas
        ref={canvasRef}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        className="w-full h-[calc(40vh)] mt-20"
      />

      <div className="fixed bottom-0 left-0 right-0 h-[60px] grid grid-cols-2 gap-px bg-white/80 backdrop-blur-sm border-t border-slate-100">
        <button 
          onClick={onStartMeasurement}
          className="w-full h-full bg-white/80 hover:bg-slate-50/80 text-xl font-bold text-slate-700 transition-all duration-300"
        >
          INICIAR
        </button>
        <button 
          onClick={onReset}
          className="w-full h-full bg-white/80 hover:bg-slate-50/80 text-xl font-bold text-slate-700 transition-all duration-300"
        >
          RESET
        </button>
      </div>
    </div>
  );
};

const getQualityColor = (quality: number): string => {
  if (quality > 90) return 'from-emerald-500/80 to-emerald-400/80';
  if (quality > 75) return 'from-sky-500/80 to-sky-400/80';
  if (quality > 60) return 'from-indigo-500/80 to-indigo-400/80';
  if (quality > 40) return 'from-amber-500/80 to-amber-400/80';
  return 'from-red-500/80 to-red-400/80';
};

const getQualityText = (quality: number): string => {
  if (quality > 90) return 'Excellent';
  if (quality > 75) return 'Very Good';
  if (quality > 60) return 'Good';
  if (quality > 40) return 'Fair';
  return 'Poor';
};

export default PPGSignalMeter;
