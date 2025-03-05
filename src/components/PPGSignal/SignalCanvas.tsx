
import React, { useEffect, useRef, useCallback } from 'react';
import { CircularBuffer, PPGDataPoint } from '../../utils/CircularBuffer';

interface SignalCanvasProps {
  value: number;
  quality: number;
  isFingerDetected: boolean;
  arrhythmiaStatus?: string;
  rawArrhythmiaData?: {
    timestamp: number;
    rmssd: number;
    rrVariation: number;
  } | null;
}

const SignalCanvas: React.FC<SignalCanvasProps> = ({ 
  value, 
  quality, 
  isFingerDetected,
  arrhythmiaStatus,
  rawArrhythmiaData
}) => {
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
  const PEAK_MIN_VALUE = 8.0;
  const PEAK_DISTANCE_MS = 200;
  
  const COLORS = {
    BACKGROUND: '#F6F6F7',
    GRID_MAIN: 'rgba(128, 128, 128, 0.3)',
    GRID_MINOR: 'rgba(128, 128, 128, 0.1)',
    ZERO_LINE: 'rgba(0, 255, 150, 0.9)',
    AXIS_TEXT: 'rgba(50, 50, 50, 1.0)',
    SIGNAL_LINE: '#FFFFFF',
    ARRHYTHMIA_LINE: '#EF4444',
    PEAK_NORMAL: '#FFFFFF',
    PEAK_ARRHYTHMIA: '#EF4444',
    PEAK_GLOW_NORMAL: 'rgba(255, 255, 255, 0.3)',
    PEAK_GLOW_ARRHYTHMIA: 'rgba(239, 68, 68, 0.3)'
  };

  useEffect(() => {
    if (!dataBufferRef.current) {
      dataBufferRef.current = new CircularBuffer(BUFFER_SIZE);
    }
  }, []);

  const smoothValue = useCallback((currentValue: number, previousValue: number | null): number => {
    if (previousValue === null) return currentValue;
    return previousValue + SMOOTHING_FACTOR * (currentValue - previousValue);
  }, []);

  const drawGrid = useCallback((ctx: CanvasRenderingContext2D) => {
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.fillStyle = COLORS.BACKGROUND;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    const zeroY = CANVAS_HEIGHT * 0.6;
    
    ctx.beginPath();
    ctx.strokeStyle = COLORS.ZERO_LINE;
    ctx.lineWidth = 2.0;
    ctx.moveTo(0, zeroY);
    ctx.lineTo(CANVAS_WIDTH, zeroY);
    ctx.stroke();

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

    ctx.beginPath();
    ctx.strokeStyle = COLORS.GRID_MAIN;
    ctx.lineWidth = 1.0;

    for (let x = 0; x <= CANVAS_WIDTH; x += GRID_SIZE_X * 4) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, CANVAS_HEIGHT);
      
      if (x >= 0) {
        const timeMs = (x / CANVAS_WIDTH) * WINDOW_WIDTH_MS;
        ctx.fillStyle = COLORS.AXIS_TEXT;
        ctx.font = '22px "Inter", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${Math.round(timeMs)}ms`, x, CANVAS_HEIGHT - 10);
      }
    }

    for (let y = 0; y <= CANVAS_HEIGHT; y += GRID_SIZE_Y * 4) {
      ctx.moveTo(0, y);
      ctx.lineTo(CANVAS_WIDTH, y);
      
      if (y % (GRID_SIZE_Y * 4) === 0) {
        const amplitude = ((zeroY - y) / VERTICAL_SCALE).toFixed(1);
        ctx.fillStyle = COLORS.AXIS_TEXT;
        ctx.font = '22px "Inter", sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(amplitude, 32, y + 6);
      }
    }
    ctx.stroke();

    ctx.fillStyle = COLORS.AXIS_TEXT;
    ctx.font = 'bold 24px "Inter", sans-serif';
    
    ctx.textAlign = 'center';
    ctx.fillText('Tiempo (ms)', CANVAS_WIDTH / 2, CANVAS_HEIGHT - 30);
    
    ctx.save();
    ctx.translate(24, CANVAS_HEIGHT / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('Amplitud', 0, 0);
    ctx.restore();
    
    ctx.font = '18px "Inter", sans-serif';
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
        ctx.lineWidth = 2.2;
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
            ctx.lineWidth = 2.5;
            ctx.setLineDash([3, 2]);
            ctx.moveTo(x, y);
            
            const nextPoint = visiblePoints[i + 1];
            const nextX = canvas.width - ((now - nextPoint.time) * canvas.width / WINDOW_WIDTH_MS);
            const nextY = canvas.height * 0.6 - nextPoint.value;
            ctx.lineTo(nextX, nextY);
            ctx.stroke();
            
            ctx.beginPath();
            ctx.strokeStyle = COLORS.SIGNAL_LINE;
            ctx.lineWidth = 2.2;
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
      
      for (const idx of maxPeakIndices) {
        const point = visiblePoints[idx];
        const x = canvas.width - ((now - point.time) * canvas.width / WINDOW_WIDTH_MS);
        const y = canvas.height * 0.6 - point.value;
        
        const isArrhythmiaPeak = point.isArrhythmia;
        
        ctx.beginPath();
        const peakColor = isArrhythmiaPeak ? COLORS.PEAK_ARRHYTHMIA : COLORS.PEAK_NORMAL;
        const glowColor = isArrhythmiaPeak ? COLORS.PEAK_GLOW_ARRHYTHMIA : COLORS.PEAK_GLOW_NORMAL;
        
        const gradient = ctx.createRadialGradient(x, y, 2, x, y, 10);
        gradient.addColorStop(0, peakColor);
        gradient.addColorStop(1, glowColor);
        
        ctx.fillStyle = gradient;
        ctx.arc(x, y, isArrhythmiaPeak ? 7 : 5.5, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.strokeStyle = isArrhythmiaPeak ? '#FF4D4D' : COLORS.PEAK_NORMAL;
        ctx.lineWidth = 1.8;
        ctx.stroke();

        ctx.font = 'bold 15px "Inter", sans-serif';
        ctx.fillStyle = isArrhythmiaPeak ? '#FFCCCB' : '#FFFFFF';
        ctx.textAlign = 'center';
        ctx.fillText(Math.abs(point.value / VERTICAL_SCALE).toFixed(2), x, y - 22);
        
        if (isArrhythmiaPeak) {
          ctx.font = 'bold 16px "Inter", sans-serif';
          ctx.fillStyle = '#FF4D4D';
          ctx.fillText("ARRITMIA DETECTADA", x, y - 40);
          
          if (rawArrhythmiaData) {
            ctx.font = '14px "Inter", sans-serif';
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
  );
};

export default SignalCanvas;
