
import React, { useCallback } from 'react';
import { COLORS, CANVAS_DIMENSIONS } from './constants/CanvasConstants';
import { findMaxPeakIndices } from './utils/SignalCanvasUtils';
import { PPGDataPoint } from '../../utils/CircularBuffer';

interface SignalRendererProps {
  ctx: CanvasRenderingContext2D | null;
  visiblePoints: PPGDataPoint[];
  now: number;
  rawArrhythmiaData?: {
    timestamp: number;
    rmssd: number;
    rrVariation: number;
  } | null;
}

const SignalRenderer: React.FC<SignalRendererProps> = ({ 
  ctx, 
  visiblePoints, 
  now,
  rawArrhythmiaData
}) => {
  return null; // This component doesn't render anything
};

export default React.memo(SignalRenderer);

export const useSignalRenderer = (
  ctx: CanvasRenderingContext2D | null, 
  canvas: HTMLCanvasElement | null
) => {
  const renderSignalPath = useCallback((
    visiblePoints: PPGDataPoint[], 
    now: number
  ) => {
    if (!ctx || !canvas || visiblePoints.length <= 1) return;
    
    const { CANVAS_WIDTH, CANVAS_HEIGHT, WINDOW_WIDTH_MS } = CANVAS_DIMENSIONS;

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
  }, [ctx, canvas]);

  const renderPeaks = useCallback((
    visiblePoints: PPGDataPoint[], 
    now: number, 
    rawArrhythmiaData: {
      timestamp: number;
      rmssd: number;
      rrVariation: number;
    } | null
  ) => {
    if (!ctx || !canvas || visiblePoints.length <= 4) return;
    
    const { CANVAS_WIDTH, CANVAS_HEIGHT, WINDOW_WIDTH_MS, VERTICAL_SCALE } = CANVAS_DIMENSIONS;
    const { PEAK_MIN_VALUE, PEAK_DISTANCE_MS } = SIGNAL_PROCESSING;
    
    const maxPeakIndices = findMaxPeakIndices(visiblePoints, PEAK_MIN_VALUE, PEAK_DISTANCE_MS);
    
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
  }, [ctx, canvas]);

  return { renderSignalPath, renderPeaks };
};
