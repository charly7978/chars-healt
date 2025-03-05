
import React, { useCallback } from 'react';
import { COLORS, CANVAS_DIMENSIONS } from './constants/CanvasConstants';

interface GridRendererProps {
  ctx: CanvasRenderingContext2D;
}

const GridRenderer: React.FC<GridRendererProps> = ({ ctx }) => {
  const drawGrid = useCallback(() => {
    const { 
      CANVAS_WIDTH, 
      CANVAS_HEIGHT, 
      GRID_SIZE_X, 
      GRID_SIZE_Y, 
      WINDOW_WIDTH_MS,
      VERTICAL_SCALE 
    } = CANVAS_DIMENSIONS;

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
  }, [ctx]);

  return null; // This is a utility component that doesn't render anything
};

export default React.memo(GridRenderer);

export const useGridRenderer = (ctx: CanvasRenderingContext2D | null) => {
  const renderGrid = useCallback(() => {
    if (!ctx) return;
    
    const { 
      CANVAS_WIDTH, 
      CANVAS_HEIGHT, 
      GRID_SIZE_X, 
      GRID_SIZE_Y, 
      WINDOW_WIDTH_MS,
      VERTICAL_SCALE 
    } = CANVAS_DIMENSIONS;

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
  }, [ctx]);

  return renderGrid;
};
