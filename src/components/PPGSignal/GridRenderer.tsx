
import { useCallback } from 'react';
import { COLORS, CANVAS_DIMENSIONS } from './constants/CanvasConstants';

export const useGridRenderer = (ctx: CanvasRenderingContext2D | null) => {
  /**
   * Render the grid and axis labels on the canvas
   */
  const renderGrid = useCallback(() => {
    if (!ctx) return;

    const { CANVAS_WIDTH, CANVAS_HEIGHT, GRID_SIZE_X, GRID_SIZE_Y } = CANVAS_DIMENSIONS;
    
    // Clear the canvas
    ctx.fillStyle = COLORS.BACKGROUND;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    
    // Draw main grid lines
    ctx.strokeStyle = COLORS.GRID_MAIN;
    ctx.lineWidth = 1;
    ctx.beginPath();
    
    // Vertical grid lines
    for (let x = 0; x <= CANVAS_WIDTH; x += GRID_SIZE_X) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, CANVAS_HEIGHT);
    }
    
    // Horizontal grid lines
    for (let y = 0; y <= CANVAS_HEIGHT; y += GRID_SIZE_Y) {
      ctx.moveTo(0, y);
      ctx.lineTo(CANVAS_WIDTH, y);
    }
    
    ctx.stroke();
    
    // Draw minor grid lines
    ctx.strokeStyle = COLORS.GRID_MINOR;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    
    // Vertical minor grid lines
    for (let x = 0; x <= CANVAS_WIDTH; x += GRID_SIZE_X / 5) {
      if (x % GRID_SIZE_X !== 0) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, CANVAS_HEIGHT);
      }
    }
    
    // Horizontal minor grid lines
    for (let y = 0; y <= CANVAS_HEIGHT; y += GRID_SIZE_Y / 5) {
      if (y % GRID_SIZE_Y !== 0) {
        ctx.moveTo(0, y);
        ctx.lineTo(CANVAS_WIDTH, y);
      }
    }
    
    ctx.stroke();
    
    // Draw zero line
    ctx.strokeStyle = COLORS.ZERO_LINE;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, CANVAS_HEIGHT * 0.6);
    ctx.lineTo(CANVAS_WIDTH, CANVAS_HEIGHT * 0.6);
    ctx.stroke();
    
    // Draw axis labels
    ctx.font = '12px "Inter", sans-serif';
    ctx.fillStyle = COLORS.AXIS_TEXT;
    ctx.textAlign = 'center';
    
    // Time axis labels (every 500ms)
    for (let x = CANVAS_WIDTH - GRID_SIZE_X; x >= 0; x -= GRID_SIZE_X) {
      const timeValue = ((CANVAS_WIDTH - x) / CANVAS_WIDTH) * CANVAS_DIMENSIONS.WINDOW_WIDTH_MS / 1000;
      ctx.fillText(`${timeValue.toFixed(1)}s`, x, CANVAS_HEIGHT - 10);
    }
    
    // Amplitude axis labels
    for (let y = CANVAS_HEIGHT * 0.6 - GRID_SIZE_Y; y >= 0; y -= GRID_SIZE_Y) {
      const amplitudeValue = (CANVAS_HEIGHT * 0.6 - y) / CANVAS_DIMENSIONS.VERTICAL_SCALE;
      ctx.fillText(`${amplitudeValue.toFixed(1)}`, 25, y);
    }
    
    for (let y = CANVAS_HEIGHT * 0.6 + GRID_SIZE_Y; y <= CANVAS_HEIGHT; y += GRID_SIZE_Y) {
      const amplitudeValue = (y - CANVAS_HEIGHT * 0.6) / CANVAS_DIMENSIONS.VERTICAL_SCALE;
      ctx.fillText(`${-amplitudeValue.toFixed(1)}`, 25, y);
    }
  }, [ctx]);

  return renderGrid;
};
