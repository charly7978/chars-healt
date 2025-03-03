import React, { useEffect, useRef, useCallback, useState } from 'react';
import { Fingerprint, Heart, Activity } from 'lucide-react';
import { CircularBuffer, PPGDataPoint } from '../utils/CircularBuffer';
import { motion, AnimatePresence } from 'framer-motion';

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
  calibrationStatus?: 'pending' | 'in_progress' | 'completed' | 'failed';
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
  calibrationStatus = 'pending'
}: PPGSignalMeterProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dataBufferRef = useRef<CircularBuffer | null>(null);
  const baselineRef = useRef<number | null>(null);
  const lastValueRef = useRef<number | null>(null);
  const animationFrameRef = useRef<number>();
  const lastRenderTimeRef = useRef<number>(0);
  const lastArrhythmiaTime = useRef<number>(0);
  const arrhythmiaCountRef = useRef<number>(0);
  
  const WINDOW_WIDTH_MS = 4000;
  const CANVAS_WIDTH = 550;
  const CANVAS_HEIGHT = 550;
  const GRID_SIZE_X = 55;
  const GRID_SIZE_Y = 30;
  const verticalScale = 45.0;
  const SMOOTHING_FACTOR = 1.4;
  const TARGET_FPS = 90;
  const FRAME_TIME = 900 / TARGET_FPS;
  const BUFFER_SIZE = 300;
  const INVERT_SIGNAL = false;

  const [pulseAnimation, setPulseAnimation] = useState(false);
  const [calibrationProgress, setCalibrationProgress] = useState(0);
  
  const [calibrationSettings, setCalibrationSettings] = useState<{
    perfusionIndex: number;
    qualityThreshold: number;
    lastCalibration: string | null;
  } | null>(null);
  
  useEffect(() => {
    if (!dataBufferRef.current) {
      dataBufferRef.current = new CircularBuffer(BUFFER_SIZE);
    }
  }, []);

  useEffect(() => {
    // Animación de pulso cuando hay un pico
    if (value > 0.4) {
      setPulseAnimation(true);
      setTimeout(() => setPulseAnimation(false), 150);
    }
    
    // Si estamos en calibración, incrementar progresivamente el progreso
    if (isCalibrating && calibrationStatus === 'in_progress') {
      const interval = setInterval(() => {
        setCalibrationProgress(prev => {
          if (prev >= 99) {
            clearInterval(interval);
            return 100;
          }
          return prev + 1;
        });
      }, 100);
      
      return () => clearInterval(interval);
    } else if (calibrationStatus === 'completed') {
      setCalibrationProgress(100);
    } else if (calibrationStatus !== 'in_progress') {
      setCalibrationProgress(0);
    }
  }, [value, isCalibrating, calibrationStatus]);
  
  useEffect(() => {
    // Cargar configuraciones de calibración
    try {
      const savedSettings = localStorage.getItem('calibrationSettings');
      if (savedSettings) {
        const settings = JSON.parse(savedSettings);
        setCalibrationSettings({
          perfusionIndex: settings.perfusionIndex,
          qualityThreshold: settings.qualityThreshold,
          lastCalibration: settings.lastCalibration
        });
      }
    } catch (error) {
      console.error('Error al cargar configuración de calibración:', error);
    }
  }, [calibrationStatus]);

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
    
    ctx.fillStyle = '#f3f3f3';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    ctx.beginPath();
    ctx.strokeStyle = 'rgba(0, 180, 120, 0.15)';
    ctx.lineWidth = 0.5;

    for (let x = 0; x <= CANVAS_WIDTH; x += GRID_SIZE_X) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, CANVAS_HEIGHT);
      if (x % (GRID_SIZE_X * 4) === 0) {
        ctx.fillStyle = 'rgba(0, 150, 100, 0.9)';
        ctx.font = '10px Inter';
        ctx.textAlign = 'center';
        ctx.fillText(`${x / 10}ms`, x, CANVAS_HEIGHT - 5);
      }
    }

    for (let y = 0; y <= CANVAS_HEIGHT; y += GRID_SIZE_Y) {
      ctx.moveTo(0, y);
      ctx.lineTo(CANVAS_WIDTH, y);
      if (y % (GRID_SIZE_Y * 4) === 0) {
        const amplitude = ((CANVAS_HEIGHT / 2) - y) / verticalScale;
        ctx.fillStyle = 'rgba(0, 150, 100, 0.9)';
        ctx.font = '10px Inter';
        ctx.textAlign = 'right';
        ctx.fillText(amplitude.toFixed(1), 25, y + 4);
      }
    }
    ctx.stroke();

    ctx.beginPath();
    ctx.strokeStyle = 'rgba(0, 150, 100, 0.25)';
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
    ctx.strokeStyle = 'rgba(0, 150, 100, 0.35)';
    ctx.lineWidth = 1.5;
    ctx.moveTo(0, CANVAS_HEIGHT * 0.6);
    ctx.lineTo(CANVAS_WIDTH, CANVAS_HEIGHT * 0.6);
    ctx.stroke();
  }, []);

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

    drawGrid(ctx);

    const points = dataBufferRef.current.getPoints();
    if (points.length > 1) {
      const visiblePoints = points.filter(
        point => (now - point.time) <= WINDOW_WIDTH_MS
      );
      
      if (visiblePoints.length > 1) {
        ctx.beginPath();
        ctx.strokeStyle = '#0EA5E9';
        ctx.lineWidth = 2;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        
        let firstPoint = true;
        
        for (let i = 0; i < visiblePoints.length; i++) {
          const point = visiblePoints[i];
          const x = canvas.width - ((now - point.time) * canvas.width / WINDOW_WIDTH_MS);
          const y = canvas.height * 0.6 - point.value;
          
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
            const nextY = canvas.height * 0.6 - nextPoint.value;
            ctx.lineTo(nextX, nextY);
            ctx.stroke();
            
            ctx.beginPath();
            ctx.strokeStyle = '#0EA5E9';
            ctx.lineWidth = 2;
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
        
        if (point.value > prevPoint1.value && 
            point.value > prevPoint2.value && 
            point.value > nextPoint1.value && 
            point.value > nextPoint2.value) {
          
          const peakAmplitude = point.value;
          
          if (peakAmplitude > 7.0) {
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
        const y = canvas.height * 0.6 - point.value;
        
        ctx.beginPath();
        ctx.arc(x, y, point.isArrhythmia ? 5 : 4, 0, Math.PI * 2);
        ctx.fillStyle = point.isArrhythmia ? '#DC2626' : '#0EA5E9';
        ctx.fill();

        ctx.font = 'bold 12px Inter';
        ctx.fillStyle = '#666666';
        ctx.textAlign = 'center';
        ctx.fillText(Math.abs(point.value / verticalScale).toFixed(2), x, y - 20);
        
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
            const prevY = canvas.height * 0.6 - visiblePoints[idx-1].value;
            
            ctx.moveTo(prevX, prevY - 15);
            ctx.lineTo(x, y - 15);
            ctx.stroke();
          }
          
          if (idx < visiblePoints.length - 1) {
            const nextX = canvas.width - ((now - visiblePoints[idx+1].time) * canvas.width / WINDOW_WIDTH_MS);
            const nextY = canvas.height * 0.6 - visiblePoints[idx+1].value;
            
            ctx.moveTo(x, y - 15);
            ctx.lineTo(nextX, nextY - 15);
            ctx.stroke();
          }
          
          ctx.setLineDash([]);
        }
      }
    }

    lastRenderTimeRef.current = currentTime;
    animationFrameRef.current = requestAnimationFrame(renderSignal);
  }, [value, quality, isFingerDetected, rawArrhythmiaData, arrhythmiaStatus, drawGrid, smoothValue]);

  useEffect(() => {
    renderSignal();
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [renderSignal]);

  const getQualityWidth = () => {
    return `${Math.max(5, Math.min(100, quality * 100))}%`;
  };

  const renderDetectionStatus = () => {
    if (isCalibrating) {
      return (
        <div className="text-xs font-medium mt-1">
          <div className="flex items-center gap-2">
            <div className="w-full bg-gray-700 h-1 rounded-full">
              <div 
                className="bg-blue-500 h-1 rounded-full transition-all duration-300"
                style={{ width: `${calibrationProgress}%` }}
              />
            </div>
            <span className="w-10 text-right">{calibrationProgress}%</span>
          </div>
          <div className="text-center mt-1">
            {calibrationStatus === 'pending' && 'Listo para calibrar'}
            {calibrationStatus === 'in_progress' && 'Calibrando...'}
            {calibrationStatus === 'completed' && 'Calibración completada'}
            {calibrationStatus === 'failed' && 'Error de calibración'}
          </div>
        </div>
      );
    }
    
    if (!isFingerDetected) {
      return (
        <div className="text-red-500 text-xs font-medium mt-1">
          Coloque su dedo en la cámara
        </div>
      );
    }

    if (quality < 0.4) {
      return (
        <div className="text-red-500 text-xs font-medium mt-1">
          Señal débil - Ajuste su dedo
        </div>
      );
    }

    if (quality < 0.7) {
      return (
        <div className="text-yellow-500 text-xs font-medium mt-1">
          Señal aceptable - Mantenga estable
        </div>
      );
    }

    return (
      <div className="text-emerald-500 text-xs font-medium mt-1">
        Buena señal - No mueva su dedo
      </div>
    );
  };

  const renderCalibrationInfo = () => {
    if (!calibrationSettings) return null;
    
    const lastCalibrationDate = calibrationSettings.lastCalibration 
      ? new Date(calibrationSettings.lastCalibration).toLocaleString()
      : 'Nunca';
    
    return (
      <div className="text-xs text-gray-400 mt-2">
        <div className="grid grid-cols-2 gap-1">
          <div>Índice Perfusión:</div>
          <div className="text-right">{calibrationSettings.perfusionIndex.toFixed(2)}</div>
          
          <div>Umbral Calidad:</div>
          <div className="text-right">{calibrationSettings.qualityThreshold.toFixed(2)}</div>
          
          <div>Última Calibración:</div>
          <div className="text-right">{lastCalibrationDate}</div>
        </div>
      </div>
    );
  };

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
