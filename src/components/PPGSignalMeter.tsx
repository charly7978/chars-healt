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
  const dataBufferRef = useRef<CircularBuffer>(new CircularBuffer(600));
  const baselineRef = useRef<number | null>(null);
  const lastValueRef = useRef<number>(0);
  const lastArrhythmiaTime = useRef<number>(0);
  
  const WINDOW_WIDTH_MS = 2500;
  const CANVAS_WIDTH = 2400;
  const CANVAS_HEIGHT = 600;
  const verticalScale = 85.0;
  const GRID_COLOR = '#1e40af';
  const WAVE_COLOR = '#0ea5e9';
  const ARRHYTHMIA_COLOR = '#ef4444';

  const getRiskColor = (value: number, type: 'cholesterol' | 'temperature' | 'rmssd'): string => {
    switch(type) {
      case 'cholesterol':
        if (value < 200) return 'text-emerald-400';
        if (value < 240) return 'text-yellow-400';
        return 'text-red-400';
      case 'temperature':
        if (value >= 36.5 && value <= 37.2) return 'text-emerald-400';
        if (value > 37.2 && value <= 38) return 'text-yellow-400';
        return 'text-red-400';
      case 'rmssd':
        if (value >= 20 && value <= 50) return 'text-emerald-400';
        if (value > 50) return 'text-yellow-400';
        return 'text-red-400';
      default:
        return 'text-white';
    }
  };

  const drawGrid = useCallback((ctx: CanvasRenderingContext2D) => {
    ctx.fillStyle = '#0A1628';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    ctx.strokeStyle = 'rgba(30, 64, 175, 0.15)';
    ctx.lineWidth = 0.5;
    
    for (let x = 0; x < CANVAS_WIDTH; x += 20) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, CANVAS_HEIGHT);
      ctx.stroke();
    }
    
    for (let y = 0; y < CANVAS_HEIGHT; y += 20) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(CANVAS_WIDTH, y);
      ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(30, 64, 175, 0.3)';
    ctx.lineWidth = 1;
    
    for (let x = 0; x < CANVAS_WIDTH; x += 100) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, CANVAS_HEIGHT);
      ctx.stroke();
      
      if (x % 200 === 0) {
        ctx.fillStyle = 'rgba(148, 163, 184, 0.8)';
        ctx.font = '12px Inter';
        ctx.fillText(`${x/20}ms`, x, CANVAS_HEIGHT - 5);
      }
    }
    
    for (let y = 0; y < CANVAS_HEIGHT; y += 100) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(CANVAS_WIDTH, y);
      ctx.stroke();
      
      if (y % 100 === 0) {
        const amplitude = ((CANVAS_HEIGHT * 0.45) - y) / verticalScale;
        ctx.fillStyle = 'rgba(148, 163, 184, 0.8)';
        ctx.font = '12px Inter';
        ctx.fillText(amplitude.toFixed(2), 5, y + 10);
      }
    }

    ctx.strokeStyle = 'rgba(30, 64, 175, 0.5)';
    ctx.lineWidth = 1.5;
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
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    const now = Date.now();

    if (baselineRef.current === null) {
      baselineRef.current = value;
    } else {
      baselineRef.current = baselineRef.current * 0.95 + value * 0.05;
    }

    const normalizedValue = (value - (baselineRef.current || 0)) * verticalScale;
    
    const isArrhythmia = rawArrhythmiaData && 
                        arrhythmiaStatus?.includes("ARRITMIA") && 
                        now - rawArrhythmiaData.timestamp < 1000;

    if (isArrhythmia) {
      lastArrhythmiaTime.current = now;
    }

    dataBufferRef.current.push({
      time: now,
      value: normalizedValue,
      isArrhythmia,
      isWaveStart: lastValueRef.current < 0 && normalizedValue >= 0
    });

    drawGrid(ctx);

    const points = dataBufferRef.current.getPoints().filter(
      point => (now - point.time) <= WINDOW_WIDTH_MS
    );

    if (points.length > 1) {
      ctx.beginPath();
      ctx.strokeStyle = WAVE_COLOR;
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';

      let firstPoint = true;
      let lastX = 0;
      let lastY = 0;

      points.forEach((point, index) => {
        const x = CANVAS_WIDTH - ((now - point.time) * CANVAS_WIDTH / WINDOW_WIDTH_MS);
        const y = CANVAS_HEIGHT * 0.45 - point.value;
        
        if (firstPoint) {
          ctx.moveTo(x, y);
          firstPoint = false;
        } else {
          const cpx = (lastX + x) / 2;
          const cpy = (lastY + y) / 2;
          ctx.quadraticCurveTo(lastX, lastY, cpx, cpy);
        }
        
        lastX = x;
        lastY = y;

        if (point.isArrhythmia) {
          ctx.stroke();
          ctx.beginPath();
          ctx.strokeStyle = ARRHYTHMIA_COLOR;
          ctx.lineWidth = 3;
          ctx.setLineDash([3, 3]);
          ctx.moveTo(x, y);
          
          if (index < points.length - 1) {
            const nextPoint = points[index + 1];
            const nextX = CANVAS_WIDTH - ((now - nextPoint.time) * CANVAS_WIDTH / WINDOW_WIDTH_MS);
            const nextY = CANVAS_HEIGHT * 0.45 - nextPoint.value;
            ctx.lineTo(nextX, nextY);
          }
          
          ctx.stroke();
          ctx.setLineDash([]);
          
          ctx.beginPath();
          ctx.arc(x, y, 5, 0, Math.PI * 2);
          ctx.fillStyle = ARRHYTHMIA_COLOR;
          ctx.fill();
          
          ctx.beginPath();
          ctx.arc(x, y, 10, 0, Math.PI * 2);
          ctx.strokeStyle = '#fbbf24';
          ctx.lineWidth = 2;
          ctx.stroke();
          
          ctx.font = 'bold 12px Inter';
          ctx.fillStyle = ARRHYTHMIA_COLOR;
          ctx.textAlign = 'center';
          ctx.fillText('LATIDO PREMATURO', x, y - 20);
          
          ctx.beginPath();
          ctx.strokeStyle = WAVE_COLOR;
          ctx.lineWidth = 2;
          ctx.setLineDash([]);
        }
      });
      
      ctx.stroke();

      points.forEach((point, i) => {
        if (i > 0 && i < points.length - 1) {
          const x = CANVAS_WIDTH - ((now - point.time) * CANVAS_WIDTH / WINDOW_WIDTH_MS);
          const y = CANVAS_HEIGHT * 0.45 - point.value;
          
          if (point.value > points[i-1].value && point.value > points[i+1].value) {
            ctx.beginPath();
            ctx.arc(x, y, 3, 0, Math.PI * 2);
            ctx.fillStyle = '#60A5FA';
            ctx.fill();
            
            ctx.font = '10px Inter';
            ctx.fillStyle = '#60A5FA';
            ctx.textAlign = 'center';
            ctx.fillText(Math.abs(point.value / verticalScale).toFixed(2), x, y - 10);
          }
          
          if (point.value < points[i-1].value && point.value < points[i+1].value) {
            ctx.beginPath();
            ctx.arc(x, y, 2, 0, Math.PI * 2);
            ctx.fillStyle = '#3b82f6';
            ctx.fill();
          }
        }
      });
    }
  }, [value, isFingerDetected, drawGrid, arrhythmiaStatus, rawArrhythmiaData]);

  useEffect(() => {
    let animationFrame: number;
    const animate = () => {
      renderSignal();
      animationFrame = requestAnimationFrame(animate);
    };
    animate();
    return () => cancelAnimationFrame(animationFrame);
  }, [renderSignal]);

  const handleReset = useCallback(() => {
    dataBufferRef.current = new CircularBuffer(600);
    baselineRef.current = null;
    lastValueRef.current = 0;
    lastArrhythmiaTime.current = 0;
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

      <div className="relative w-full h-[calc(100vh-16rem)] overflow-hidden">
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          className="absolute top-0 left-0 w-full h-full scale-[0.8] origin-top"
          style={{ imageRendering: 'crisp-edges' }}
        />
      </div>

      {/* Displays médicos */}
      <div className="fixed bottom-16 left-0 right-0 grid grid-cols-3 gap-4 px-4">
        {arrhythmiaStatus && (
          <div className="bg-[#0A1628]/90 backdrop-blur-sm rounded-lg p-4 border border-blue-900/30">
            <h3 className="text-sm font-semibold text-white mb-2">Estado Cardíaco</h3>
            <div className="grid gap-y-2 text-sm">
              <span className={`font-medium ${
                arrhythmiaStatus.includes("ARRITMIA") ? 'text-red-400' : 'text-emerald-400'
              }`}>
                {arrhythmiaStatus}
              </span>
              {rawArrhythmiaData && (
                <>
                  <div className="grid grid-cols-2 gap-1">
                    <span className="text-gray-400">RMSSD:</span>
                    <span className={getRiskColor(rawArrhythmiaData.rmssd, 'rmssd')}>
                      {rawArrhythmiaData.rmssd.toFixed(1)}ms
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-1">
                    <span className="text-gray-400">Variación RR:</span>
                    <span className={rawArrhythmiaData.rrVariation > 20 ? 'text-red-400' : 'text-emerald-400'}>
                      {rawArrhythmiaData.rrVariation.toFixed(1)}%
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {cholesterolData && (
          <div className="bg-[#0A1628]/90 backdrop-blur-sm rounded-lg p-4 border border-blue-900/30">
            <h3 className="text-sm font-semibold text-white mb-2">Colesterol</h3>
            <div className="grid grid-cols-2 gap-y-2 text-sm">
              <span className="text-gray-400">Total:</span>
              <span className={getRiskColor(cholesterolData.totalCholesterol, 'cholesterol')}>
                {cholesterolData.totalCholesterol} mg/dL
              </span>
              <span className="text-gray-400">HDL:</span>
              <span className={cholesterolData.hdl >= 40 ? 'text-emerald-400' : 'text-yellow-400'}>
                {cholesterolData.hdl} mg/dL
              </span>
              <span className="text-gray-400">LDL:</span>
              <span className={cholesterolData.ldl < 130 ? 'text-emerald-400' : 'text-red-400'}>
                {cholesterolData.ldl} mg/dL
              </span>
              {cholesterolData.triglycerides && (
                <>
                  <span className="text-gray-400">Triglicéridos:</span>
                  <span className={cholesterolData.triglycerides < 150 ? 'text-emerald-400' : 'text-red-400'}>
                    {cholesterolData.triglycerides} mg/dL
                  </span>
                </>
              )}
            </div>
          </div>
        )}

        {temperatureData && (
          <div className="bg-[#0A1628]/90 backdrop-blur-sm rounded-lg p-4 border border-blue-900/30">
            <h3 className="text-sm font-semibold text-white mb-2">Temperatura</h3>
            <div className="grid grid-cols-2 gap-y-2 text-sm">
              <span className="text-gray-400">Valor:</span>
              <span className={getRiskColor(temperatureData.value, 'temperature')}>
                {temperatureData.value.toFixed(1)}°C
              </span>
              <span className="text-gray-400">Ubicación:</span>
              <span className="text-white">{temperatureData.location}</span>
              <span className="text-gray-400">Tendencia:</span>
              <span className={`text-white ${
                temperatureData.trend === 'rising' ? 'text-yellow-400' :
                temperatureData.trend === 'falling' ? 'text-blue-400' :
                'text-emerald-400'
              }`}>
                {temperatureData.trend === 'rising' ? '↗ Subiendo' :
                 temperatureData.trend === 'falling' ? '↘ Bajando' :
                 '→ Estable'}
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="fixed bottom-0 left-0 right-0 h-14 grid grid-cols-2 gap-px bg-[#0A1628]/90 backdrop-blur-sm border-t border-blue-900/30">
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
