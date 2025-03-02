
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
  arrhythmiaStatus,
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
  
  const WINDOW_WIDTH_MS = 5700;
  const CANVAS_WIDTH = 650;
  const CANVAS_HEIGHT = 450;
  const GRID_SIZE_X = 10;
  const GRID_SIZE_Y = 3;
  const verticalScale = displayMode === 'normal' ? 30.0 : 15.0;
  const SMOOTHING_FACTOR = 0.25;
  const TARGET_FPS = 240;
  const FRAME_TIME = 1000 / TARGET_FPS;
  const BUFFER_SIZE = 200;

  useEffect(() => {
    if (!dataBufferRef.current) {
      dataBufferRef.current = new CircularBuffer(BUFFER_SIZE);
    }
  }, []);

  const toggleDisplayMode = useCallback(() => {
    setDisplayMode(prev => prev === 'normal' ? 'ecg-like' : 'normal');
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
  }, [displayMode, isCalibrating, calibrationProgress, verticalScale]);

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
      baselineRef.current = baselineRef.current * 0.95 + value * 0.05;
    }

    const smoothedValue = smoothValue(value, lastValueRef.current);
    lastValueRef.current = smoothedValue;

    const normalizedValue = smoothedValue - (baselineRef.current || 0);
    const scaledValue = normalizedValue * verticalScale;
    
    let isArrhythmia = false;
    if (rawArrhythmiaData && 
        arrhythmiaStatus?.includes("ARRITMIA") && 
        now - rawArrhythmiaData.timestamp < 1000) {
      isArrhythmia = true;
      lastArrhythmiaTime.current = now;
      
      arrhythmiaCountRef.current++;
    }

    const dataPoint: PPGDataPoint = {
      time: now,
      value: scaledValue,
      isArrhythmia
    };
    
    dataBufferRef.current.push(dataPoint);
    
    const bufferPoints = dataBufferRef.current.getPoints();
    if (bufferPoints.length > 20) {
      const rawValues = bufferPoints.map(point => point.value / verticalScale);
      
      ecgTransformedBufferRef.current = transformPPGtoECGLike(rawValues);
      
      if (bufferPoints.length > 60) {
        cardiacAnalysisRef.current = analyzeCardiacWaveform(rawValues);
      }
    }

    drawGrid(ctx);

    const points = dataBufferRef.current.getPoints();
    if (points.length > 1) {
      const visiblePoints = points.filter(
        point => (now - point.time) <= WINDOW_WIDTH_MS
      );
      
      if (visiblePoints.length > 1) {
        ctx.beginPath();
        ctx.strokeStyle = displayMode === 'ecg-like' ? '#E63946' : '#0EA5E9';
        ctx.lineWidth = displayMode === 'ecg-like' ? 2.5 : 2;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        
        let firstPoint = true;
        
        for (let i = 0; i < visiblePoints.length; i++) {
          const point = visiblePoints[i];
          const x = canvas.width - ((now - point.time) * canvas.width / WINDOW_WIDTH_MS);
          
          let y;
          if (displayMode === 'ecg-like' && ecgTransformedBufferRef.current.length > 0) {
            const transformedIndex = Math.min(i, ecgTransformedBufferRef.current.length - 1);
            y = canvas.height * 0.6 - ecgTransformedBufferRef.current[transformedIndex] * verticalScale * 3;
          } else {
            y = canvas.height * 0.6 - point.value;
          }
          
          if (firstPoint) {
            ctx.moveTo(x, y);
            firstPoint = false;
          } else {
            ctx.lineTo(x, y);
          }
          
          if (point.isArrhythmia && i < visiblePoints.length - 1) {
            ctx.stroke();
            ctx.beginPath();
            ctx.strokeStyle = '#DC2626';
            ctx.lineWidth = 3;
            ctx.setLineDash([3, 2]);
            ctx.moveTo(x, y);
            
            const nextPoint = visiblePoints[i + 1];
            const nextX = canvas.width - ((now - nextPoint.time) * canvas.width / WINDOW_WIDTH_MS);
            
            let nextY;
            if (displayMode === 'ecg-like' && ecgTransformedBufferRef.current.length > 0) {
              const nextTransformedIndex = Math.min(i + 1, ecgTransformedBufferRef.current.length - 1);
              nextY = canvas.height * 0.6 - ecgTransformedBufferRef.current[nextTransformedIndex] * verticalScale * 3;
            } else {
              nextY = canvas.height * 0.6 - nextPoint.value;
            }
            
            ctx.lineTo(nextX, nextY);
            ctx.stroke();
            
            ctx.beginPath();
            ctx.strokeStyle = displayMode === 'ecg-like' ? '#E63946' : '#0EA5E9';
            ctx.lineWidth = displayMode === 'ecg-like' ? 2.5 : 2;
            ctx.setLineDash([]);
            ctx.moveTo(nextX, nextY);
            firstPoint = false;
          }
        }
        
        ctx.stroke();
      }

      const maxPeakIndices: number[] = [];
      
      for (let i = 2; i < visiblePoints.length - 2; i++) {
        const point = visiblePoints[i];
        const prevPoint1 = visiblePoints[i - 1];
        const prevPoint2 = visiblePoints[i - 2];
        const nextPoint1 = visiblePoints[i + 1];
        const nextPoint2 = visiblePoints[i + 2];
        
        let isPeak = false;
        if (displayMode === 'ecg-like' && ecgTransformedBufferRef.current.length > i + 2) {
          const val = ecgTransformedBufferRef.current[i];
          const prev1 = ecgTransformedBufferRef.current[i - 1];
          const prev2 = ecgTransformedBufferRef.current[i - 2];
          const next1 = ecgTransformedBufferRef.current[i + 1];
          const next2 = ecgTransformedBufferRef.current[i + 2];
          
          isPeak = val > prev1 && val > prev2 && val > next1 && val > next2 && val > 0.4;
        } else {
          isPeak = point.value > prevPoint1.value && 
                  point.value > prevPoint2.value && 
                  point.value > nextPoint1.value && 
                  point.value > nextPoint2.value;
        }
        
        if (isPeak) {
          const peakAmplitude = displayMode === 'ecg-like' 
            ? Math.abs(ecgTransformedBufferRef.current[i] * 3) 
            : Math.abs(point.value / verticalScale);
          
          const amplitudeThreshold = displayMode === 'ecg-like' ? 0.3 : 7.0;
          
          if (peakAmplitude > amplitudeThreshold) {
            const peakTime = point.time;
            const hasPeakNearby = maxPeakIndices.some(idx => {
              const existingPeakTime = visiblePoints[idx].time;
              return Math.abs(existingPeakTime - peakTime) < 250;
            });
            
            if (!hasPeakNearby) {
              maxPeakIndices.push(i);
            }
          }
        }
      }
      
      for (let idx of maxPeakIndices) {
        const point = visiblePoints[idx];
        const x = canvas.width - ((now - point.time) * canvas.width / WINDOW_WIDTH_MS);
        
        let y;
        if (displayMode === 'ecg-like' && ecgTransformedBufferRef.current.length > idx) {
          y = canvas.height * 0.6 - ecgTransformedBufferRef.current[idx] * verticalScale * 3;
        } else {
          y = canvas.height * 0.6 - point.value;
        }
        
        const peakFillColor = displayMode === 'ecg-like' 
          ? (point.isArrhythmia ? '#DC2626' : '#E63946') 
          : (point.isArrhythmia ? '#DC2626' : '#0EA5E9');
        
        ctx.beginPath();
        ctx.arc(x, y, point.isArrhythmia ? 5 : 4, 0, Math.PI * 2);
        ctx.fillStyle = peakFillColor;
        ctx.fill();

        const valueToShow = displayMode === 'ecg-like' 
          ? Math.abs(ecgTransformedBufferRef.current[idx]).toFixed(2)
          : Math.abs(point.value / verticalScale).toFixed(2);
          
        ctx.font = 'bold 12px Inter';
        ctx.fillStyle = '#666666';
        ctx.textAlign = 'center';
        ctx.fillText(valueToShow, x, y - 20);
        
        if (point.isArrhythmia) {
          ctx.beginPath();
          ctx.arc(x, y, 9, 0, Math.PI * 2);
          ctx.strokeStyle = '#FFFF00';
          ctx.lineWidth = 2;
          ctx.stroke();
          
          ctx.beginPath();
          ctx.arc(x, y, 14, 0, Math.PI * 2);
          ctx.strokeStyle = '#FF6B6B';
          ctx.lineWidth = 1;
          ctx.setLineDash([2, 2]);
          ctx.stroke();
          ctx.setLineDash([]);
          
          ctx.font = 'bold 10px Inter';
          ctx.fillStyle = '#FF6B6B';
          ctx.fillText("LATIDO PREMATURO", x, y - 35);
          
          ctx.beginPath();
          ctx.setLineDash([2, 2]);
          ctx.strokeStyle = 'rgba(255, 107, 107, 0.6)';
          ctx.lineWidth = 1;
          
          if (idx > 0) {
            const prevX = canvas.width - ((now - visiblePoints[idx-1].time) * canvas.width / WINDOW_WIDTH_MS);
            const prevY = displayMode === 'ecg-like' && ecgTransformedBufferRef.current.length > idx-1
              ? canvas.height * 0.6 - ecgTransformedBufferRef.current[idx-1] * verticalScale * 3
              : canvas.height * 0.6 - visiblePoints[idx-1].value;
            
            ctx.moveTo(prevX, prevY - 15);
            ctx.lineTo(x, y - 15);
            ctx.stroke();
          }
          
          if (idx < visiblePoints.length - 1) {
            const nextX = canvas.width - ((now - visiblePoints[idx+1].time) * canvas.width / WINDOW_WIDTH_MS);
            const nextY = displayMode === 'ecg-like' && ecgTransformedBufferRef.current.length > idx+1
              ? canvas.height * 0.6 - ecgTransformedBufferRef.current[idx+1] * verticalScale * 3
              : canvas.height * 0.6 - visiblePoints[idx+1].value;
            
            ctx.moveTo(x, y - 15);
            ctx.lineTo(nextX, nextY - 15);
            ctx.stroke();
          }
          
          ctx.setLineDash([]);
        }
      }
      
      if (displayMode === 'ecg-like' && cardiacAnalysisRef.current) {
        const analysis = cardiacAnalysisRef.current;
        
        ctx.fillStyle = 'rgba(220, 53, 69, 0.8)';
        ctx.font = '12px Inter';
        ctx.textAlign = 'left';
        
        const qualityText = `Calidad onda: ${Math.round(analysis.waveQuality * 100)}%`;
        ctx.fillText(qualityText, 30, 40);
        
        ctx.fillText(`QRS: ${analysis.qrs.morphology} (${Math.round(analysis.qrs.duration)}ms)`, 30, 60);
        
        ctx.fillText(`Onda P: ${analysis.pWave.present ? 'presente' : 'no detectada'}`, 30, 80);
        ctx.fillText(`Onda T: ${analysis.tWave.present ? 'presente' : 'no detectada'}`, 30, 100);
        
        if (analysis.segments.qt > 0) {
          ctx.fillText(`QT: ${Math.round(analysis.segments.qt)}ms`, 30, 120);
        }
      }
    }

    lastRenderTimeRef.current = currentTime;
    animationFrameRef.current = requestAnimationFrame(renderSignal);
  }, [value, quality, isFingerDetected, rawArrhythmiaData, arrhythmiaStatus, drawGrid, smoothValue, displayMode, verticalScale]);

  useEffect(() => {
    renderSignal();
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [renderSignal]);

  return (
    <>
      <div className="absolute top-0 right-1 z-30 flex items-center gap-2 rounded-lg p-2"
           style={{ top: '5px', right: '5px' }}>
        <div className="w-[190px]">
          <div className={`h-1.5 w-full rounded-full bg-gradient-to-r ${getQualityColor(quality)} transition-all duration-1000 ease-in-out`}>
            <div
              className="h-full rounded-full bg-white/20 animate-pulse transition-all duration-1000"
              style={{ width: `${isFingerDetected ? quality : 0}%` }}
            />
          </div>
          <span className="text-[9px] text-center mt-0.5 font-medium transition-colors duration-700 block text-white" 
                style={{ 
                  color: quality > 75 ? '#0EA5E9' : 
                         quality > 50 ? '#F59E0B' : 
                         quality > 30 ? '#DC2626' : '#FF4136' 
                }}>
            {getQualityText(quality)}
          </span>
        </div>

        <div className="flex flex-col items-center">
          <Fingerprint
            className={`h-12 w-12 transition-colors duration-300 ${
              !isFingerDetected ? 'text-gray-400' :
              quality > 75 ? 'text-green-500' :
              quality > 50 ? 'text-yellow-500' :
              quality > 30 ? 'text-orange-500' :
              'text-red-500'
            }`}
            strokeWidth={1.5}
          />
          <span className={`text-[9px] text-center mt-0.5 font-medium ${
            !isFingerDetected ? 'text-gray-400' : 
            quality > 50 ? 'text-green-500' : 'text-yellow-500'
          }`}>
            {isFingerDetected ? "Dedo detectado" : "Ubique su dedo en la Lente"}
          </span>
        </div>
      </div>

      <div className="absolute top-1 left-1 z-30 flex items-center gap-1">
        <button 
          onClick={toggleDisplayMode}
          className="bg-black/30 p-2 rounded-lg text-white hover:bg-black/40 transition-colors"
        >
          {displayMode === 'normal' ? (
            <ActivitySquare size={20} className="text-blue-300" />
          ) : (
            <Zap size={20} className="text-red-300" />
          )}
        </button>
        <span className="text-[9px] font-medium text-white/80">
          {displayMode === 'normal' ? 'PPG' : 'ECG'}
        </span>
      </div>

      <div className="absolute inset-0 w-full" style={{ height: '50vh', top: 0 }}>
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          className="w-full h-full"
          style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 }}
        />
      </div>
      
      <div className="absolute" style={{ top: 'calc(50vh + 5px)', left: 0, right: 0, textAlign: 'center', zIndex: 30 }}>
        <h1 className="text-xl font-bold">
          <span className="text-white">Chars</span>
          <span className="text-[#ea384c]">Healt</span>
        </h1>
      </div>
    </>
  );
};

export default PPGSignalMeter;
