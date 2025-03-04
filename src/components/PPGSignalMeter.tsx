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
  
  // Constantes para el gráfico
  const WINDOW_WIDTH_MS = 2500;
  const CANVAS_WIDTH = 2400;
  const CANVAS_HEIGHT = 600;
  const verticalScale = 95.0; // Aumentado para mejor detalle
  
  // Colores del gráfico
  const COLORS = {
    background: '#051527',
    grid: {
      minor: 'rgba(30, 64, 175, 0.1)',
      major: 'rgba(30, 64, 175, 0.2)',
      text: 'rgba(148, 163, 184, 0.8)'
    },
    wave: {
      normal: '#22d3ee', // Cyan más brillante
      arrhythmia: '#ef4444',
      peak: '#60a5fa',
      valley: '#3b82f6'
    }
  };

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
    // Fondo
    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Cuadrícula menor (más sutil)
    ctx.strokeStyle = COLORS.grid.minor;
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

    // Cuadrícula mayor
    ctx.strokeStyle = COLORS.grid.major;
    ctx.lineWidth = 1;
    
    for (let x = 0; x < CANVAS_WIDTH; x += 100) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, CANVAS_HEIGHT);
      ctx.stroke();
      
      if (x % 200 === 0) {
        ctx.fillStyle = COLORS.grid.text;
        ctx.font = '11px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
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
        ctx.fillStyle = COLORS.grid.text;
        ctx.font = '11px "JetBrains Mono", monospace';
        ctx.textAlign = 'left';
        ctx.fillText(amplitude.toFixed(2), 5, y + 10);
      }
    }

    // Línea central
    ctx.strokeStyle = COLORS.grid.major;
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
      // Dibujar línea principal con sombra
      ctx.shadowColor = COLORS.wave.normal;
      ctx.shadowBlur = 2;
      ctx.beginPath();
      ctx.strokeStyle = COLORS.wave.normal;
      ctx.lineWidth = 1.5;
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
          ctx.shadowBlur = 4;
          ctx.beginPath();
          ctx.strokeStyle = COLORS.wave.arrhythmia;
          ctx.lineWidth = 2;
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
          
          // Marcar arritmia
          ctx.beginPath();
          ctx.arc(x, y, 4, 0, Math.PI * 2);
          ctx.fillStyle = COLORS.wave.arrhythmia;
          ctx.fill();
          
          ctx.beginPath();
          ctx.arc(x, y, 8, 0, Math.PI * 2);
          ctx.strokeStyle = '#fbbf24';
          ctx.lineWidth = 1.5;
          ctx.stroke();
          
          ctx.font = 'bold 11px "JetBrains Mono", monospace';
          ctx.fillStyle = COLORS.wave.arrhythmia;
          ctx.textAlign = 'center';
          ctx.fillText('LATIDO PREMATURO', x, y - 15);
          
          ctx.shadowBlur = 2;
          ctx.beginPath();
          ctx.strokeStyle = COLORS.wave.normal;
          ctx.lineWidth = 1.5;
          ctx.setLineDash([]);
        }
      });
      
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Marcar picos y valles
      points.forEach((point, i) => {
        if (i > 0 && i < points.length - 1) {
          const x = CANVAS_WIDTH - ((now - point.time) * CANVAS_WIDTH / WINDOW_WIDTH_MS);
          const y = CANVAS_HEIGHT * 0.45 - point.value;
          
          if (point.value > points[i-1].value && point.value > points[i+1].value) {
            ctx.beginPath();
            ctx.arc(x, y, 2, 0, Math.PI * 2);
            ctx.fillStyle = COLORS.wave.peak;
            ctx.fill();
            
            ctx.font = '10px "JetBrains Mono", monospace';
            ctx.fillStyle = COLORS.wave.peak;
            ctx.textAlign = 'center';
            ctx.fillText(Math.abs(point.value / verticalScale).toFixed(2), x, y - 8);
          }
          
          if (point.value < points[i-1].value && point.value < points[i+1].value) {
            ctx.beginPath();
            ctx.arc(x, y, 1.5, 0, Math.PI * 2);
            ctx.fillStyle = COLORS.wave.valley;
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
    <div className="fixed inset-0 bg-gradient-to-b from-[#051527] to-[#0A1628]">
      {/* Header */}
      <div className="fixed top-0 left-0 right-0 h-16 flex items-center justify-between px-4 bg-[#051527]/90 backdrop-blur-sm border-b border-blue-900/30 z-50">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold">
            <span className="text-white">Chars</span>
            <span className="text-[#22d3ee]">Healt</span>
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
                  className="h-full bg-gradient-to-r from-[#22d3ee] to-[#60a5fa] transition-all duration-300"
                  style={{ width: `${quality}%` }}
                />
              </div>
              <span className="text-[10px] font-medium text-[#22d3ee]">
                {quality}% Calidad de señal
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Contenedor principal */}
      <div className="fixed inset-0 pt-16 pb-14 flex flex-col">
        {/* Gráfico */}
        <div className="flex-1 relative overflow-hidden pt-4">
          <canvas
            ref={canvasRef}
            width={CANVAS_WIDTH}
            height={CANVAS_HEIGHT}
            className="absolute top-4 left-0 w-full h-[calc(100%-2rem)] scale-[0.8] origin-top"
            style={{ imageRendering: 'crisp-edges' }}
          />
        </div>

        {/* Displays médicos */}
        <div className="h-32 px-4 py-2 grid grid-cols-3 gap-4 bg-[#051527]/90 backdrop-blur-sm z-10">
          {arrhythmiaStatus && (
            <div className="bg-[#051527]/90 backdrop-blur-sm rounded-lg p-4 border border-blue-900/30">
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
            <div className="bg-[#051527]/90 backdrop-blur-sm rounded-lg p-4 border border-blue-900/30">
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
            <div className="bg-[#051527]/90 backdrop-blur-sm rounded-lg p-4 border border-blue-900/30">
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
      </div>

      {/* Botones */}
      <div className="fixed bottom-0 left-0 right-0 h-14 grid grid-cols-2 gap-px bg-[#051527]/90 backdrop-blur-sm border-t border-blue-900/30 z-50">
        <button 
          onClick={onStartMeasurement}
          className="text-white text-lg font-semibold bg-[#22d3ee]/10 hover:bg-[#22d3ee]/20 transition-colors"
        >
          INICIAR
        </button>
        <button 
          onClick={handleReset}
          className="text-white text-lg font-semibold bg-[#22d3ee]/10 hover:bg-[#22d3ee]/20 transition-colors"
        >
          RESET
        </button>
      </div>
    </div>
  );
};

// ESTA APPS ES DE MEDICION ULTRA REAL - PROHIBIDA CUALQUIER SIMULACION - NO ESTA PERMITIDO HACER MOVIMIENTOS POR CUENTA DE LA I.A SIN AUTORIZACION DEL USUARIO

export default memo(PPGSignalMeter);
