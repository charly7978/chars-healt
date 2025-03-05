
import React, { useCallback } from 'react';
import { COLORS, CANVAS_DIMENSIONS, SIGNAL_PROCESSING } from './constants/CanvasConstants';
import { PPGDataPoint } from '../../utils/CircularBuffer';

interface SignalCanvasRendererProps {
  ctx: CanvasRenderingContext2D | null;
  canvas: HTMLCanvasElement | null;
  dataPoints: PPGDataPoint[];
  rawArrhythmiaData?: {
    timestamp: number;
    rmssd: number;
    rrVariation: number;
  } | null;
}

/**
 * Component responsible for rendering the signal canvas
 * This is a utility component that doesn't render anything visually
 */
const SignalCanvasRenderer: React.FC<SignalCanvasRendererProps> = () => {
  return null;
};

export default React.memo(SignalCanvasRenderer);

export const useCanvasRenderer = (
  ctx: CanvasRenderingContext2D | null,
  canvas: HTMLCanvasElement | null
) => {
  const renderFrame = useCallback((
    dataPoints: PPGDataPoint[],
    now: number,
    rawArrhythmiaData?: {
      timestamp: number;
      rmssd: number;
      rrVariation: number;
    } | null
  ) => {
    if (!ctx || !canvas) return;
    
    const { CANVAS_WIDTH, CANVAS_HEIGHT, WINDOW_WIDTH_MS, VERTICAL_SCALE } = CANVAS_DIMENSIONS;
    const { PEAK_MIN_VALUE, PEAK_DISTANCE_MS } = SIGNAL_PROCESSING;

    // Draw grid and background
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.fillStyle = COLORS.BACKGROUND;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    const zeroY = CANVAS_HEIGHT * 0.6;
    
    // Draw zero line
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

    for (let x = 0; x <= CANVAS_WIDTH; x += CANVAS_DIMENSIONS.GRID_SIZE_X / 4) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, CANVAS_HEIGHT);
    }

    for (let y = 0; y <= CANVAS_HEIGHT; y += CANVAS_DIMENSIONS.GRID_SIZE_Y / 4) {
      ctx.moveTo(0, y);
      ctx.lineTo(CANVAS_WIDTH, y);
    }
    ctx.stroke();

    // Draw major grid lines
    ctx.beginPath();
    ctx.strokeStyle = COLORS.GRID_MAIN;
    ctx.lineWidth = 1.0;

    for (let x = 0; x <= CANVAS_WIDTH; x += CANVAS_DIMENSIONS.GRID_SIZE_X * 4) {
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

    for (let y = 0; y <= CANVAS_HEIGHT; y += CANVAS_DIMENSIONS.GRID_SIZE_Y * 4) {
      ctx.moveTo(0, y);
      ctx.lineTo(CANVAS_WIDTH, y);
      
      if (y % (CANVAS_DIMENSIONS.GRID_SIZE_Y * 4) === 0) {
        const amplitude = ((zeroY - y) / VERTICAL_SCALE).toFixed(1);
        ctx.fillStyle = COLORS.AXIS_TEXT;
        ctx.font = '22px "Inter", sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(amplitude, 32, y + 6);
      }
    }
    ctx.stroke();

    // Draw axis labels
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

    // Draw the signal if we have enough points
    if (dataPoints.length > 1) {
      // Filter to visible points only
      const visiblePoints = dataPoints.filter(
        point => (now - point.time) <= WINDOW_WIDTH_MS
      );
      
      if (visiblePoints.length > 1) {
        // Draw the signal line
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

        // Find and draw peaks
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
        
        // Draw peaks
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
    }
  }, [ctx, canvas]);

  return { renderFrame };
};
