import React, { useEffect, useRef, useState } from 'react';
import { Fingerprint } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { CircularProgress } from "@/components/ui/circular-progress";
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
  isDicroticPoint?: boolean;
  visualAmplitude?: number;
  isSystolicPeak?: boolean;
}

const PPGSignalMeter = ({ 
  value, 
  quality, 
  isFingerDetected,
  onStartMeasurement,
  onReset,
  arrhythmiaStatus,
  rawArrhythmiaData,
  isDicroticPoint = false,
  visualAmplitude = 0,
  isSystolicPeak = false
}: PPGSignalMeterProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [startTime, setStartTime] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const bufferRef = useRef(new CircularBuffer(150));
  const frameRef = useRef(0);
  const lastProcessedPeakTimeRef = useRef(0);
  
  // Referencias avanzadas para la detección optimizada de picos
  const currentWaveMaxRef = useRef<PPGDataPoint | null>(null);
  const lastCircleDrawTimeRef = useRef(0);
  const lastValueRef = useRef(0);
  const risingEdgeDetectedRef = useRef(false);
  
  // NUEVO: Buffer para filtrado avanzado y eliminación de ruido
  const rawValueBufferRef = useRef<number[]>([]);
  const FILTER_BUFFER_SIZE = 5; // Tamaño del buffer para filtrado
  
  // NUEVO: Umbrales adaptativos para mejor detección
  const minPeakAmplitudeRef = useRef(0.05); // Umbral mínimo inicial que se adaptará
  const meanAmplitudeRef = useRef(0); // Media de amplitudes para adaptación
  const amplitudeHistoryRef = useRef<number[]>([]); // Historial de amplitudes para adaptación
  const MIN_PEAK_SEPARATION_MS = 350; // Separación mínima entre picos legítimos
  
  // NUEVO: Detección avanzada de calidad de señal
  const lowQualityCountRef = useRef(0);
  const HIGH_QUALITY_THRESHOLD = 0.15; // Umbral para considerar señal de alta calidad
  const lastValidPeakValueRef = useRef(0); // Valor del último pico válido para referencia
  
  const colors = {
    waveform: '#0EA5E9',
    background: 'rgba(0, 0, 0, 0.9)',
    grid: 'rgba(255, 255, 255, 0.1)',
    text: 'rgba(255, 255, 255, 0.8)',
    noSignal: '#6B7280',
    arrhythmia: '#DC2626'
  };

  const toggleRecording = () => {
    if (isRecording) {
      setIsRecording(false);
      onReset();
    } else {
      setIsRecording(true);
      setStartTime(Date.now());
      onStartMeasurement();
      bufferRef.current.clear();
      lastProcessedPeakTimeRef.current = 0;
      
      // Reiniciar todos los buffers y estados de filtrado
      currentWaveMaxRef.current = null;
      lastCircleDrawTimeRef.current = 0;
      lastValueRef.current = 0;
      risingEdgeDetectedRef.current = false;
      rawValueBufferRef.current = [];
      minPeakAmplitudeRef.current = 0.05;
      meanAmplitudeRef.current = 0;
      amplitudeHistoryRef.current = [];
      lowQualityCountRef.current = 0;
      lastValidPeakValueRef.current = 0;
    }
  };

  // NUEVO: Implementación de filtrado avanzado para eliminar ruido
  const applySignalFilters = (rawValue: number): number => {
    // Añadir al buffer de procesamiento
    rawValueBufferRef.current.push(rawValue);
    
    // Mantener el tamaño del buffer
    if (rawValueBufferRef.current.length > FILTER_BUFFER_SIZE) {
      rawValueBufferRef.current.shift();
    }
    
    // Si no tenemos suficientes muestras, devolver el valor sin procesar
    if (rawValueBufferRef.current.length < 3) {
      return rawValue;
    }
    
    // 1. Filtro de mediana para eliminar valores atípicos (muy efectivo contra ruido impulsivo)
    const medianFiltered = applyMedianFilter([...rawValueBufferRef.current]);
    
    // 2. Filtro de media móvil para suavizar la señal (reduce ruido de alta frecuencia)
    const smoothed = applyMovingAverage(medianFiltered);
    
    return smoothed;
  };
  
  // Implementación del filtro de mediana
  const applyMedianFilter = (values: number[]): number => {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    
    // Si la longitud es impar, devuelve el valor medio
    // Si es par, promedia los dos valores centrales
    return sorted.length % 2 !== 0
      ? sorted[mid]
      : (sorted[mid - 1] + sorted[mid]) / 2;
  };
  
  // Implementación de media móvil
  const applyMovingAverage = (currentValue: number): number => {
    const recentValues = rawValueBufferRef.current.slice(-3);
    const sum = recentValues.reduce((acc, val) => acc + val, 0);
    return sum / recentValues.length;
  };
  
  // NUEVO: Actualización de umbrales adaptativos basados en la amplitud de la señal
  const updateAdaptiveThresholds = (value: number): void => {
    // Mantener historial de amplitudes (valores absolutos)
    amplitudeHistoryRef.current.push(Math.abs(value));
    
    // Limitar el historial a las últimas 30 muestras
    if (amplitudeHistoryRef.current.length > 30) {
      amplitudeHistoryRef.current.shift();
    }
    
    // Calcular la amplitud media si tenemos suficientes datos
    if (amplitudeHistoryRef.current.length >= 10) {
      // Usar solo el 60% superior de las amplitudes para capturar los picos reales
      const sortedAmplitudes = [...amplitudeHistoryRef.current].sort((a, b) => b - a);
      const topAmplitudes = sortedAmplitudes.slice(0, Math.ceil(sortedAmplitudes.length * 0.6));
      
      // Calcular la media de las amplitudes superiores
      const sum = topAmplitudes.reduce((acc, val) => acc + val, 0);
      meanAmplitudeRef.current = sum / topAmplitudes.length;
      
      // Actualizar umbral de pico mínimo basado en la amplitud media (33% de la media)
      minPeakAmplitudeRef.current = Math.max(0.05, meanAmplitudeRef.current * 0.33);
    }
  };
  
  // NUEVO: Evaluación de calidad de señal para determinar la validez de un pico
  const isValidPeak = (value: number, time: number): boolean => {
    // Verificar que haya pasado suficiente tiempo desde el último pico
    if (time - lastCircleDrawTimeRef.current < MIN_PEAK_SEPARATION_MS) {
      return false;
    }
    
    // Verificar que el pico tenga una amplitud mínima
    if (Math.abs(value) < minPeakAmplitudeRef.current) {
      lowQualityCountRef.current++;
      return false;
    }
    
    // Reiniciar contador de baja calidad si encontramos un buen pico
    lowQualityCountRef.current = 0;
    
    // Verificar que la amplitud no sea anómalamente grande (posible artefacto)
    if (lastValidPeakValueRef.current > 0 && 
        value > lastValidPeakValueRef.current * 2.5) {
      return false;
    }
    
    // Si pasó todas las pruebas, actualizar el valor del último pico válido
    lastValidPeakValueRef.current = value;
    return true;
  };

  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (isRecording) {
      interval = setInterval(() => {
        setElapsedTime(Math.floor((Date.now() - startTime) / 1000));
      }, 1000);
    } else {
      setElapsedTime(0);
    }
    
    return () => {
      clearInterval(interval);
    };
  }, [isRecording, startTime]);

  useEffect(() => {
    if (!isRecording) return;
    
    const arrhythmiaDetected = arrhythmiaStatus?.includes('ARRITMIA DETECTADA') || false;
    const currentTime = Date.now();
    
    // Usar la amplitud visual si está disponible, sino usar el valor base
    let displayValue = visualAmplitude > 0 ? visualAmplitude : value;
    
    // NUEVO: Aplicar filtros avanzados para eliminación de ruido
    displayValue = applySignalFilters(displayValue);
    
    // NUEVO: Actualizar umbrales adaptativos
    updateAdaptiveThresholds(displayValue);
    
    // Crear punto de datos para almacenar y visualizar
    const point: PPGDataPoint = {
      time: currentTime,
      value: displayValue,
      isArrhythmia: arrhythmiaDetected
    };
    
    // Añadir al buffer circular para visualización
    bufferRef.current.push(point);
    
    // Dibujar forma de onda actualizada
    drawWaveform();
    
    // --------- ALGORITMO MEJORADO DE DETECCIÓN DE PICOS ---------
    
    // Detectar inicio de flanco ascendente (posible inicio de latido)
    if (displayValue > lastValueRef.current && !risingEdgeDetectedRef.current &&
        displayValue > minPeakAmplitudeRef.current * 0.3) { // Debe superar un mínimo para considerar inicio
      risingEdgeDetectedRef.current = true;
      // Reiniciar el seguimiento del máximo al inicio de una nueva onda
      currentWaveMaxRef.current = null;
    }
    
    // Durante el flanco ascendente, rastrear el valor máximo
    if (risingEdgeDetectedRef.current) {
      // Actualizar el punto máximo si encontramos uno mayor
      if (!currentWaveMaxRef.current || displayValue > currentWaveMaxRef.current.value) {
        currentWaveMaxRef.current = point;
      }
      
      // Detección de caída después de un pico (fin del flanco ascendente)
      if (displayValue < lastValueRef.current * 0.95 && currentWaveMaxRef.current) {
        // Verificar que sea un pico válido con nuestros criterios mejorados
        if (isValidPeak(currentWaveMaxRef.current.value, currentTime)) {
          // Dibujar marcador en el pico máximo detectado
          drawPointMarker(currentWaveMaxRef.current);
          // Actualizar tiempo del último círculo dibujado
          lastCircleDrawTimeRef.current = currentTime;
        }
        // Reiniciar detección para buscar el próximo latido
        risingEdgeDetectedRef.current = false;
      }
    }
    
    // Actualizar referencia del último valor para la próxima iteración
    lastValueRef.current = displayValue;
    
  }, [value, isRecording, arrhythmiaStatus, isDicroticPoint, visualAmplitude, isSystolicPeak]);

  const drawWaveform = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    ctx.fillStyle = colors.background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    drawGrid(ctx, canvas.width, canvas.height);
    
    const points = bufferRef.current.getPoints();
    if (points.length < 2) return;
    
    // MEJORADO: Dibujo de línea más suave con antialiasing
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.strokeStyle = isFingerDetected ? colors.waveform : colors.noSignal;
    
    // NUEVO: Aplicar interpolación para curvas más suaves
    const xStep = canvas.width / 150;
    const yMiddle = canvas.height / 2;
    const yScale = canvas.height * 0.4;
    
    // Primer paso: dibujar línea base
    ctx.beginPath();
    
    for (let i = 0; i < points.length; i++) {
      const x = i * xStep;
      const y = yMiddle - (points[i].value * yScale);
      
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    
    ctx.stroke();
    
    // NUEVO: Dibujar una sutil sombra debajo de la línea para efecto de profundidad
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, 'rgba(14, 165, 233, 0.15)');
    gradient.addColorStop(1, 'rgba(14, 165, 233, 0)');
    
    ctx.fillStyle = gradient;
    
    // Crear un área rellena debajo de la línea
    ctx.beginPath();
    ctx.moveTo(0, yMiddle);
    
    for (let i = 0; i < points.length; i++) {
      const x = i * xStep;
      const y = yMiddle - (points[i].value * yScale);
      ctx.lineTo(x, y);
    }
    
    ctx.lineTo(canvas.width, yMiddle);
    ctx.closePath();
    ctx.fill();
  };
  
  const drawPointMarker = (point: PPGDataPoint) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const points = bufferRef.current.getPoints();
    const pointIndex = points.findIndex(p => p.time === point.time);
    if (pointIndex < 0) return;
    
    const xStep = canvas.width / 150;
    const yMiddle = canvas.height / 2;
    const yScale = canvas.height * 0.4;
    
    const x = pointIndex * xStep;
    const y = yMiddle - (point.value * yScale);
    
    // MEJORADO: Efecto de destello para el punto del latido
    // Círculo exterior grande con desvanecimiento y brillo
    const glowColor = point.isArrhythmia ? 
      'rgba(220, 38, 38, 0.3)' : 
      'rgba(14, 165, 233, 0.25)';
    
    // NUEVO: Crear un resplandor exterior con degradado radial
    const glow = ctx.createRadialGradient(x, y, 4, x, y, 16);
    glow.addColorStop(0, point.isArrhythmia ? 'rgba(220, 38, 38, 0.7)' : 'rgba(14, 165, 233, 0.7)');
    glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    
    // Dibujar el resplandor exterior
    ctx.beginPath();
    ctx.arc(x, y, 16, 0, Math.PI * 2);
    ctx.fillStyle = glow;
    ctx.fill();
    
    // Círculo principal más visible
    ctx.beginPath();
    ctx.arc(x, y, 8, 0, Math.PI * 2);
    ctx.fillStyle = point.isArrhythmia ? 
      'rgba(220, 38, 38, 0.8)' : 
      'rgba(14, 165, 233, 0.7)';
    ctx.fill();
    
    // Círculo interior más brillante
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fillStyle = point.isArrhythmia ? colors.arrhythmia : colors.waveform;
    ctx.fill();
    
    // Punto central brillante para definición
    ctx.beginPath();
    ctx.arc(x, y, 2, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.fill();
    
    // NUEVO: Añadir línea vertical punteada para mejor visualización del pico
    ctx.beginPath();
    ctx.setLineDash([2, 2]);
    ctx.moveTo(x, y + 10);
    ctx.lineTo(x, canvas.height - 5);
    ctx.strokeStyle = point.isArrhythmia ? 
      'rgba(220, 38, 38, 0.4)' : 
      'rgba(14, 165, 233, 0.4)';
    ctx.stroke();
    ctx.setLineDash([]);
  };

  const drawGrid = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    ctx.strokeStyle = colors.grid;
    ctx.lineWidth = 1;
    
    const vStep = width / 10;
    for (let x = 0; x <= width; x += vStep) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    
    const hStep = height / 6;
    for (let y = 0; y <= height; y += hStep) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.beginPath();
    ctx.moveTo(0, height/2);
    ctx.lineTo(width, height/2);
    ctx.stroke();
  };

  return (
    <div className="flex flex-col gap-1 p-4 overflow-hidden">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-medium">
          {isRecording ? (
            <span className="text-indigo-500">Registrando: {elapsedTime}s</span>
          ) : (
            <span>Listo para medir</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <CircularProgress 
            value={quality} 
            max={100} 
            className="w-6 h-6" 
            strokeWidth={3}
            color={quality > 50 ? "#10B981" : quality > 20 ? "#F59E0B" : "#EF4444"}
          />
          <span className="text-xs font-medium">
            {quality > 70 ? "Excelente" : 
             quality > 40 ? "Buena" : 
             quality > 20 ? "Regular" : "Baja"}
          </span>
        </div>
      </div>
      
      <div className="relative w-full h-24 bg-black/90 rounded-xl overflow-hidden">
        <canvas 
          ref={canvasRef} 
          width={300} 
          height={96}
          className="w-full h-full"
        />
        
        {!isFingerDetected && !isRecording && (
          <div className="absolute inset-0 flex items-center justify-center text-white/80 text-xs font-medium">
            Coloque su dedo en la cámara
          </div>
        )}
      </div>
      
      <div className="flex justify-between items-center mt-3">
        <div className="text-xs font-medium">
          {arrhythmiaStatus && (
            <span className={arrhythmiaStatus.includes('ARRITMIA') ? 'text-red-500' : 'text-indigo-500'}>
              {arrhythmiaStatus.split('|')[0]}
            </span>
          )}
        </div>
        <Button
          onClick={toggleRecording}
          variant={isRecording ? "destructive" : "default"}
          size="sm"
          disabled={!isFingerDetected && !isRecording}
          className="px-3 py-1 h-8 text-xs font-medium"
        >
          {isRecording ? "Detener" : "Iniciar"}
        </Button>
      </div>
    </div>
  );
};

export default React.memo(PPGSignalMeter);
