
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
  BUFFER_SIZE: 10,           // Reduced buffer size for better performance
  
  // Simplified advanced algorithm constants
  QUANTUM_FILTER_BANDS: 2,   // Reduced from 3 to 2
  WAVELET_LEVELS: 2,         // Reduced from 4 to 2
  ENSEMBLE_SIZE: 3,          // Reduced from 5 to 3
  PATTERN_MEMORY: 15,        // Reduced from 30 to 15
  ANOMALY_THRESHOLD: 4.0     // Increased for less aggressive filtering
};
