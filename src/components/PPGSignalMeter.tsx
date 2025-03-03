
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
  
  // Optimized constants based on clinical waveform visualization standards
  const WINDOW_WIDTH_MS = 5000; // 5-second visualization window (standard for ECG/PPG)
  const CANVAS_WIDTH = 800; // Standard width for clinical visualization
  const CANVAS_HEIGHT = 400; // Optimized height for waveform clarity
  const GRID_SIZE_X = 50; // Grid matches standard clinical 1mm (50ms) grid
  const GRID_SIZE_Y = 20; // Grid optimized for amplitude clarity
  const VERTICAL_SCALE = 42.0; // Signal amplification factor
  const SMOOTHING_FACTOR = 1.8; // Wave smoothing factor
  const TARGET_FPS = 60;
  const FRAME_TIME = 1000 / TARGET_FPS;
  const BUFFER_SIZE = 650; // Signal history buffer size
  const INVERT_SIGNAL = false;
  const PEAK_MIN_VALUE = 8.0; // Minimum threshold for peak detection
  const PEAK_DISTANCE_MS = 300; // Minimum time between peaks in milliseconds

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

  // Enhanced grid drawing with clinical-standard grid
  const drawGrid = useCallback((ctx: CanvasRenderingContext2D) => {
    // Clear canvas with optimized method
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    
    // Use a clean white background (clinical standard)
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    const zeroY = CANVAS_HEIGHT * 0.5; // Center baseline
    
    // Draw minor gridlines first (lighter)
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(200, 220, 220, 0.5)'; // Light cyan-gray for minor gridlines
    ctx.lineWidth = 0.5;
    
    // Minor vertical gridlines (time) - 50ms spacing (clinical standard)
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
    ctx.strokeStyle = 'rgba(180, 200, 200, 0.8)'; // Medium cyan-gray
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
    ctx.strokeStyle = 'rgba(150, 180, 180, 1.0)'; // Darker cyan-gray
    ctx.lineWidth = 1.0;
    
    // Major vertical gridlines - 1000ms (1 second) standard
    for (let x = 0; x <= CANVAS_WIDTH; x += GRID_SIZE_X * 4) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, CANVAS_HEIGHT);
      
      // Add time labels
      if (x >= 0) {
        const timeMs = (x / CANVAS_WIDTH) * WINDOW_WIDTH_MS;
        ctx.fillStyle = 'rgba(60, 90, 100, 1.0)';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${Math.round(timeMs/1000)}s`, x, CANVAS_HEIGHT - 5);
      }
    }
    
    // Major horizontal gridlines
    for (let y = 0; y <= CANVAS_HEIGHT; y += GRID_SIZE_Y * 5) {
      ctx.moveTo(0, y);
      ctx.lineTo(CANVAS_WIDTH, y);
      
      // Add amplitude labels
      if (y % (GRID_SIZE_Y * 5) === 0) {
        const amplitude = ((zeroY - y) / VERTICAL_SCALE).toFixed(1);
        ctx.fillStyle = 'rgba(60, 90, 100, 1.0)';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(amplitude, 25, y + 4);
      }
    }
    ctx.stroke();
    
    // Draw the baseline (zero line)
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(0, 120, 120, 1.0)';
    ctx.lineWidth = 1.5;
    ctx.moveTo(0, zeroY);
    ctx.lineTo(CANVAS_WIDTH, zeroY);
    ctx.stroke();
    
    // Draw axis labels
    ctx.fillStyle = 'rgba(0, 100, 100, 1.0)';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Tiempo (s)', CANVAS_WIDTH / 2, CANVAS_HEIGHT - 20);
    
    ctx.save();
    ctx.translate(12, CANVAS_HEIGHT / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillText('Amplitud', 0, 0);
    ctx.restore();
  }, []);

  // Optimized signal rendering with clinical visualization standards
  const renderSignal = useCallback(() => {
    if (!canvasRef.current || !dataBufferRef.current) {
      animationFrameRef.current = requestAnimationFrame(renderSignal);
      return;
    }

    const currentTime = performance.now();
    const timeSinceLastRender = currentTime - lastRenderTimeRef.current;

    // Skip frames for performance optimization if needed
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
    
    // Dynamic baseline calculation with adaptive rate
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
        // Draw the main PPG signal with optimized rendering
        ctx.beginPath();
        ctx.strokeStyle = '#0080FF'; // Clinical blue for waveform
        ctx.lineWidth = 2.0;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        
        // Use path optimization to reduce redrawing
        let firstPoint = true;
        
        for (let i = 0; i < visiblePoints.length; i++) {
          const point = visiblePoints[i];
          const x = canvas.width - ((now - point.time) * canvas.width / WINDOW_WIDTH_MS);
          // More accurate positioning relative to zero line
          const y = canvas.height * 0.5 - point.value;
          
          if (firstPoint) {
            ctx.moveTo(x, y);
            firstPoint = false;
          } else {
            ctx.lineTo(x, y);
          }
          
          // Draw arrhythmia segments with distinct styling
          if (point.isArrhythmia && i < visiblePoints.length - 1) {
            ctx.stroke();
            ctx.beginPath();
            ctx.strokeStyle = '#FF0000'; // Red for arrhythmia
            ctx.lineWidth = 2.5;
            ctx.setLineDash([3, 2]);
            ctx.moveTo(x, y);
            
            const nextPoint = visiblePoints[i + 1];
            const nextX = canvas.width - ((now - nextPoint.time) * canvas.width / WINDOW_WIDTH_MS);
            const nextY = canvas.height * 0.5 - nextPoint.value;
            ctx.lineTo(nextX, nextY);
            ctx.stroke();
            
            // Reset for continuing normal signal
            ctx.beginPath();
            ctx.strokeStyle = '#0080FF';
            ctx.lineWidth = 2.0;
            ctx.setLineDash([]);
            ctx.moveTo(nextX, nextY);
            firstPoint = false;
          }
        }
        
        ctx.stroke();
      }

      // Clinical standard peak detection and marking
      const maxPeakIndices: number[] = [];
      
      for (let i = 2; i < visiblePoints.length - 2; i++) {
        const point = visiblePoints[i];
        const prevPoint1 = visiblePoints[i - 1];
        const prevPoint2 = visiblePoints[i - 2];
        const nextPoint1 = visiblePoints[i + 1];
        const nextPoint2 = visiblePoints[i + 2];
        
        // Enhanced peak detection criteria
        if (point.value > prevPoint1.value && 
            point.value > prevPoint2.value && 
            point.value > nextPoint1.value && 
            point.value > nextPoint2.value) {
          
          const peakAmplitude = point.value;
          
          // Only significant peaks with minimum amplitude
          if (peakAmplitude > PEAK_MIN_VALUE) {
            const peakTime = point.time;
            
            // Avoid closely spaced peaks for cleaner visualization
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
      
      // Draw peaks with clinical standard markers
      for (const idx of maxPeakIndices) {
        const point = visiblePoints[idx];
        const x = canvas.width - ((now - point.time) * canvas.width / WINDOW_WIDTH_MS);
        const y = canvas.height * 0.5 - point.value;
        
        // Draw peak markers with clinical significance
        ctx.beginPath();
        
        const isArrhythmiaPeak = point.isArrhythmia;
        const peakColor = isArrhythmiaPeak ? '#FF0000' : '#0080FF';
        
        // Draw peak marker
        ctx.fillStyle = peakColor;
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();
        
        // Add stroke for better definition
        ctx.strokeStyle = isArrhythmiaPeak ? '#FF0000' : '#0080FF';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Draw peak value
        ctx.font = '11px sans-serif';
        ctx.fillStyle = isArrhythmiaPeak ? '#FF0000' : '#0066CC';
        ctx.textAlign = 'center';
        ctx.fillText(Math.abs(point.value / VERTICAL_SCALE).toFixed(1), x, y - 15);
        
        // Enhanced arrhythmia visualization
        if (isArrhythmiaPeak) {
          // Warning indicator
          ctx.beginPath();
          ctx.arc(x, y, 15, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(255, 0, 0, 0.7)';
          ctx.lineWidth = 1.0;
          ctx.setLineDash([2, 2]);
          ctx.stroke();
          ctx.setLineDash([]);
          
          // Warning label
          ctx.font = 'bold 11px sans-serif';
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

      <div className="absolute inset-0 flex items-center justify-center" style={{ height: '60vh' }}>
        <div className="w-full h-full relative flex items-center justify-center">
          <canvas
            ref={canvasRef}
            width={CANVAS_WIDTH}
            height={CANVAS_HEIGHT}
            className="w-full h-full max-w-4xl"
            style={{ 
              imageRendering: 'crisp-edges',
              transform: 'translateZ(0)',
            }}
          />
        </div>
      </div>
      
      <div className="absolute" style={{ top: 'calc(60vh + 5px)', left: 0, right: 0, textAlign: 'center', zIndex: 30 }}>
        <h1 className="text-xl font-bold">
          <span className="text-white">Chars</span>
          <span className="text-[#ea384c]">Healt</span>
        </h1>
      </div>
    </>
  );
};

export default PPGSignalMeter;
