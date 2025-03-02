
import React, { useEffect, useRef, useCallback, useState } from 'react';
import { Fingerprint, ActivitySquare, Zap } from 'lucide-react';
import { CircularBuffer, PPGDataPoint } from '../utils/CircularBuffer';
import { transformPPGtoECGLike, analyzeCardiacWaveform } from '../utils/signalProcessingUtils';

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
    isPrematureBeat?: boolean;
    confidence?: number;
  } | null;
  isCalibrating?: boolean;
  calibrationProgress?: number;
}

const PPGSignalMeter = ({ 
  value, 
  quality, 
  isFingerDetected,
  onStartMeasurement,
  onReset,
  arrhythmiaStatus = "",
  rawArrhythmiaData,
  isCalibrating = false,
  calibrationProgress = 0
}: PPGSignalMeterProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dataBufferRef = useRef<CircularBuffer | null>(null);
  const baselineRef = useRef<number | null>(null);
  const lastValueRef = useRef<number | null>(null);
  const animationFrameRef = useRef<number>();
  const lastRenderTimeRef = useRef<number>(0);
  const lastArrhythmiaTime = useRef<number>(0);
  const arrhythmiaCountRef = useRef<number>(0);
  const [displayMode, setDisplayMode] = useState<'normal' | 'ecg-like'>('normal');
  const ecgTransformedBufferRef = useRef<number[]>([]);
  const cardiacAnalysisRef = useRef<ReturnType<typeof analyzeCardiacWaveform> | null>(null);
  
  // Nuevas referencias para picos detectados
  const peaksRef = useRef<{ time: number, value: number, type: 'normal' | 'premature' }[]>([]);
  const valleysRef = useRef<{ time: number, value: number }[]>([]);
  const lastPeakTimeRef = useRef<number>(0);
  const showPeakLabelsRef = useRef<boolean>(true);
  
  const WINDOW_WIDTH_MS = 5700;
  const CANVAS_WIDTH = 650;
  const CANVAS_HEIGHT = 450;
  const GRID_SIZE_X = 10;
  const GRID_SIZE_Y = 3;
  const verticalScale = displayMode === 'normal' ? 30.0 : 15.0;
  const SMOOTHING_FACTOR = 0.25;
  const TARGET_FPS = 60;
  const FRAME_TIME = 1000 / TARGET_FPS;
  const BUFFER_SIZE = 200;
  // Constantes para la detección de picos
  const PEAK_DETECTION_THRESHOLD = 0.15;
  const MIN_TIME_BETWEEN_PEAKS = 300; // ms

  useEffect(() => {
    if (!dataBufferRef.current) {
      dataBufferRef.current = new CircularBuffer(BUFFER_SIZE);
    }
    
    // Iniciar la animación
    renderSignal();
    
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  // Detectar arritmias a partir del estado
  useEffect(() => {
    if (arrhythmiaStatus && arrhythmiaStatus.includes('ARRITMIA DETECTADA')) {
      const now = Date.now();
      
      // Extraer el conteo de arritmias
      const match = arrhythmiaStatus.match(/\|(\d+)$/);
      if (match && match[1]) {
        const newCount = parseInt(match[1], 10);
        if (newCount > arrhythmiaCountRef.current) {
          arrhythmiaCountRef.current = newCount;
          lastArrhythmiaTime.current = now;
          console.log(`Nueva arritmia detectada: ${newCount}`);
        }
      }
    }
  }, [arrhythmiaStatus]);

  // Actualizar cuando hay datos de arritmia
  useEffect(() => {
    if (rawArrhythmiaData && rawArrhythmiaData.timestamp > lastArrhythmiaTime.current) {
      lastArrhythmiaTime.current = rawArrhythmiaData.timestamp;
      
      // Marcar el último pico como prematuro si es una arritmia
      if (rawArrhythmiaData.isPrematureBeat && peaksRef.current.length > 0) {
        const lastIndex = peaksRef.current.length - 1;
        peaksRef.current[lastIndex].type = 'premature';
        console.log('Pico marcado como prematuro:', peaksRef.current[lastIndex]);
      }
    }
  }, [rawArrhythmiaData]);

  const toggleDisplayMode = useCallback(() => {
    setDisplayMode(prev => prev === 'normal' ? 'ecg-like' : 'normal');
  }, []);
  
  const togglePeakLabels = useCallback(() => {
    showPeakLabelsRef.current = !showPeakLabelsRef.current;
  }, []);

  const getQualityColor = useCallback((q: number) => {
    if (!isFingerDetected) return 'from-gray-400 to-gray-500';
    if (q > 75) return 'from-green-500 to-emerald-500';
    if (q > 50) return 'from-yellow-500 to-orange-500';
    if (q > 30) return 'from-orange-500 to-red-500';
    return 'from-red-500 to-rose-500';
  }, [isFingerDetected]);

  const getQualityText = useCallback((q: number) => {
    if (!isFingerDetected) return 'Sin detección';
    if (q > 75) return 'Señal óptima';
    if (q > 50) return 'Señal aceptable';
    if (q > 30) return 'Señal débil';
    return 'Señal muy débil';
  }, [isFingerDetected]);

  const smoothValue = useCallback((currentValue: number, previousValue: number | null): number => {
    if (previousValue === null) return currentValue;
    return previousValue + SMOOTHING_FACTOR * (currentValue - previousValue);
  }, []);

  // Función para detectar picos en tiempo real
  const detectPeaks = useCallback((buffer: PPGDataPoint[], newValue: number, newTime: number) => {
    if (buffer.length < 5) return;
    
    const values = buffer.map(point => point.value);
    const currentIndex = values.length - 1;
    
    // Verificar si el punto actual es un pico local
    if (
      currentIndex >= 2 &&
      values[currentIndex - 1] > values[currentIndex - 2] &&
      values[currentIndex - 1] > values[currentIndex] &&
      values[currentIndex - 1] > (baselineRef.current || 0) + PEAK_DETECTION_THRESHOLD
    ) {
      const peakTime = buffer[currentIndex - 1].time;
      const peakValue = values[currentIndex - 1];
      
      // Asegurarse de que ha pasado suficiente tiempo desde el último pico
      if (peakTime - lastPeakTimeRef.current > MIN_TIME_BETWEEN_PEAKS) {
        lastPeakTimeRef.current = peakTime;
        peaksRef.current.push({ 
          time: peakTime, 
          value: peakValue,
          type: 'normal' // Inicialmente todos los picos son normales
        });
        
        // Limitar el número de picos almacenados
        if (peaksRef.current.length > 20) {
          peaksRef.current.shift();
        }
      }
    }
    
    // Detectar valles (para análisis futuro)
    if (
      currentIndex >= 2 &&
      values[currentIndex - 1] < values[currentIndex - 2] &&
      values[currentIndex - 1] < values[currentIndex] 
    ) {
      const valleyTime = buffer[currentIndex - 1].time;
      const valleyValue = values[currentIndex - 1];
      
      valleysRef.current.push({ time: valleyTime, value: valleyValue });
      
      // Limitar el número de valles almacenados
      if (valleysRef.current.length > 20) {
        valleysRef.current.shift();
      }
    }
  }, []);

  const drawGrid = useCallback((ctx: CanvasRenderingContext2D) => {
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    
    if (displayMode === 'ecg-like') {
      ctx.fillStyle = '#F8F4E3';
    } else {
      ctx.fillStyle = '#f3f3f3';
    }
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    const gridColor = displayMode === 'ecg-like' ? 'rgba(255, 102, 102, 0.15)' : 'rgba(0, 180, 120, 0.15)';
    const boldGridColor = displayMode === 'ecg-like' ? 'rgba(255, 102, 102, 0.3)' : 'rgba(0, 150, 100, 0.25)';
    const textColor = displayMode === 'ecg-like' ? 'rgba(255, 102, 102, 0.9)' : 'rgba(0, 150, 100, 0.9)';
    const centerLineColor = displayMode === 'ecg-like' ? 'rgba(255, 102, 102, 0.35)' : 'rgba(0, 150, 100, 0.35)';

    ctx.beginPath();
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 0.5;

    for (let x = 0; x <= CANVAS_WIDTH; x += GRID_SIZE_X) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, CANVAS_HEIGHT);
      if (x % (GRID_SIZE_X * 4) === 0) {
        ctx.fillStyle = textColor;
        ctx.font = '10px Inter';
        ctx.textAlign = 'center';
        if (displayMode === 'ecg-like') {
          const timeInSec = (x / 10) / 100;
          ctx.fillText(`${timeInSec.toFixed(2)}s`, x, CANVAS_HEIGHT - 5);
        } else {
          ctx.fillText(`${x / 10}ms`, x, CANVAS_HEIGHT - 5);
        }
      }
    }

    for (let y = 0; y <= CANVAS_HEIGHT; y += GRID_SIZE_Y) {
      ctx.moveTo(0, y);
      ctx.lineTo(CANVAS_WIDTH, y);
      if (y % (GRID_SIZE_Y * 4) === 0) {
        const amplitude = ((CANVAS_HEIGHT / 2) - y) / verticalScale;
        ctx.fillStyle = textColor;
        ctx.font = '10px Inter';
        ctx.textAlign = 'right';
        ctx.fillText(amplitude.toFixed(1), 25, y + 4);
      }
    }
    ctx.stroke();

    ctx.beginPath();
    ctx.strokeStyle = boldGridColor;
    ctx.lineWidth = 1;

    for (let x = 0; x <= CANVAS_WIDTH; x += GRID_SIZE_X * 4) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, CANVAS_HEIGHT);
    }

    for (let y = 0; y <= CANVAS_HEIGHT; y += GRID_SIZE_Y * 4) {
      ctx.moveTo(0, y);
      ctx.lineTo(CANVAS_WIDTH, y);
    }
    ctx.stroke();

    ctx.beginPath();
    ctx.strokeStyle = centerLineColor;
    ctx.lineWidth = 1.5;
    ctx.moveTo(0, CANVAS_HEIGHT * 0.6);
    ctx.lineTo(CANVAS_WIDTH, CANVAS_HEIGHT * 0.6);
    ctx.stroke();
    
    if (displayMode === 'ecg-like') {
      ctx.fillStyle = 'rgba(255, 102, 102, 0.7)';
      ctx.font = 'bold 10px Inter';
      ctx.textAlign = 'left';
      ctx.fillText('Visualización ECG - 25mm/s', 30, 20);
      
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(255, 102, 102, 0.9)';
      ctx.lineWidth = 2;
      ctx.moveTo(CANVAS_WIDTH - 50, CANVAS_HEIGHT - 50);
      ctx.lineTo(CANVAS_WIDTH - 50, CANVAS_HEIGHT - 50 - 10 * 4);
      ctx.lineTo(CANVAS_WIDTH - 50 + 25, CANVAS_HEIGHT - 50 - 10 * 4);
      ctx.stroke();
      
      ctx.fillStyle = 'rgba(255, 102, 102, 0.9)';
      ctx.font = '9px Inter';
      ctx.textAlign = 'center';
      ctx.fillText('1mV', CANVAS_WIDTH - 50, CANVAS_HEIGHT - 30);
      ctx.fillText('1s', CANVAS_WIDTH - 37, CANVAS_HEIGHT - 50 - 10 * 4 - 5);
    }
    
    if (isCalibrating) {
      const progressWidth = (CANVAS_WIDTH - 100) * (calibrationProgress / 100);
      
      ctx.fillStyle = 'rgba(100, 100, 255, 0.2)';
      ctx.fillRect(50, CANVAS_HEIGHT * 0.8 - 15, CANVAS_WIDTH - 100, 30);
      
      ctx.fillStyle = 'rgba(0, 100, 255, 0.4)';
      ctx.fillRect(50, CANVAS_HEIGHT * 0.8 - 15, progressWidth, 30);
      
      ctx.fillStyle = 'rgba(0, 60, 220, 0.9)';
      ctx.font = 'bold 14px Inter';
      ctx.textAlign = 'center';
      ctx.fillText(`CALIBRANDO: ${calibrationProgress}%`, CANVAS_WIDTH / 2, CANVAS_HEIGHT * 0.8 + 5);
      ctx.font = '11px Inter';
      ctx.fillText('No mueva el dedo durante la calibración', CANVAS_WIDTH / 2, CANVAS_HEIGHT * 0.8 + 25);
    }
    
    // Mostrar estado de arritmia en el gráfico
    if (arrhythmiaStatus && isFingerDetected) {
      const statusParts = arrhythmiaStatus.split('|');
      const statusText = statusParts[0] || '';
      const countText = statusParts[1] || '0';
      
      // Color según el estado
      let statusColor = 'rgba(0, 180, 120, 0.9)'; // Verde por defecto
      if (statusText.includes('CALIBRANDO')) {
        statusColor = 'rgba(0, 100, 255, 0.9)'; // Azul para calibración
      } else if (statusText.includes('ARRITMIA')) {
        statusColor = 'rgba(255, 60, 60, 0.9)'; // Rojo para arritmia
      }
      
      ctx.fillStyle = statusColor;
      ctx.font = 'bold 12px Inter';
      ctx.textAlign = 'left';
      ctx.fillText(`${statusText} (${countText})`, 30, 40);
    }
  }, [displayMode, isCalibrating, calibrationProgress, verticalScale, arrhythmiaStatus, isFingerDetected]);

  const renderSignal = useCallback(() => {
    if (!canvasRef.current || !dataBufferRef.current) {
      animationFrameRef.current = requestAnimationFrame(renderSignal);
      return;
    }

    const currentTime = performance.now();
    const timeSinceLastRender = currentTime - lastRenderTimeRef.current;

    if (timeSinceLastRender < FRAME_TIME) {
      animationFrameRef.current = requestAnimationFrame(renderSignal);
      return;
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { alpha: true, desynchronized: true });
    if (!ctx) {
      animationFrameRef.current = requestAnimationFrame(renderSignal);
      return;
    }

    const now = Date.now();
    
    if (baselineRef.current === null) {
      baselineRef.current = value;
    } else {
      baselineRef.current = smoothValue(value, baselineRef.current);
    }
    
    // Agregar nuevo valor al buffer
    const smoothedValue = smoothValue(value, lastValueRef.current);
    lastValueRef.current = smoothedValue;
    
    if (dataBufferRef.current) {
      dataBufferRef.current.addPoint({ 
        time: now, 
        value: smoothedValue 
      });
      
      // Detectar picos con el nuevo valor
      detectPeaks(dataBufferRef.current.getPoints(), smoothedValue, now);
    }
    
    // Transformar la señal si estamos en modo ECG
    if (displayMode === 'ecg-like') {
      const points = dataBufferRef.current.getPoints();
      const values = points.map(p => p.value);
      ecgTransformedBufferRef.current = transformPPGtoECGLike(values);
      
      // Analizar la forma de onda cardíaca
      cardiacAnalysisRef.current = analyzeCardiacWaveform(values);
    }

    // Dibujar la cuadrícula
    drawGrid(ctx);
    
    if (!isFingerDetected) {
      // Si no hay dedo detectado, simplemente mostrar un mensaje
      ctx.fillStyle = 'rgba(150, 150, 150, 0.8)';
      ctx.font = 'bold 16px Inter';
      ctx.textAlign = 'center';
      ctx.fillText('Coloque su dedo en la cámara', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
      
      lastRenderTimeRef.current = currentTime;
      animationFrameRef.current = requestAnimationFrame(renderSignal);
      return;
    }

    // Obtener los puntos del buffer
    const points = dataBufferRef.current.getPoints();
    if (points.length < 2) {
      lastRenderTimeRef.current = currentTime;
      animationFrameRef.current = requestAnimationFrame(renderSignal);
      return;
    }

    // Calcular el rango de tiempo
    const latestTime = points[points.length - 1].time;
    const startTime = latestTime - WINDOW_WIDTH_MS;
    
    // Filtrar puntos dentro del rango de tiempo
    const visiblePoints = points.filter(p => p.time >= startTime);
    
    // Normalizar coordenadas X basadas en tiempo
    const getXCoordinate = (time: number) => {
      return CANVAS_WIDTH * (time - startTime) / WINDOW_WIDTH_MS;
    };
    
    // Normalizar coordenadas Y basadas en valor
    const getYCoordinate = (val: number) => {
      const centered = val - (baselineRef.current || 0);
      return CANVAS_HEIGHT * 0.6 - (centered * verticalScale);
    };
    
    // Dibujar la línea de señal
    ctx.beginPath();
    ctx.lineWidth = 2;
    
    if (displayMode === 'normal') {
      ctx.strokeStyle = `rgba(${quality * 2.55}, ${Math.min(150 + quality, 255)}, ${Math.min(100 + quality * 0.5, 180)}, 0.9)`;
      
      for (let i = 0; i < visiblePoints.length; i++) {
        const x = getXCoordinate(visiblePoints[i].time);
        const y = getYCoordinate(visiblePoints[i].value);
        
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
    } else {
      // Modo ECG-like
      ctx.strokeStyle = 'rgba(255, 50, 50, 0.9)';
      
      // Usar la señal transformada
      const ecgValues = ecgTransformedBufferRef.current;
      if (ecgValues.length > 0) {
        const offset = Math.max(0, ecgValues.length - visiblePoints.length);
        
        for (let i = 0; i < visiblePoints.length; i++) {
          const x = getXCoordinate(visiblePoints[i].time);
          const ecgIdx = i + offset;
          
          if (ecgIdx < ecgValues.length) {
            const y = CANVAS_HEIGHT * 0.6 - (ecgValues[ecgIdx] * verticalScale * 2.5);
            
            if (i === 0) {
              ctx.moveTo(x, y);
            } else {
              ctx.lineTo(x, y);
            }
          }
        }
      }
    }
    
    ctx.stroke();
    
    // Dibujar marcadores de tiempo de arritmia si existen
    if (lastArrhythmiaTime.current > 0 && now - lastArrhythmiaTime.current < 2000) {
      // Destacar la arritmia reciente
      if (lastArrhythmiaTime.current >= startTime) {
        const arrhythmiaX = getXCoordinate(lastArrhythmiaTime.current);
        
        // Dibujar línea vertical punteada
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(255, 50, 50, 0.7)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 3]);
        ctx.moveTo(arrhythmiaX, 20);
        ctx.lineTo(arrhythmiaX, CANVAS_HEIGHT - 20);
        ctx.stroke();
        ctx.setLineDash([]);
        
        // Etiqueta de arritmia
        ctx.fillStyle = 'rgba(255, 50, 50, 0.9)';
        ctx.font = 'bold 12px Inter';
        ctx.textAlign = 'center';
        ctx.fillText('ARRITMIA', arrhythmiaX, 60);
        
        // Información adicional si tenemos datos crudos
        if (rawArrhythmiaData) {
          ctx.font = '10px Inter';
          if (rawArrhythmiaData.confidence) {
            ctx.fillText(`Conf: ${(rawArrhythmiaData.confidence * 100).toFixed(0)}%`, arrhythmiaX, 75);
          }
          ctx.fillText(`RMSSD: ${rawArrhythmiaData.rmssd.toFixed(1)}`, arrhythmiaX, 90);
        }
      }
    }
    
    // Dibujar picos detectados
    const visiblePeaks = peaksRef.current.filter(p => p.time >= startTime);
    
    for (let i = 0; i < visiblePeaks.length; i++) {
      const peak = visiblePeaks[i];
      const x = getXCoordinate(peak.time);
      const y = getYCoordinate(peak.value);
      
      // Dibujar círculo en el pico
      ctx.beginPath();
      
      // Color según el tipo de pico
      if (peak.type === 'premature') {
        ctx.fillStyle = 'rgba(255, 50, 50, 0.8)';
        ctx.strokeStyle = 'rgba(255, 50, 50, 1)';
      } else {
        ctx.fillStyle = 'rgba(50, 180, 120, 0.7)';
        ctx.strokeStyle = 'rgba(40, 160, 100, 1)';
      }
      
      ctx.lineWidth = 1.5;
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      
      // Mostrar etiqueta con valor del pico si está activado
      if (showPeakLabelsRef.current) {
        ctx.fillStyle = peak.type === 'premature' ? 'rgba(255, 50, 50, 1)' : 'rgba(40, 160, 100, 1)';
        ctx.font = '10px Inter';
        ctx.textAlign = 'center';
        
        // Valor relativo a la línea base para mayor claridad
        const relativeValue = (peak.value - (baselineRef.current || 0)).toFixed(2);
        ctx.fillText(relativeValue, x, y - 10);
        
        // Tipo de pico (solo para prematuros)
        if (peak.type === 'premature') {
          ctx.font = 'bold 10px Inter';
          ctx.fillText('PREMATURO', x, y - 22);
        }
      }
    }
    
    // Mostrar análisis cardíaco si está en modo ECG
    if (displayMode === 'ecg-like' && cardiacAnalysisRef.current) {
      const analysis = cardiacAnalysisRef.current;
      
      ctx.fillStyle = 'rgba(255, 102, 102, 0.9)';
      ctx.font = '10px Inter';
      ctx.textAlign = 'left';
      
      let yPos = 60;
      const xPos = CANVAS_WIDTH - 150;
      
      ctx.fillText(`QRS: ${analysis.qrs.amplitude.toFixed(2)}, ${analysis.qrs.duration.toFixed(0)}ms`, xPos, yPos);
      yPos += 15;
      
      if (analysis.pWave.present) {
        ctx.fillText(`Onda P: ${analysis.pWave.amplitude.toFixed(2)}`, xPos, yPos);
        yPos += 15;
      }
      
      if (analysis.tWave.present) {
        ctx.fillText(`Onda T: ${analysis.tWave.amplitude.toFixed(2)}`, xPos, yPos);
        yPos += 15;
      }
      
      ctx.fillText(`Calidad: ${(analysis.waveQuality * 100).toFixed(0)}%`, xPos, yPos);
    }
    
    lastRenderTimeRef.current = currentTime;
    animationFrameRef.current = requestAnimationFrame(renderSignal);
  }, [
    value, 
    quality, 
    isFingerDetected, 
    drawGrid, 
    smoothValue, 
    detectPeaks, 
    displayMode, 
    verticalScale, 
    arrhythmiaStatus, 
    rawArrhythmiaData
  ]);

  return (
    <div className="w-full h-full flex flex-col">
      <div className="text-center py-2 px-4">
        <div className={`inline-flex items-center px-3 py-2 rounded-xl bg-gradient-to-r ${getQualityColor(quality)}`}>
          <Fingerprint className="w-5 h-5 mr-2 text-white" />
          <span className="text-white font-medium">{getQualityText(quality)}</span>
        </div>
        
        <div className="flex gap-2 mt-2 justify-center">
          <button 
            onClick={toggleDisplayMode}
            className="inline-flex items-center px-3 py-1 rounded-lg bg-slate-700 text-white text-sm"
          >
            <ActivitySquare className="w-4 h-4 mr-1" />
            {displayMode === 'normal' ? 'Modo ECG' : 'Modo Normal'}
          </button>
          
          <button 
            onClick={togglePeakLabels}
            className="inline-flex items-center px-3 py-1 rounded-lg bg-slate-700 text-white text-sm"
          >
            <Zap className="w-4 h-4 mr-1" />
            {showPeakLabelsRef.current ? 'Ocultar Valores' : 'Mostrar Valores'}
          </button>
        </div>
      </div>
      
      <div className="flex-1 w-full overflow-hidden flex items-center justify-center">
        <canvas 
          ref={canvasRef} 
          width={CANVAS_WIDTH} 
          height={CANVAS_HEIGHT} 
          className="max-w-full max-h-full"
        />
      </div>
      
      <div className="p-4">
        <div className="flex gap-2 justify-center">
          <button 
            onClick={onStartMeasurement}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white"
          >
            Iniciar Medición
          </button>
          <button 
            onClick={onReset}
            className="px-4 py-2 rounded-lg bg-red-600 text-white"
          >
            Reiniciar
          </button>
        </div>
      </div>
    </div>
  );
};

export default PPGSignalMeter;
