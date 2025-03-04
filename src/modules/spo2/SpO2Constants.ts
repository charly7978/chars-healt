
/**
 * Constants for SpO2 calculation and processing
 */
export const SPO2_CONSTANTS = {
  CALIBRATION_FACTOR: 1.05, // Calibration factor for R ratio
  MIN_AC_VALUE: 0.2,        // Minimum AC value threshold
  R_RATIO_A: 110,           // Calibrated for maximum realistic value
  R_RATIO_B: 25,            // Range factor for natural physiological range
  BASELINE: 97,             // Normal healthy baseline
  MOVING_AVERAGE_ALPHA: 0.15, // Exponential moving average factor
  BUFFER_SIZE: 15,          // Data buffer size for processing
  
  // Advanced quantum-inspired algorithm constants
  QUANTUM_FILTER_BANDS: 3,  // Number of parallel filter bands
  WAVELET_LEVELS: 4,        // Decomposition levels for wavelet transform
  ENSEMBLE_SIZE: 5,         // Number of ensemble estimators
  PATTERN_MEMORY: 30,       // Pattern recognition memory in seconds
  ANOMALY_THRESHOLD: 3.5    // Z-score threshold for anomaly detection
};

