import React, { useEffect, useRef, useCallback, useState } from 'react';
import { Fingerprint } from 'lucide-react';
import { CircularBuffer, PPGDataPoint } from '../utils/CircularBuffer';

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

const PPGSignalMeter = ({ 
  value, 
  quality, 
  isFingerDetected,
  onStartMeasurement,
  onReset,
  arrhythmiaStatus,
  rawArrhythmiaData
}: PPGSignalMeterProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dataBufferRef = useRef<CircularBuffer | null>(null);
  const baselineRef = useRef<number | null>(null);
  const lastValueRef = useRef<number | null>(null);
  const animationFrameRef = useRef<number>();
  const lastRenderTimeRef = useRef<number>(0);
  const lastArrhythmiaTime = useRef<number>(0);
  const arrhythmiaCountRef = useRef<number>(0);
  const [adaptiveScale, setAdaptiveScale] = useState<number>(28.0);
  const amplitudeHistoryRef = useRef<number[]>([]);
  const peakDetectedRef = useRef<boolean>(false);
  const peakTimeRef = useRef<number>(0);
  const peakAmplitudeRef = useRef<number>(0);
  const peakLocationsRef = useRef<{time: number, amplitude: number}[]>([]);
  
  // Parámetros optimizados
  const WINDOW_WIDTH_MS = 3600; // Ventana de visualización de 3.6 segundos
  const CANVAS_WIDTH = 700;
  const CANVAS_HEIGHT = 250;
  const GRID_SIZE_X = 25; 
  const GRID_SIZE_Y = 25;
  const SMOOTHING_FACTOR = 0.35; // Factor de suavizado óptimo
  const TARGET_FPS = 60;
  const FRAME_TIME = 1000 / TARGET_FPS;
  const BUFFER_SIZE = 800; // Buffer ampliado para mejor análisis
  const PEAK_HIGHLIGHT_DURATION = 500; // ms para resaltar un pico
  const PEAK_THRESHOLD = 0.001; // Umbral mínimo para considerar un pico
  const MAX_AMPLITUDE_SAMPLES = 100;
  const SCALE_ADJUSTMENT_FACTOR = 0.05;

  // Inicialización del buffer circular
  useEffect(() => {
    if (!dataBufferRef.current) {
      dataBufferRef.current = new CircularBuffer(BUFFER_SIZE);
    }
  }, []);

  // Sistema de escala adaptativa basado en la amplitud reciente de la señal
  useEffect(() => {
    if (value && isFingerDetected) {
      if (amplitudeHistoryRef.current.length >= MAX_AMPLITUDE_SAMPLES) {
        amplitudeHistoryRef.current.shift();
      }
      amplitudeHistoryRef.current.push(Math.abs(value));
      
      if (amplitudeHistoryRef.current.length > 20) {
        const sortedAmplitudes = [...amplitudeHistoryRef.current].sort((a, b) => b - a);
        const p90Amplitude = sortedAmplitudes[Math.floor(sortedAmplitudes.length * 0.1)];
        
        // Ajustar la escala para usar ~70% del espacio vertical
        const targetScale = (CANVAS_HEIGHT * 0.7) / (p90Amplitude * 2);
        
        setAdaptiveScale(scale => {
          const newScale = scale + (targetScale - scale) * SCALE_ADJUSTMENT_FACTOR;
          return Math.max(10, Math.min(50, newScale)); // Límites de escala
        });
      }
    }
  }, [value, isFingerDetected]);

  const getQualityColor = useCallback((q: number) => {
    if (!isFingerDetected) return 'from-gray-400 to-gray-500';
    if (q > 80) return 'from-green-500 to-emerald-500';
    if (q > 60) return 'from-yellow-500 to-orange-500';
    return 'from-red-500 to-rose-500';
  }, [isFingerDetected]);

  const getQualityText = useCallback((q: number) => {
    if (!isFingerDetected) return 'Sin detección';
    if (q > 80) return 'Señal óptima';
    if (q > 60) return 'Señal aceptable';
    return 'Señal débil';
  }, [isFingerDetected]);

  // Suavizado de señal adaptativo mejorado
  const smoothValue = useCallback((currentValue: number, previousValue: number | null): number => {
    if (previousValue === null) return currentValue;
    
    // Suavizado adaptativo - menos suavizado para cambios rápidos para preservar picos
    const delta = Math.abs(currentValue - previousValue);
    const adaptiveFactor = Math.max(0.1, Math.min(0.6, SMOOTHING_FACTOR * (1 - delta / 2)));
    
    return previousValue + adaptiveFactor * (currentValue - previousValue);
  }, []);

  // Renderizado de cuadrícula mejorado para referencia clínica
  const drawGrid = useCallback((ctx: CanvasRenderingContext2D) => {
    // Fondo degradado
    const gradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
    gradient.addColorStop(0, '#f1f5f9');
    gradient.addColorStop(1, '#e2e8f0');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Líneas menores
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(51, 65, 85, 0.1)';
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

    // Líneas mayores (cada 4 líneas menores)
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(51, 65, 85, 0.2)';
    ctx.lineWidth = 1;

    for (let x = 0; x <= CANVAS_WIDTH; x += GRID_SIZE_X * 4) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, CANVAS_HEIGHT);
      
      // Etiquetas de tiempo en eje x
      if (x % (GRID_SIZE_X * 4) === 0) {
        ctx.fillStyle = 'rgba(51, 65, 85, 0.5)';
        ctx.font = '10px Inter';
        ctx.textAlign = 'center';
        const timeValue = (x / 10 * 25);
        ctx.fillText(`${timeValue}ms`, x, CANVAS_HEIGHT - 5);
      }
    }

    for (let y = 0; y <= CANVAS_HEIGHT; y += GRID_SIZE_Y * 4) {
      ctx.moveTo(0, y);
      ctx.lineTo(CANVAS_WIDTH, y);
      
      // Etiquetas de amplitud en eje y
      if (y % (GRID_SIZE_Y * 4) === 0) {
        const amplitude = ((CANVAS_HEIGHT / 2) - y) / adaptiveScale;
        ctx.fillStyle = 'rgba(51, 65, 85, 0.5)';
        ctx.font = '10px Inter';
        ctx.textAlign = 'right';
        ctx.fillText(amplitude.toFixed(2), 25, y + 4);
      }
    }
    ctx.stroke();

    // Línea central (cero)
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(51, 65, 85, 0.3)';
    ctx.lineWidth = 1.5;
    ctx.moveTo(0, CANVAS_HEIGHT / 2);
    ctx.lineTo(CANVAS_WIDTH, CANVAS_HEIGHT / 2);
    ctx.stroke();
    
    // Etiqueta "0" en línea central
    ctx.fillStyle = 'rgba(51, 65, 85, 0.7)';
    ctx.font = '10px Inter';
    ctx.textAlign = 'right';
    ctx.fillText("0.00", 25, CANVAS_HEIGHT / 2 + 4);
  }, [adaptiveScale]);

  // Detección de picos mejorada
  const detectPeaks = useCallback((points: PPGDataPoint[], now: number) => {
    const peakLocations: {time: number, amplitude: number}[] = [];
    
    for (let i = 2; i < points.length - 2; i++) {
      const prev2 = points[i-2].value;
      const prev1 = points[i-1].value;
      const current = points[i].value;
      const next1 = points[i+1].value;
      const next2 = points[i+2].value;
      
      // Un punto es un pico si:
      // 1. Es más alto que sus 2 vecinos en cada lado
      // 2. La diferencia de amplitud excede el umbral
      if (current > prev1 && current > prev2 && current > next1 && current > next2 &&
          Math.abs(current) > PEAK_THRESHOLD) {
        
        // Interpolación parabólica para ubicación precisa
        const alpha = (prev1 - next1) / 2;
        const beta = (prev1 - 2 * current + next1) / 2;
        
        if (beta < 0) {
          const peakOffset = -alpha / (2 * beta);
          const peakIndex = i + peakOffset;
          const peakValue = current - alpha * peakOffset + beta * peakOffset * peakOffset;
          
          peakLocations.push({
            time: points[i].time,
            amplitude: peakValue
          });
        } else {
          peakLocations.push({
            time: points[i].time,
            amplitude: current
          });
        }
      }
    }
    
    peakLocationsRef.current = peakLocations;
    
    // Verificar si tenemos un nuevo pico
    if (peakLocations.length > 0) {
      const latestPeak = peakLocations[peakLocations.length - 1];
      
      // Solo considerarlo un nuevo pico si ocurrió recientemente
      if (now - latestPeak.time < 200) {
        if (!peakDetectedRef.current || latestPeak.time > peakTimeRef.current) {
          peakDetectedRef.current = true;
          peakTimeRef.current = latestPeak.time;
          peakAmplitudeRef.current = latestPeak.amplitude;
        }
      }
    }
    
    // Resetear detección de pico después de timeout
    if (peakDetectedRef.current && now - peakTimeRef.current > PEAK_HIGHLIGHT_DURATION) {
      peakDetectedRef.current = false;
    }
    
    return peakLocations;
  }, []);

  // Renderizado de señal mejorado con rendimiento optimizado
  const renderSignal = useCallback(() => {
    if (!canvasRef.current || !dataBufferRef.current) {
      animationFrameRef.current = requestAnimationFrame(renderSignal);
      return;
    }

    const currentTime = performance.now();
    const timeSinceLastRender = currentTime - lastRenderTimeRef.current;

    // Control de frecuencia de renderizado para mejor rendimiento
    if (timeSinceLastRender < FRAME_TIME) {
      animationFrameRef.current = requestAnimationFrame(renderSignal);
      return;
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) {
      animationFrameRef.current = requestAnimationFrame(renderSignal);
      return;
    }

    const now = Date.now();
    
    // Seguimiento adaptativo de línea base
    if (baselineRef.current === null) {
      baselineRef.current = value;
    } else {
      // Adaptación más lenta para señal más estable
      baselineRef.current = baselineRef.current * 0.98 + value * 0.02;
    }

    // Aplicar suavizado con factor adaptativo
    const smoothedValue = smoothValue(value, lastValueRef.current);
    lastValueRef.current = smoothedValue;

    // Calcular valor normalizado (eliminar deriva de línea base)
    const normalizedValue = (baselineRef.current || 0) - smoothedValue;
    const scaledValue = normalizedValue * adaptiveScale;
    
    // Verificar arritmia
    let isArrhythmia = false;
    if (rawArrhythmiaData && 
        arrhythmiaStatus?.includes("ARRITMIA") && 
        now - rawArrhythmiaData.timestamp < 1000) {
      isArrhythmia = true;
      lastArrhythmiaTime.current = now;
    }

    // Crear punto de datos y añadir al buffer
    const dataPoint: PPGDataPoint = {
      time: now,
      value: scaledValue,
      isArrhythmia
    };
    
    dataBufferRef.current.push(dataPoint);

    // Dibujar cuadrícula base
    drawGrid(ctx);

    // Obtener todos los puntos y detectar picos
    const points = dataBufferRef.current.getPoints();
    const peaks = detectPeaks(points, now);
    
    // Dibujar camino de señal con calidad visual mejorada
    if (points.length > 1) {
      // Dibujar línea base
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.3)';
      ctx.lineWidth = 1;
      ctx.moveTo(0, CANVAS_HEIGHT / 2);
      ctx.lineTo(CANVAS_WIDTH, CANVAS_HEIGHT / 2);
      ctx.stroke();
      
      // Dibujar camino de señal con mejor estilo
      ctx.beginPath();
      
      // Gradiente mejorado para la ruta de la señal
      const signalGradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
      if (isArrhythmia) {
        signalGradient.addColorStop(0, 'rgba(220, 38, 38, 0.8)');  // Rojo para arritmia
        signalGradient.addColorStop(1, 'rgba(220, 38, 38, 0.6)');
      } else if (quality < 60) {
        signalGradient.addColorStop(0, 'rgba(234, 179, 8, 0.8)');  // Amarillo para calidad baja
        signalGradient.addColorStop(1, 'rgba(234, 179, 8, 0.6)');
      } else {
        signalGradient.addColorStop(0, 'rgba(14, 165, 233, 0.8)');  // Azul para normal
        signalGradient.addColorStop(1, 'rgba(14, 165, 233, 0.6)');
      }
      
      // Usar curvas bezier para renderizado más suave
      let firstPoint = true;
      let prevX = 0, prevY = 0;
      
      points.forEach((point, i) => {
        const x = canvas.width - ((now - point.time) * canvas.width / WINDOW_WIDTH_MS);
        const y = canvas.height / 2 - point.value;
        
        if (firstPoint) {
          ctx.moveTo(x, y);
          firstPoint = false;
        } else if (i % 2 === 0) { // Renderizar cada dos puntos para rendimiento
          // Usar curvas cuadráticas para líneas más suaves
          const midX = (prevX + x) / 2;
          const midY = (prevY + y) / 2;
          ctx.quadraticCurveTo(prevX, prevY, midX, midY);
        }
        
        prevX = x;
        prevY = y;
      });
      
      // Finalizar el camino si tenemos puntos
      if (!firstPoint) {
        ctx.quadraticCurveTo(prevX, prevY, prevX, prevY);
      }
      
      ctx.strokeStyle = signalGradient;
      ctx.lineWidth = 2.5;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.stroke();
      
      // Dibujar efecto de reflejo de pulso
      if (peakDetectedRef.current) {
        const timeSincePeak = now - peakTimeRef.current;
        const pulseOpacity = 1 - (timeSincePeak / PEAK_HIGHLIGHT_DURATION);
        
        if (pulseOpacity > 0) {
          ctx.beginPath();
          ctx.fillStyle = `rgba(59, 130, 246, ${pulseOpacity * 0.3})`;
          ctx.arc(
            canvas.width - ((now - peakTimeRef.current) * canvas.width / WINDOW_WIDTH_MS),
            canvas.height / 2 - peakAmplitudeRef.current,
            10 + (20 * (1 - pulseOpacity)),
            0,
            Math.PI * 2
          );
          ctx.fill();
        }
      }
      
      // Dibujar picos detectados con visualización mejorada
      peaks.forEach(peak => {
        const x = canvas.width - ((now - peak.time) * canvas.width / WINDOW_WIDTH_MS);
        const y = canvas.height / 2 - peak.amplitude;
        
        const isRecentPeak = now - peak.time < 500;
        const pointRadius = isRecentPeak ? 5 : 3;
        
        // Dibujar punto de pico
        ctx.beginPath();
        ctx.arc(x, y, pointRadius, 0, Math.PI * 2);
        ctx.fillStyle = isArrhythmia ? '#DC2626' : '#0284c7';
        ctx.fill();
        
        // Dibujar etiqueta de amplitud para picos significativos
        if (Math.abs(peak.amplitude) > PEAK_THRESHOLD * 2) {
          ctx.font = 'bold 11px Inter';
          ctx.fillStyle = isArrhythmia ? '#DC2626' : '#0284c7';
          ctx.textAlign = 'center';
          ctx.fillText(
            Math.abs(peak.amplitude / adaptiveScale).toFixed(2), 
            x, 
            y - 12
          );
        }
      });
    }

    // Dibujar advertencia de arritmia si es necesario
    if (arrhythmiaStatus?.includes("ARRITMIA") && now - lastArrhythmiaTime.current < 2000) {
      const warningOpacity = Math.max(0, 1 - ((now - lastArrhythmiaTime.current) / 2000));
      ctx.fillStyle = `rgba(220, 38, 38, ${warningOpacity * 0.15})`;
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      
      ctx.font = 'bold 18px Inter';
      ctx.fillStyle = `rgba(220, 38, 38, ${warningOpacity})`;
      ctx.textAlign = 'center';
      ctx.fillText('¡ARRITMIA!', CANVAS_WIDTH / 2, 30);
    }

    // Rastrear tiempo de renderizado para control de FPS
    lastRenderTimeRef.current = currentTime;
    animationFrameRef.current = requestAnimationFrame(renderSignal);
  }, [value, quality, isFingerDetected, rawArrhythmiaData, arrhythmiaStatus, adaptiveScale, drawGrid, smoothValue, detectPeaks]);

  useEffect(() => {
    renderSignal();
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [renderSignal]);

  return (
    <div className="fixed inset-0 bg-gradient-to-b from-white to-slate-50/30">
      <div className="absolute top-0 left-0 right-0 p-2 flex justify-between items-center bg-white/60 backdrop-blur-sm border-b border-slate-100 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="text-xl font-bold text-slate-700">PPG</span>
          <div className="w-[200px]">
            <div className={`h-1.5 w-full rounded-full bg-gradient-to-r ${getQualityColor(quality)} transition-all duration-700 ease-in-out`}>
              <div
                className="h-full rounded-full bg-white/20 animate-pulse transition-all duration-700"
                style={{ width: `${isFingerDetected ? quality : 0}%` }}
              />
            </div>
            <span className="text-[9px] text-center mt-0.5 font-medium transition-colors duration-500 block" 
                  style={{ color: quality > 70 ? '#0EA5E9' : '#F59E0B' }}>
              {getQualityText(quality)}
            </span>
          </div>
        </div>

        <div className="flex flex-col items-center">
          <Fingerprint
            className={`h-12 w-12 transition-colors duration-300 ${
              !isFingerDetected ? 'text-gray-400' :
              quality > 80 ? 'text-green-500' :
              quality > 60 ? 'text-yellow-500' :
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
      />

      <div className="fixed bottom-0 left-0 right-0 h-[80px] grid grid-cols-2 gap-px bg-gray-100">
        <button 
          onClick={onStartMeasurement}
          className="bg-white text-slate-700 hover:bg-gray-50 active:bg-gray-100 transition-colors duration-200 flex items-center justify-center"
        >
          <span className="text-lg font-semibold">
            INICIAR/DETENER
          </span>
        </button>

        <button 
          onClick={onReset}
          className="bg-white text-slate-700 hover:bg-gray-50 active:bg-gray-100 transition-colors duration-200 flex items-center justify-center"
        >
          <span className="text-lg font-semibold">
            RESETEAR
          </span>
        </button>
      </div>
    </div>
  );
};

export default PPGSignalMeter;
