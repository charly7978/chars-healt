
import React, { useEffect, useRef, useCallback } from 'react';
import { CircularBuffer, PPGDataPoint } from '../../utils/CircularBuffer';
import { smoothValue } from './utils/SignalCanvasUtils';
import { useGridRenderer } from './GridRenderer';
import { useSignalRenderer } from './SignalRenderer';
import { CANVAS_DIMENSIONS, SIGNAL_PROCESSING, COLORS } from './constants/CanvasConstants';
import { useCanvasRenderLoop } from './hooks/useCanvasRenderLoop';

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
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  
  const { BUFFER_SIZE, SMOOTHING_FACTOR } = SIGNAL_PROCESSING;
  const { VERTICAL_SCALE } = CANVAS_DIMENSIONS;

  // Initialize the circular buffer
  useEffect(() => {
    if (!dataBufferRef.current) {
      dataBufferRef.current = new CircularBuffer(BUFFER_SIZE);
    }
  }, [BUFFER_SIZE]);

  // Get canvas context on mount
  useEffect(() => {
    if (canvasRef.current) {
      ctxRef.current = canvasRef.current.getContext('2d', { 
        alpha: false,
        desynchronized: true
      });
    }
  }, []);

  // Use our custom hooks for rendering
  const renderGrid = useGridRenderer(ctxRef.current);
  const { renderSignalPath, renderPeaks } = useSignalRenderer(ctxRef.current, canvasRef.current);

  // Process signal data and update buffer
  const processSignalData = useCallback(() => {
    if (!dataBufferRef.current) return null;
    
    const now = Date.now();
    
    // Update baseline
    if (baselineRef.current === null) {
      baselineRef.current = value;
    } else {
      const adaptiveRate = isFingerDetected ? 0.95 : 0.8;
      baselineRef.current = baselineRef.current * adaptiveRate + value * (1 - adaptiveRate);
    }

    // Smooth the signal value
    const smoothedValue = smoothValue(value, lastValueRef.current, SMOOTHING_FACTOR);
    lastValueRef.current = smoothedValue;

    // Normalize and scale the value
    const normalizedValue = smoothedValue - (baselineRef.current || 0);
    const scaledValue = normalizedValue * VERTICAL_SCALE;
    
    // Check for arrhythmia
    let isArrhythmia = false;
    if (rawArrhythmiaData && 
        arrhythmiaStatus?.includes("ARRITMIA") && 
        now - rawArrhythmiaData.timestamp < 1000) {
      isArrhythmia = true;
    }

    // Create data point and add to buffer
    const dataPoint: PPGDataPoint = {
      time: now,
      value: scaledValue,
      isArrhythmia
    };
    dataBufferRef.current.push(dataPoint);
    
    return { now, points: dataBufferRef.current.getPoints() };
  }, [value, isFingerDetected, arrhythmiaStatus, rawArrhythmiaData, VERTICAL_SCALE, SMOOTHING_FACTOR]);

  // Render function that will be called in the animation loop
  const renderFrame = useCallback(() => {
    if (!ctxRef.current || !dataBufferRef.current) return;
    
    const processedData = processSignalData();
    if (!processedData) return;
    
    const { now, points } = processedData;
    
    // Draw the grid
    renderGrid();

    // Get visible points and render them
    if (points.length > 1) {
      const visiblePoints = points.filter(
        point => (now - point.time) <= CANVAS_DIMENSIONS.WINDOW_WIDTH_MS
      );
      
      if (visiblePoints.length > 1) {
        renderSignalPath(visiblePoints, now);
        renderPeaks(visiblePoints, now, rawArrhythmiaData);
      }
    }
  }, [processSignalData, renderGrid, renderSignalPath, renderPeaks, rawArrhythmiaData]);

  // Use our custom animation loop hook
  useCanvasRenderLoop(renderFrame);

  return (
    <div className="absolute inset-0 w-full" style={{ height: '65vh', top: 0 }}>
      <canvas
        ref={canvasRef}
        width={CANVAS_DIMENSIONS.CANVAS_WIDTH}
        height={CANVAS_DIMENSIONS.CANVAS_HEIGHT}
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
