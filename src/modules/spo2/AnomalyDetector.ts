
/**
 * Specialized class for detecting anomalies in SpO2 signal data
 */
export class AnomalyDetector {
  private historyBuffer: number[] = [];
  private anomalyThreshold: number = 3.0; // Z-score threshold for anomaly detection
  
  /**
   * Reset the detector state
   */
  reset(): void {
    this.historyBuffer = [];
  }
  
  /**
   * Add a value to the history buffer
   */
  addValue(value: number): void {
    if (this.historyBuffer.length >= 60) { // Keep last minute of data (assuming ~1Hz sampling)
      this.historyBuffer.shift();
    }
    this.historyBuffer.push(value);
  }
  
  /**
   * Detect anomalies using Z-score method
   */
  detectAnomaly(value: number): boolean {
    if (this.historyBuffer.length < 10) return false; // Need enough history
    
    // Calculate mean and standard deviation of recent history
    const recentValues = this.historyBuffer.slice(-20);
    const mean = recentValues.reduce((sum, val) => sum + val, 0) / recentValues.length;
    const stdDev = Math.sqrt(
      recentValues.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / recentValues.length
    );
    
    if (stdDev < 0.001) return false; // Avoid division by zero
    
    // Calculate Z-score (how many standard deviations away from mean)
    const zScore = Math.abs(value - mean) / stdDev;
    
    // Return true if Z-score exceeds threshold
    return zScore > this.anomalyThreshold;
  }
  
  /**
   * Calculate signal stability as a value between 0 (unstable) and 1 (stable)
   */
  calculateSignalStability(): number {
    if (this.historyBuffer.length < 5) return 0.5; // Default mid stability
    
    // Use recent history to assess stability
    const recentValues = this.historyBuffer.slice(-10);
    
    // Calculate mean and standard deviation
    const mean = recentValues.reduce((sum, val) => sum + val, 0) / recentValues.length;
    const stdDev = Math.sqrt(
      recentValues.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / recentValues.length
    );
    
    // Calculate coefficient of variation (normalized std dev)
    const cv = stdDev / mean;
    
    // Convert to stability score (1 = perfectly stable, 0 = highly unstable)
    // For SpO2, even small changes can be significant, so scale appropriately
    return Math.max(0, Math.min(1, 1 - (cv * 20)));
  }
  
  /**
   * Get the history buffer
   */
  getHistoryBuffer(): number[] {
    return [...this.historyBuffer];
  }
}
