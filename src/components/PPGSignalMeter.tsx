
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
  
  // Optimized constants for better clinical visualization
  const WINDOW_WIDTH_MS = 5000; // 5-second window (clinical standard)
  const CANVAS_WIDTH = 650; // Reduced canvas width
  const CANVAS_HEIGHT = 300; // Reduced canvas height
  const GRID_SIZE_X = 40; // Grid size for time (smaller for more detail)
  const GRID_SIZE_Y = 15; // Grid size for amplitude (smaller for more detail)
  const VERTICAL_SCALE = 38.0; // Signal amplification factor
  const SMOOTHING_FACTOR = 1.5; // Reduced smoothing for better detail
  const TARGET_FPS = 30; // Lower FPS for better performance
  const FRAME_TIME = 1000 / TARGET_FPS;
  const BUFFER_SIZE = 500; // Reduced buffer size for better performance
  const INVERT_SIGNAL = false;
  const PEAK_MIN_VALUE = 6.0; // Lower threshold for peak detection
  const PEAK_DISTANCE_MS = 300; // Minimum time between peaks

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

  // Enhanced grid drawing with better clinical-standard grid and more visible labels
  const drawGrid = useCallback((ctx: CanvasRenderingContext2D) => {
    // Clear canvas with optimized method
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    
    // Clean white background (clinical standard)
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    const zeroY = CANVAS_HEIGHT * 0.5; // Center baseline
    
    // Draw minor gridlines (lighter)
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(200, 220, 220, 0.4)'; // Lighter for minor gridlines
    ctx.lineWidth = 0.5;
    
    // Minor vertical gridlines (time) - clinical standard spacing
    for (let x = 0; x <= CANVAS_WIDTH; x += GRID_SIZE_X / 5) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, CANVAS_HEIGHT);
    }
    
    // Minor horizontal gridlines (amplitude)
    for (let y = 0; y <= CANVAS_HEIGHT; y += GRID_SIZE_Y / 5) {
      ctx.moveTo(0, y);
      ctx.lineTo(CANVAS_WIDTH, y);
    }
    ctx.stroke();
    
    // Draw medium gridlines
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(150, 180, 180, 0.6)'; // More visible medium grid
    ctx.lineWidth = 0.8;
    
    // Medium gridlines - 200ms standard
    for (let x = 0; x <= CANVAS_WIDTH; x += GRID_SIZE_X) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, CANVAS_HEIGHT);
    }
    
    // Medium horizontal gridlines
    for (let y = 0; y <= CANVAS_HEIGHT; y += GRID_SIZE_Y) {
      ctx.moveTo(0, y);
      ctx.lineTo(CANVAS_WIDTH, y);
    }
    ctx.stroke();
    
    // Draw major gridlines (1 second / major amplitude)
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(100, 150, 150, 0.8)'; // Darker, more visible major grid
    ctx.lineWidth = 1.2;
    
    // Major vertical gridlines - 1000ms (1 second) standard
    for (let x = 0; x <= CANVAS_WIDTH; x += GRID_SIZE_X * 4) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, CANVAS_HEIGHT);
      
      // Add time labels with improved visibility
      if (x >= 0) {
        const timeMs = (x / CANVAS_WIDTH) * WINDOW_WIDTH_MS;
        ctx.fillStyle = '#004466'; // Darker, more visible text
        ctx.font = 'bold 13px Arial'; // Larger, bold font
        ctx.textAlign = 'center';
        ctx.fillText(`${Math.round(timeMs/1000)}s`, x, CANVAS_HEIGHT - 5);
      }
    }
    
    // Major horizontal gridlines
    for (let y = 0; y <= CANVAS_HEIGHT; y += GRID_SIZE_Y * 5) {
      ctx.moveTo(0, y);
      ctx.lineTo(CANVAS_WIDTH, y);
      
      // Add amplitude labels with improved visibility
      if (y % (GRID_SIZE_Y * 5) === 0) {
        const amplitude = ((zeroY - y) / VERTICAL_SCALE).toFixed(1);
        ctx.fillStyle = '#004466'; // Darker text
        ctx.font = 'bold 13px Arial'; // Larger, bold font
        ctx.textAlign = 'right';
        ctx.fillText(amplitude, 25, y + 4);
      }
    }
    ctx.stroke();
    
    // Draw the baseline (zero line)
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(0, 100, 120, 0.8)'; // More visible baseline
    ctx.lineWidth = 1.5;
    ctx.moveTo(0, zeroY);
    ctx.lineTo(CANVAS_WIDTH, zeroY);
    ctx.stroke();
    
    // Draw axis labels with improved visibility
    ctx.fillStyle = '#003355'; // Darker text for better contrast
    ctx.font = 'bold 14px Arial'; // Larger font
    ctx.textAlign = 'center';
    ctx.fillText('Tiempo (s)', CANVAS_WIDTH / 2, CANVAS_HEIGHT - 20);
    
    ctx.save();
    ctx.translate(14, CANVAS_HEIGHT / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillText('Amplitud', 0, 0);
    ctx.restore();
  }, []);

  // Optimized signal rendering with better performance
  const renderSignal = useCallback(() => {
    if (!canvasRef.current || !dataBufferRef.current) {
      animationFrameRef.current = requestAnimationFrame(renderSignal);
      return;
    }

    const currentTime = performance.now();
    const timeSinceLastRender = currentTime - lastRenderTimeRef.current;

    // Skip frames for better performance
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
    
    // Adaptive baseline calculation
    if (baselineRef.current === null) {
      baselineRef.current = value;
    } else {
      const adaptiveRate = isFingerDetected ? 0.95 : 0.8;
      baselineRef.current = baselineRef.current * adaptiveRate + value * (1 - adaptiveRate);
    }

    // Apply enhanced smoothing for cleaner signal
    const smoothedValue = smoothValue(value, lastValueRef.current);
    lastValueRef.current = smoothedValue;

    // Calculate normalized and scaled value
    const normalizedValue = smoothedValue - (baselineRef.current || 0);
    const scaledValue = normalizedValue * VERTICAL_SCALE;
    
    // Detect arrhythmia
    let isArrhythmia = false;
    if (rawArrhythmiaData && 
        arrhythmiaStatus?.includes("ARRITMIA") && 
        now - rawArrhythmiaData.timestamp < 1000) {
      isArrhythmia = true;
      lastArrhythmiaTime.current = now;
      arrhythmiaCountRef.current++;
    }

    // Store the data point in the buffer
    const dataPoint: PPGDataPoint = {
      time: now,
      value: scaledValue,
      isArrhythmia
    };
    
    dataBufferRef.current.push(dataPoint);

    // Draw the grid first
    drawGrid(ctx);

    const points = dataBufferRef.current.getPoints();
    if (points.length > 1) {
      // Filter only visible points for better performance
      const visiblePoints = points.filter(
        point => (now - point.time) <= WINDOW_WIDTH_MS
      );
      
      if (visiblePoints.length > 1) {
        // Draw the main PPG signal with enhanced visibility
        ctx.beginPath();
        ctx.strokeStyle = '#0066CC'; // Brighter blue for better visibility
        ctx.lineWidth = 2.5; // Thicker line for better visibility
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        
        let firstPoint = true;
        
        for (let i = 0; i < visiblePoints.length; i++) {
          const point = visiblePoints[i];
          const x = canvas.width - ((now - point.time) * canvas.width / WINDOW_WIDTH_MS);
          const y = canvas.height * 0.5 - point.value;
          
          if (firstPoint) {
            ctx.moveTo(x, y);
            firstPoint = false;
          } else {
            ctx.lineTo(x, y);
          }
          
          // Draw arrhythmia segments with more visible styling
          if (point.isArrhythmia && i < visiblePoints.length - 1) {
            ctx.stroke();
            ctx.beginPath();
            ctx.strokeStyle = '#FF0000'; // Bright red
            ctx.lineWidth = 3.0; // Thicker
            ctx.setLineDash([4, 2]);
            ctx.moveTo(x, y);
            
            const nextPoint = visiblePoints[i + 1];
            const nextX = canvas.width - ((now - nextPoint.time) * canvas.width / WINDOW_WIDTH_MS);
            const nextY = canvas.height * 0.5 - nextPoint.value;
            ctx.lineTo(nextX, nextY);
            ctx.stroke();
            
            // Reset for continuing normal signal
            ctx.beginPath();
            ctx.strokeStyle = '#0066CC';
            ctx.lineWidth = 2.5;
            ctx.setLineDash([]);
            ctx.moveTo(nextX, nextY);
            firstPoint = false;
          }
        }
        
        ctx.stroke();
      }

      // Enhanced peak detection and marking with better visibility
      const maxPeakIndices: number[] = [];
      
      for (let i = 2; i < visiblePoints.length - 2; i++) {
        const point = visiblePoints[i];
        const prevPoint1 = visiblePoints[i - 1];
        const prevPoint2 = visiblePoints[i - 2];
        const nextPoint1 = visiblePoints[i + 1];
        const nextPoint2 = visiblePoints[i + 2];
        
        // Optimized peak detection criteria
        if (point.value > prevPoint1.value && 
            point.value > prevPoint2.value && 
            point.value > nextPoint1.value && 
            point.value > nextPoint2.value) {
          
          const peakAmplitude = point.value;
          
          // Only significant peaks with minimum amplitude
          if (peakAmplitude > PEAK_MIN_VALUE) {
            const peakTime = point.time;
            
            // Avoid closely spaced peaks
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
      
      // Draw peaks with enhanced visibility
      for (const idx of maxPeakIndices) {
        const point = visiblePoints[idx];
        const x = canvas.width - ((now - point.time) * canvas.width / WINDOW_WIDTH_MS);
        const y = canvas.height * 0.5 - point.value;
        
        const isArrhythmiaPeak = point.isArrhythmia;
        const peakColor = isArrhythmiaPeak ? '#FF0000' : '#0066CC';
        
        // Draw peak marker with improved visibility
        ctx.fillStyle = peakColor;
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, Math.PI * 2); // Larger marker
        ctx.fill();
        
        // Add stroke for better definition
        ctx.strokeStyle = isArrhythmiaPeak ? '#FF0000' : '#0066CC';
        ctx.lineWidth = 2.0;
        ctx.stroke();

        // Draw peak value with improved visibility
        ctx.font = 'bold 12px Arial'; // Bold, larger font
        ctx.fillStyle = isArrhythmiaPeak ? '#FF0000' : '#0066CC';
        ctx.textAlign = 'center';
        ctx.fillText(Math.abs(point.value / VERTICAL_SCALE).toFixed(1), x, y - 15);
        
        // Enhanced arrhythmia visualization
        if (isArrhythmiaPeak) {
          // Warning indicator
          ctx.beginPath();
          ctx.arc(x, y, 15, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(255, 0, 0, 0.8)'; // More opaque
          ctx.lineWidth = 1.5; // Thicker
          ctx.setLineDash([2, 2]);
          ctx.stroke();
          ctx.setLineDash([]);
          
          // Warning label with improved visibility
          ctx.font = 'bold 12px Arial'; // Bold, larger font
          ctx.fillStyle = '#FF0000';
          ctx.fillText("LATIDO PREMATURO", x, y - 30);
        }
      }
    }

    lastRenderTimeRef.current = performance.now();
    animationFrameRef.current = requestAnimationFrame(renderSignal);
  }, [value, quality, isFingerDetected, rawArrhythmiaData, arrhythmiaStatus, drawGrid, smoothValue]);

  // Setup and cleanup rendering loop
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
           style={{ top: '6px', right: '6px' }}>
        <div className="w-[160px]">
          <div className={`h-1.5 w-full rounded-full bg-gradient-to-r ${getQualityColor(quality)} transition-all duration-300 ease-in-out`}>
            <div
              className="h-full rounded-full bg-white/20 animate-pulse transition-all duration-300"
              style={{ width: `${isFingerDetected ? quality : 0}%` }}
            />
          </div>
          <span className="text-[10px] text-center mt-0.5 font-bold transition-colors duration-300 block text-white" 
                style={{ 
                  color: quality > 75 ? '#0EA5E9' : 
                         quality > 50 ? '#F59E0B' : 
                         quality > 30 ? '#DC2626' : '#FF4136',
                  textShadow: '0px 0px 2px rgba(0,0,0,0.5)'
                }}>
            {getQualityText(quality)}
          </span>
        </div>

        <div className="flex flex-col items-center">
          <Fingerprint
            className={`h-10 w-10 transition-colors duration-300 ${
              !isFingerDetected ? 'text-gray-400' :
              quality > 75 ? 'text-green-500' :
              quality > 50 ? 'text-yellow-500' :
              quality > 30 ? 'text-orange-500' :
              'text-red-500'
            }`}
            strokeWidth={1.5}
          />
          <span className={`text-[10px] text-center mt-0.5 font-bold ${
            !isFingerDetected ? 'text-gray-400' : 
            quality > 50 ? 'text-green-500' : 'text-yellow-500'
          }`} style={{textShadow: '0px 0px 2px rgba(0,0,0,0.3)'}}>
            {isFingerDetected ? "Dedo detectado" : "Ubique su dedo en la Lente"}
          </span>
        </div>
      </div>

      <div className="absolute inset-0 flex items-center justify-center" style={{ height: '50vh' }}>
        <div className="w-full h-full relative flex items-center justify-center">
          <canvas
            ref={canvasRef}
            width={CANVAS_WIDTH}
            height={CANVAS_HEIGHT}
            className="w-full h-full max-w-3xl"
            style={{ 
              imageRendering: 'crisp-edges',
              transform: 'translateZ(0)',
            }}
          />
        </div>
      </div>
      
      <div className="absolute" style={{ top: 'calc(50vh + 5px)', left: 0, right: 0, textAlign: 'center', zIndex: 30 }}>
        <h1 className="text-lg font-bold">
          <span className="text-white">Chars</span>
          <span className="text-[#ea384c]">Healt</span>
        </h1>
      </div>
    </>
  );
};

export default PPGSignalMeter;
