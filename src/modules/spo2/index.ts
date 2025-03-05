
/**
 * Main entry point for SpO2 module
 * Optimized exports for better tree-shaking
 */
export { SpO2Calculator } from './SpO2Calculator';
export { SPO2_CONSTANTS } from './SpO2Constants';
export { SpO2Processor } from './SpO2Processor';
export { AnomalyDetector } from './AnomalyDetector';
export { SignalStabilizer } from './SignalStabilizer';

// Export utilities separately to allow better tree-shaking
export * from './utils/CardiacFeatureExtractor';
export * from './utils/ResultStabilizer';
export * from './utils/SignalQualityAnalyzer';
