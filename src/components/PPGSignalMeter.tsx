import React, { useEffect, useRef, useCallback, memo } from 'react';
import { Fingerprint } from 'lucide-react';
import { CircularBuffer, PPGDataPoint } from '../utils/CircularBuffer';

// ESTA APPS ES DE MEDICION ULTRA REAL - PROHIBIDA CUALQUIER SIMULACION - NO ESTA PERMITIDO HACER MOVIMIENTOS POR CUENTA DE LA I.A SIN AUTORIZACION DEL USUARIO

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
  cholesterolData?: {
    totalCholesterol: number;
    hdl: number;
    ldl: number;
    triglycerides?: number;
  } | null;
  temperatureData?: {
    value: number;
    trend: 'rising' | 'falling' | 'stable';
    location: string;
  } | null;
}

const PPGSignalMeter: React.FC<PPGSignalMeterProps> = ({ 
  value, 
  quality, 
  isFingerDetected,
  onStartMeasurement,
  onReset,
  arrhythmiaStatus,
  rawArrhythmiaData,
  cholesterolData,
  temperatureData
}: PPGSignalMeterProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dataBufferRef = useRef<CircularBuffer>(new CircularBuffer(300));
  const baselineRef = useRef<number | null>(null);
  const lastValueRef = useRef<number>(0);
  
  const WINDOW_WIDTH_MS = 2200;  // 2.2 segundos de ventana
  const CANVAS_WIDTH = 1000;
  const CANVAS_HEIGHT = 400;
  const verticalScale = 48.0;
  const GRID_COLOR = '#1e40af';
  const WAVE_COLOR = '#0ea5e9';

  const drawGrid = useCallback((ctx: CanvasRenderingContext2D) => {
    // Fondo azul oscuro médico
    ctx.fillStyle = '#0A1628';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Cuadrícula menor
    ctx.strokeStyle = 'rgba(30, 64, 175, 0.15)';
    ctx.lineWidth = 0.5;
    
    for (let x = 0; x < CANVAS_WIDTH; x += 25) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, CANVAS_HEIGHT);
      ctx.stroke();
    }
    
    for (let y = 0; y < CANVAS_HEIGHT; y += 25) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(CANVAS_WIDTH, y);
      ctx.stroke();
    }

    // Cuadrícula mayor
    ctx.strokeStyle = 'rgba(30, 64, 175, 0.3)';
    ctx.lineWidth = 1;
    
    for (let x = 0; x < CANVAS_WIDTH; x += 100) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, CANVAS_HEIGHT);
      ctx.stroke();
      
      // Etiquetas de tiempo
      if (x % 200 === 0) {
        ctx.fillStyle = 'rgba(148, 163, 184, 0.8)';
        ctx.font = '10px Inter';
        ctx.fillText(`${x/10}ms`, x, CANVAS_HEIGHT - 5);
      }
    }
    
    for (let y = 0; y < CANVAS_HEIGHT; y += 100) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(CANVAS_WIDTH, y);
      ctx.stroke();
      
      // Etiquetas de amplitud
      if (y % 100 === 0) {
        const amplitude = ((CANVAS_HEIGHT * 0.45) - y) / verticalScale;
        ctx.fillStyle = 'rgba(148, 163, 184, 0.8)';
        ctx.font = '10px Inter';
        ctx.fillText(amplitude.toFixed(1), 5, y + 10);
      }
    }

    // Línea central punteada
    ctx.strokeStyle = 'rgba(30, 64, 175, 0.5)';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(0, CANVAS_HEIGHT * 0.45);
    ctx.lineTo(CANVAS_WIDTH, CANVAS_HEIGHT * 0.45);
    ctx.stroke();
    ctx.setLineDash([]);
  }, []);

  const renderSignal = useCallback(() => {
    if (!canvasRef.current || !isFingerDetected) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const now = Date.now();

    // Actualizar línea base
    if (baselineRef.current === null) {
      baselineRef.current = value;
    } else {
      baselineRef.current = baselineRef.current * 0.95 + value * 0.05;
    }

    // Normalizar y escalar valor
    const normalizedValue = (value - (baselineRef.current || 0)) * verticalScale;
    
    // Agregar punto al buffer
    dataBufferRef.current.push({
      time: now,
      value: normalizedValue,
      isArrhythmia: false,
      isWaveStart: false
    });

    // Dibujar fondo y cuadrícula
    drawGrid(ctx);

    // Obtener puntos visibles
    const points = dataBufferRef.current.getPoints().filter(
      point => (now - point.time) <= WINDOW_WIDTH_MS
    );

    if (points.length > 1) {
      // Dibujar línea de señal
      ctx.beginPath();
      ctx.strokeStyle = WAVE_COLOR;
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';

      points.forEach((point, index) => {
        const x = CANVAS_WIDTH - ((now - point.time) * CANVAS_WIDTH / WINDOW_WIDTH_MS);
        const y = CANVAS_HEIGHT * 0.45 - point.value;
        
        if (index === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });

      ctx.stroke();

      // Marcar picos
      points.forEach((point, i) => {
        if (i > 0 && i < points.length - 1) {
          if (point.value > points[i-1].value && point.value > points[i+1].value) {
            const x = CANVAS_WIDTH - ((now - point.time) * CANVAS_WIDTH / WINDOW_WIDTH_MS);
            const y = CANVAS_HEIGHT * 0.45 - point.value;
            
            ctx.beginPath();
            ctx.arc(x, y, 3, 0, Math.PI * 2);
            ctx.fillStyle = '#60A5FA';
            ctx.fill();
          }
        }
      });
    }
  }, [value, isFingerDetected, drawGrid]);

  useEffect(() => {
    const animationFrame = requestAnimationFrame(renderSignal);
    return () => cancelAnimationFrame(animationFrame);
  }, [renderSignal]);

  const handleReset = useCallback(() => {
    dataBufferRef.current = new CircularBuffer(300);
    baselineRef.current = null;
    lastValueRef.current = 0;
    onReset();
  }, [onReset]);

  return (
    <div className="fixed inset-0 bg-gradient-to-b from-[#0A1628] to-[#0F172A]">
      <div className="absolute top-0 left-0 right-0 p-4 flex items-center justify-between bg-[#0A1628]/80 backdrop-blur-sm border-b border-blue-900/30">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold">
            <span className="text-white">Chars</span>
            <span className="text-[#60A5FA]">Healt</span>
          </h1>
          
          <div className="h-8 w-px bg-blue-900/30" />
          
          <div className="flex items-center gap-2">
            <Fingerprint 
              className={`h-6 w-6 transition-colors duration-300 ${
                !isFingerDetected ? 'text-gray-500' :
                quality > 75 ? 'text-emerald-500' :
                quality > 50 ? 'text-amber-500' :
                'text-red-500'
              }`}
            />
            <div className="flex flex-col">
              <div className="h-1 w-24 bg-blue-900/30 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-blue-500 to-blue-400 transition-all duration-300"
                  style={{ width: `${quality}%` }}
                />
              </div>
              <span className="text-[10px] font-medium text-blue-400">
                {quality}% Calidad de señal
              </span>
            </div>
          </div>
        </div>
      </div>

      <canvas
        ref={canvasRef}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        className="w-full h-[calc(100vh-12rem)]"
      />

      {/* Displays médicos */}
      <div className="absolute bottom-16 left-0 right-0 grid grid-cols-2 gap-4 p-4">
        {cholesterolData && (
          <div className="bg-[#0A1628]/80 backdrop-blur-sm rounded-lg p-4 border border-blue-900/30">
            <h3 className="text-sm font-semibold text-blue-400 mb-2">Colesterol</h3>
            <div className="grid grid-cols-2 gap-y-2 text-sm">
              <span className="text-gray-400">Total:</span>
              <span className="text-white font-medium">{cholesterolData.totalCholesterol} mg/dL</span>
              <span className="text-gray-400">HDL:</span>
              <span className="text-white font-medium">{cholesterolData.hdl} mg/dL</span>
              <span className="text-gray-400">LDL:</span>
              <span className="text-white font-medium">{cholesterolData.ldl} mg/dL</span>
              {cholesterolData.triglycerides && (
                <>
                  <span className="text-gray-400">Triglicéridos:</span>
                  <span className="text-white font-medium">{cholesterolData.triglycerides} mg/dL</span>
                </>
              )}
            </div>
          </div>
        )}

        {temperatureData && (
          <div className="bg-[#0A1628]/80 backdrop-blur-sm rounded-lg p-4 border border-blue-900/30">
            <h3 className="text-sm font-semibold text-blue-400 mb-2">Temperatura</h3>
            <div className="grid grid-cols-2 gap-y-2 text-sm">
              <span className="text-gray-400">Valor:</span>
              <span className="text-white font-medium">{temperatureData.value.toFixed(1)}°C</span>
              <span className="text-gray-400">Ubicación:</span>
              <span className="text-white font-medium">{temperatureData.location}</span>
              <span className="text-gray-400">Tendencia:</span>
              <span className="text-white font-medium">
                {temperatureData.trend === 'rising' ? '↗ Subiendo' :
                 temperatureData.trend === 'falling' ? '↘ Bajando' :
                 '→ Estable'}
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="fixed bottom-0 left-0 right-0 h-14 grid grid-cols-2 gap-px bg-[#0A1628]/80 backdrop-blur-sm border-t border-blue-900/30">
        <button 
          onClick={onStartMeasurement}
          className="text-white text-lg font-semibold bg-blue-500/10 hover:bg-blue-500/20 transition-colors"
        >
          INICIAR
        </button>
        <button 
          onClick={handleReset}
          className="text-white text-lg font-semibold bg-blue-500/10 hover:bg-blue-500/20 transition-colors"
        >
          RESET
        </button>
      </div>
    </div>
  );
};

// ESTA APPS ES DE MEDICION ULTRA REAL - PROHIBIDA CUALQUIER SIMULACION - NO ESTA PERMITIDO HACER MOVIMIENTOS POR CUENTA DE LA I.A SIN AUTORIZACION DEL USUARIO

export default memo(PPGSignalMeter);
