
/**
 * Constants for SpO2 calculation and processing - Optimized for performance
 */
export const SPO2_CONSTANTS = {
  CALIBRATION_FACTOR: 1.05,  // Calibration factor for R ratio
  MIN_AC_VALUE: 0.05,        // Moderate threshold for better performance
  R_RATIO_A: 110,            // Calibrated for maximum realistic value
  R_RATIO_B: 25,             // Range factor for natural physiological range
  BASELINE: 97,              // Normal healthy baseline
  MOVING_AVERAGE_ALPHA: 0.2, // Increased for faster response
  BUFFER_SIZE: 8,           // Reduced buffer size for better performance (was 10)
  
  // Simplified advanced algorithm constants
  QUANTUM_FILTER_BANDS: 1,   // Reduced from 2 to 1
  WAVELET_LEVELS: 1,         // Reduced from 2 to 1
  ENSEMBLE_SIZE: 2,          // Reduced from 3 to 2
  PATTERN_MEMORY: 8,         // Reduced from 15 to 8
  ANOMALY_THRESHOLD: 4.5     // Increased for less aggressive filtering
};
