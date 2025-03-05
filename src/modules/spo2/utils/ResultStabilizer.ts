
/**
 * Specialized class for stabilizing SpO2 results
 * Optimized for performance on mobile devices
 */
import { calculateConsistencyWeight } from './SignalAnalysisUtils';

export class ResultStabilizer {
  private previousResults: number[];
  private resultIndex: number = 0;
  private stableValue: number = 0;
  private lastCalculationTime: number = 0;
  private calculationThrottleMs: number = 250; // Throttle calculations to once every 250ms
  
  constructor(resultBufferSize: number = 3) { // Reduced from 5 to 3 for better performance
    this.previousResults = new Array(resultBufferSize).fill(0);
  }
  
  /**
   * Reset the stabilizer state
   */
  reset(): void {
    this.previousResults.fill(0);
    this.resultIndex = 0;
    this.stableValue = 0;
    this.lastCalculationTime = 0;
  }
  
  /**
   * Add a new result and get stabilized value
   * With performance optimizations
   */
  stabilize(newValue: number): number {
    // Skip processing if the value hasn't changed significantly
    if (Math.abs(newValue - this.stableValue) < 0.5) {
      return this.stableValue;
    }
    
    // Performance throttling - only update at fixed intervals
    const now = performance.now();
    if (now - this.lastCalculationTime < this.calculationThrottleMs) {
      return this.stableValue;
    }
    this.lastCalculationTime = now;
    
    // Add to circular buffer
    this.previousResults[this.resultIndex] = newValue;
    this.resultIndex = (this.resultIndex + 1) % this.previousResults.length;
    
    // Simple optimization: if we don't have enough data, just return the new value
    let validValues = 0;
    for (let i = 0; i < this.previousResults.length; i++) {
      if (this.previousResults[i] > 0) validValues++;
    }
    
    if (validValues < 2) {
      this.stableValue = newValue;
      return newValue;
    }
    
    // Use simplified weighting algorithm for better performance
    let weightedSum = 0;
    let totalWeight = 0;
    
    // Weight calculation with recency bias - simplified algorithm
    for (let i = 0; i < this.previousResults.length; i++) {
      const value = this.previousResults[(this.resultIndex + i) % this.previousResults.length];
      if (value > 0) {
        // Fixed weights based on position for performance (instead of dynamic calculation)
        const weight = this.previousResults.length - i;
        weightedSum += value * weight;
        totalWeight += weight;
      }
    }
    
    const finalSpO2 = totalWeight > 0 ? 
                      Math.round(weightedSum / totalWeight) : 
                      newValue;
    
    // Apply stability update with higher threshold for significant changes
    if (this.stableValue === 0 || Math.abs(finalSpO2 - this.stableValue) >= 1) {
      this.stableValue = finalSpO2;
    }
    
    return this.stableValue;
  }
  
  /**
   * Get the current stable value
   */
  getStableValue(): number {
    return this.stableValue;
  }
}
