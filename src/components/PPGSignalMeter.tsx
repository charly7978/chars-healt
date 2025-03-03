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
  const offscreenCanvasRef = useRef<OffscreenCanvas | null>(null);
  const offscreenCtxRef = useRef<OffscreenCanvasRenderingContext2D | null>(null);
  const lastValueTextRef = useRef<string[]>([]);
  
  const WINDOW_WIDTH_MS = 4000;
  const CANVAS_WIDTH = 550;
  const CANVAS_HEIGHT = 550;
  const GRID_SIZE_X = 55;
  const GRID_SIZE_Y = 30;
  const verticalScale = 45.0;
  const SMOOTHING_FACTOR = 0.8; // Reduced smoothing factor for more fluid response
  const TARGET_FPS = 120; // Higher target FPS for smoother rendering
  const FRAME_TIME = 900 / TARGET_FPS;
  const BUFFER_SIZE = 300;
  const INVERT_SIGNAL = true;
  const TEXT_STABILITY_FRAMES = 5; // Only update text when value is stable for X frames
  
  // Pre-render the grid to an offscreen canvas
  useEffect(() => {
    try {
      // Create offscreen canvas once for grid
      if (!offscreenCanvasRef.current && typeof OffscreenCanvas !== 'undefined') {
        offscreenCanvasRef.current = new OffscreenCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
        offscreenCtxRef.current = offscreenCanvasRef.current.getContext('2d', 
          { alpha: false, desynchronized: true }) as OffscreenCanvasRenderingContext2D;
        
        if (offscreenCtxRef.current) {
          // Pre-render grid to offscreen canvas
          const ctx = offscreenCtxRef.current;
          
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
        }
      }
    } catch (err) {
      console.error("Error creating offscreen canvas:", err);
    }
    
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
    // If we have an offscreen canvas with pre-rendered grid, use it for better performance
    if (offscreenCanvasRef.current && offscreenCtxRef.current) {
      ctx.drawImage(offscreenCanvasRef.current, 0, 0);
      return;
    }
    
    // Fallback to standard grid drawing if offscreen canvas isn't available
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

  // Stabilize text rendering by using a buffer for peak amplitude text
  const getStableText = useCallback((value: number): string => {
    const newText = Math.abs(value / verticalScale).toFixed(2);
    
    if (lastValueTextRef.current.length === 0) {
      // Initialize array with the same text
      lastValueTextRef.current = Array(TEXT_STABILITY_FRAMES).fill(newText);
      return newText;
    }
    
    // Add new value to the buffer
    lastValueTextRef.current.push(newText);
    if (lastValueTextRef.current.length > TEXT_STABILITY_FRAMES) {
      lastValueTextRef.current.shift();
    }
    
    // Count occurrences of each text
    const counts: Record<string, number> = {};
    for (const text of lastValueTextRef.current) {
      counts[text] = (counts[text] || 0) + 1;
    }
    
    // Find the most frequent text
    let mostFrequentText = newText;
    let maxCount = 0;
    
    for (const text in counts) {
      if (counts[text] > maxCount) {
        maxCount = counts[text];
        mostFrequentText = text;
      }
    }
    
    return mostFrequentText;
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
      baselineRef.current = baselineRef.current * 0.98 + value * 0.02;
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
        // Draw signal with optimized rendering
        ctx.beginPath();
        ctx.strokeStyle = '#0EA5E9';
        ctx.lineWidth = 2;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        
        // Use path2D for better performance if available
        if (typeof Path2D !== 'undefined') {
          const path = new Path2D();
          let firstPoint = true;
          
          for (let i = 0; i < visiblePoints.length; i++) {
            const point = visiblePoints[i];
            // Skip rendering some points for better performance if there are too many
            if (visiblePoints.length > 200 && i % 2 !== 0 && i !== visiblePoints.length - 1) continue;
            
            const x = canvas.width - ((now - point.time) * canvas.width / WINDOW_WIDTH_MS);
            const y = canvas.height * 0.6 - point.value;
            
            if (firstPoint) {
              path.moveTo(x, y);
              firstPoint = false;
            } else {
              path.lineTo(x, y);
            }
          }
          
          ctx.stroke(path);
          
          // Handle arrhythmia segments separately
          for (let i = 0; i < visiblePoints.length - 1; i++) {
            const point = visiblePoints[i];
            if (point.isArrhythmia) {
              const x = canvas.width - ((now - point.time) * canvas.width / WINDOW_WIDTH_MS);
              const y = canvas.height * 0.6 - point.value;
              
              const nextPoint = visiblePoints[i + 1];
              const nextX = canvas.width - ((now - nextPoint.time) * canvas.width / WINDOW_WIDTH_MS);
              const nextY = canvas.height * 0.6 - nextPoint.value;
              
              const arrhythmiaPath = new Path2D();
              arrhythmiaPath.moveTo(x, y);
              arrhythmiaPath.lineTo(nextX, nextY);
              
              ctx.save();
              ctx.strokeStyle = '#DC2626';
              ctx.lineWidth = 3;
              ctx.setLineDash([3, 2]);
              ctx.stroke(arrhythmiaPath);
              ctx.restore();
            }
          }
        } else {
          // Fallback to standard canvas drawing
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
      }

      // Find peak points for labeling, optimized method
      const maxPeakIndices: number[] = [];
      const peakThreshold = 7.0;
      
      // Use a stride-based approach for peak detection (check every Nth point)
      const stride = visiblePoints.length > 100 ? 2 : 1;
      
      for (let i = 2; i < visiblePoints.length - 2; i += stride) {
        const point = visiblePoints[i];
        const prevPoint1 = visiblePoints[i - 1];
        const prevPoint2 = visiblePoints[i - 2];
        const nextPoint1 = visiblePoints[i + 1];
        const nextPoint2 = visiblePoints[i + 2];
        
        if (point.value > prevPoint1.value && 
            point.value > prevPoint2.value && 
            point.value > nextPoint1.value && 
            point.value > nextPoint2.value && 
            point.value > peakThreshold) {
          
          // Check for nearby peaks to avoid clustering
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
      
      // Draw peaks and labels with optimized rendering
      ctx.save();
      
      for (let idx of maxPeakIndices) {
        const point = visiblePoints[idx];
        const x = canvas.width - ((now - point.time) * canvas.width / WINDOW_WIDTH_MS);
        const y = canvas.height * 0.6 - point.value;
        
        // Draw peak marker
        ctx.beginPath();
        ctx.arc(x, y, point.isArrhythmia ? 5 : 4, 0, Math.PI * 2);
        ctx.fillStyle = point.isArrhythmia ? '#DC2626' : '#0EA5E9';
        ctx.fill();

        // Get stable text value to prevent flickering
        const stableText = getStableText(point.value);
        
        // Draw value text
        ctx.font = 'bold 12px Inter';
        ctx.fillStyle = '#666666';
        ctx.textAlign = 'center';
        ctx.fillText(stableText, x, y - 20);
        
        // Special highlighting for arrhythmia points
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
      
      ctx.restore();
    }

    lastRenderTimeRef.current = currentTime;
    animationFrameRef.current = requestAnimationFrame(renderSignal);
  }, [value, quality, isFingerDetected, rawArrhythmiaData, arrhythmiaStatus, drawGrid, smoothValue, getStableText]);

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

      <div className="absolute inset-0 w-full" style={{ height: '50vh', top: 0 }}>
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
            imageRendering: "crisp-edges"
          }}
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
