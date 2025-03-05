
// Canvas configuration constants
export const CANVAS_DIMENSIONS = {
  WINDOW_WIDTH_MS: 3500,
  CANVAS_WIDTH: 1800,
  CANVAS_HEIGHT: 1200,
  GRID_SIZE_X: 150,
  GRID_SIZE_Y: 150,
  VERTICAL_SCALE: 40.0,
};

// Signal processing constants
export const SIGNAL_PROCESSING = {
  SMOOTHING_FACTOR: 1.6,
  TARGET_FPS: 60,
  FRAME_TIME: 1000 / 60, // 60 is TARGET_FPS
  BUFFER_SIZE: 650,
  PEAK_MIN_VALUE: 8.0,
  PEAK_DISTANCE_MS: 200,
};

// Color palette for the canvas
export const COLORS = {
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
