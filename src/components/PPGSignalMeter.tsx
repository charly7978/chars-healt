
import React, { useEffect, useRef, useCallback } from 'react';
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
  
  const WINDOW_WIDTH_MS = 3500;
  const CANVAS_WIDTH = 1800;
  const CANVAS_HEIGHT = 1200;
  const GRID_SIZE_X = 150;
  const GRID_SIZE_Y = 150;
  const VERTICAL_SCALE = 40.0;
  const SMOOTHING_FACTOR = 1.6;
  const TARGET_FPS = 60;
  const FRAME_TIME = 1000 / TARGET_FPS;
  const BUFFER_SIZE = 650;
  const INVERT_SIGNAL = false;
  const PEAK_MIN_VALUE = 8.0;
  const PEAK_DISTANCE_MS = 200;
  
  // Colors for the dark blue theme
  const COLORS = {
    BACKGROUND: '#0A1929', // Dark blue background
    GRID_MAIN: 'rgba(255, 255, 255, 0.3)', // White grid lines (main)
    GRID_MINOR: 'rgba(255, 255, 255, 0.1)', // White grid lines (minor)
    ZERO_LINE: 'rgba(0, 255, 150, 0.9)', // Zero line color
    AXIS_TEXT: 'rgba(230, 255, 230, 1.0)', // Axis text color
    SIGNAL_LINE: '#38BDF8', // Signal line color
    ARRHYTHMIA_LINE: '#EF4444', // Arrhythmia line color
    PEAK_NORMAL: '#38BDF8', // Normal peak color
    PEAK_ARRHYTHMIA: '#EF4444', // Arrhythmia peak color
    PEAK_GLOW_NORMAL: 'rgba(56, 189, 248, 0.3)', // Normal peak glow
    PEAK_GLOW_ARRHYTHMIA: 'rgba(239, 68, 68, 0.3)' // Arrhythmia peak glow
  };

  useEffect(() => {
    if (!dataBufferRef.current) {
      dataBufferRef.current = new CircularBuffer(BUFFER_SIZE);
    }
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
    // Clear and fill background with dark blue
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.fillStyle = COLORS.BACKGROUND;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    const zeroY = CANVAS_HEIGHT * 0.6;
    
    // Draw zero line (center horizontal line)
    ctx.beginPath();
    ctx.strokeStyle = COLORS.ZERO_LINE;
    ctx.lineWidth = 2.0;
    ctx.moveTo(0, zeroY);
    ctx.lineTo(CANVAS_WIDTH, zeroY);
    ctx.stroke();

    // Draw minor grid lines
    ctx.beginPath();
    ctx.strokeStyle = COLORS.GRID_MINOR;
    ctx.lineWidth = 0.5;

    for (let x = 0; x <= CANVAS_WIDTH; x += GRID_SIZE_X / 4) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, CANVAS_HEIGHT);
    }

    for (let y = 0; y <= CANVAS_HEIGHT; y += GRID_SIZE_Y / 4) {
      ctx.moveTo(0, y);
      ctx.lineTo(CANVAS_WIDTH, y);
    }
    ctx.stroke();

    // Draw major grid lines
    ctx.beginPath();
    ctx.strokeStyle = COLORS.GRID_MAIN;
    ctx.lineWidth = 1.0;

    // X-axis major grid lines with time labels
    for (let x = 0; x <= CANVAS_WIDTH; x += GRID_SIZE_X * 4) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, CANVAS_HEIGHT);
      
      if (x >= 0) {
        const timeMs = (x / CANVAS_WIDTH) * WINDOW_WIDTH_MS;
        ctx.fillStyle = COLORS.AXIS_TEXT;
        ctx.font = '16px "Inter", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${Math.round(timeMs)}ms`, x, CANVAS_HEIGHT - 10);
      }
    }

    // Y-axis major grid lines with amplitude labels
    for (let y = 0; y <= CANVAS_HEIGHT; y += GRID_SIZE_Y * 4) {
      ctx.moveTo(0, y);
      ctx.lineTo(CANVAS_WIDTH, y);
      
      if (y % (GRID_SIZE_Y * 4) === 0) {
        const amplitude = ((zeroY - y) / VERTICAL_SCALE).toFixed(1);
        ctx.fillStyle = COLORS.AXIS_TEXT;
        ctx.font = '16px "Inter", sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(amplitude, 32, y + 6);
      }
    }
    ctx.stroke();

    // Draw axis labels
    ctx.fillStyle = COLORS.AXIS_TEXT;
    ctx.font = 'bold 18px "Inter", sans-serif';
    
    // X-axis label
    ctx.textAlign = 'center';
    ctx.fillText('Tiempo (ms)', CANVAS_WIDTH / 2, CANVAS_HEIGHT - 30);
    
    // Y-axis label
    ctx.save();
    ctx.translate(24, CANVAS_HEIGHT / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('Amplitud', 0, 0);
    ctx.restore();
    
    // Draw cartesian coordinates
    ctx.font = '12px "Inter", sans-serif';
    ctx.fillText('(0,0)', 40, zeroY + 20);
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
    const ctx = canvas.getContext('2d', { 
      alpha: false,
      desynchronized: true
    });
    
    if (!ctx) {
      animationFrameRef.current = requestAnimationFrame(renderSignal);
      return;
    }

    const now = Date.now();
    
    if (baselineRef.current === null) {
      baselineRef.current = value;
    } else {
      const adaptiveRate = isFingerDetected ? 0.95 : 0.8;
      baselineRef.current = baselineRef.current * adaptiveRate + value * (1 - adaptiveRate);
    }

    const smoothedValue = smoothValue(value, lastValueRef.current);
    lastValueRef.current = smoothedValue;

    const normalizedValue = smoothedValue - (baselineRef.current || 0);
    const scaledValue = normalizedValue * VERTICAL_SCALE;
    
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
        ctx.strokeStyle = COLORS.SIGNAL_LINE;
        ctx.lineWidth = 2.8;
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
            ctx.strokeStyle = COLORS.ARRHYTHMIA_LINE;
            ctx.lineWidth = 3.2;
            ctx.setLineDash([3, 2]);
            ctx.moveTo(x, y);
            
            const nextPoint = visiblePoints[i + 1];
            const nextX = canvas.width - ((now - nextPoint.time) * canvas.width / WINDOW_WIDTH_MS);
            const nextY = canvas.height * 0.6 - nextPoint.value;
            ctx.lineTo(nextX, nextY);
            ctx.stroke();
            
            ctx.beginPath();
            ctx.strokeStyle = COLORS.SIGNAL_LINE;
            ctx.lineWidth = 2.8;
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
          
          if (peakAmplitude > PEAK_MIN_VALUE) {
            const peakTime = point.time;
            
            const hasPeakNearby = maxPeakIndices.some(idx => {
              const existingPeakTime = visiblePoints[idx].time;
              return Math.abs(existingPeakTime - peakTime) < PEAK_DISTANCE_MS;
            });
            
            if (!hasPeakNearby) {
              maxPeakIndices.push(i);
            }
          }
        }
      }
      
      // Draw peaks with simplified visualization
      for (const idx of maxPeakIndices) {
        const point = visiblePoints[idx];
        const x = canvas.width - ((now - point.time) * canvas.width / WINDOW_WIDTH_MS);
        const y = canvas.height * 0.6 - point.value;
        
        const isArrhythmiaPeak = point.isArrhythmia;
        
        // Draw only one circle per peak with improved visibility
        ctx.beginPath();
        const peakColor = isArrhythmiaPeak ? COLORS.PEAK_ARRHYTHMIA : COLORS.PEAK_NORMAL;
        const glowColor = isArrhythmiaPeak ? COLORS.PEAK_GLOW_ARRHYTHMIA : COLORS.PEAK_GLOW_NORMAL;
        
        // Create glow effect
        const gradient = ctx.createRadialGradient(x, y, 2, x, y, 10);
        gradient.addColorStop(0, peakColor);
        gradient.addColorStop(1, glowColor);
        
        ctx.fillStyle = gradient;
        ctx.arc(x, y, isArrhythmiaPeak ? 7 : 5.5, 0, Math.PI * 2);
        ctx.fill();
        
        // Add peak outline
        ctx.strokeStyle = isArrhythmiaPeak ? '#FF4D4D' : '#38BDF8';
        ctx.lineWidth = 1.8;
        ctx.stroke();

        // Display peak value
        ctx.font = 'bold 13px "Inter", sans-serif';
        ctx.fillStyle = isArrhythmiaPeak ? '#FFCCCB' : '#ADD8E6';
        ctx.textAlign = 'center';
        ctx.fillText(Math.abs(point.value / VERTICAL_SCALE).toFixed(2), x, y - 22);
        
        // Enhanced arrhythmia information display
        if (isArrhythmiaPeak) {
          // Add bold "ARRITMIA" label
          ctx.font = 'bold 14px "Inter", sans-serif';
          ctx.fillStyle = '#FF4D4D';
          ctx.fillText("ARRITMIA DETECTADA", x, y - 40);
          
          // Display additional data if available
          if (rawArrhythmiaData) {
            ctx.font = '12px "Inter", sans-serif';
            ctx.fillStyle = '#FFCCCB';
            ctx.fillText(`RMSSD: ${rawArrhythmiaData.rmssd.toFixed(1)}`, x, y - 60);
            ctx.fillText(`Variación RR: ${rawArrhythmiaData.rrVariation.toFixed(1)}%`, x, y - 75);
          }
        }
      }
    }

    lastRenderTimeRef.current = performance.now();
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

  return (
    <>
      <div className="absolute top-0 right-1 z-30 flex items-center gap-2 rounded-lg p-2"
           style={{ top: '8px', right: '8px' }}>
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

      <div className="absolute inset-0 w-full" style={{ height: '65vh', top: 0 }}>
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          className="w-full h-full"
          style={{ 
            position: 'absolute', 
            top: 0, 
            left: 0, 
            right: 0, 
            zIndex: 10,
            imageRendering: 'crisp-edges',
            transform: 'translateZ(0)',
          }}
        />
      </div>
      
      <div className="absolute" style={{ top: 'calc(65vh + 5px)', left: 0, right: 0, textAlign: 'center', zIndex: 30 }}>
        <h1 className="text-xl font-bold">
          <span className="text-white">Chars</span>
          <span className="text-[#ea384c]">Healt</span>
        </h1>
      </div>
    </>
  );
};

export default PPGSignalMeter;
