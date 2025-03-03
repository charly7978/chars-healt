
/**
 * Clinical-grade constants for SpO2 calculation and processing
 * Calibrated for high-resolution medical visualization
 */
export const SPO2_CONSTANTS = {
  CALIBRATION_FACTOR: 1.05, // Reducido para calibración más precisa
  MIN_AC_VALUE: 0.2,
  R_RATIO_A: 110, // Calibrado para máximo realista
  R_RATIO_B: 25, // Rango más natural
  BASELINE: 97, // Línea base normal saludable
  MOVING_AVERAGE_ALPHA: 0.15,
  BUFFER_SIZE: 25, // Increased buffer size for higher resolution
  HIGH_RESOLUTION_FACTOR: 1.5, // Enhanced visual quality factor
  SIGNAL_QUALITY_THRESHOLD: 0.85 // Professional-grade signal quality threshold
};
