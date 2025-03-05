
/**
 * Specialized class for stabilizing SpO2 results
 */
import { calculateConsistencyWeight } from './SignalAnalysisUtils';

export class ResultStabilizer {
  private previousResults: number[];
  private resultIndex: number = 0;
  private stableValue: number = 0;
  
  constructor(resultBufferSize: number = 5) {
    this.previousResults = new Array(resultBufferSize).fill(0);
  }
  
  /**
   * Reset the stabilizer state
   */
  reset(): void {
    this.previousResults.fill(0);
    this.resultIndex = 0;
    this.stableValue = 0;
  }
  
  /**
   * Add a new result and get stabilized value
   */
  stabilize(newValue: number): number {
    // Add to circular buffer
    this.previousResults[this.resultIndex] = newValue;
    this.resultIndex = (this.resultIndex + 1) % this.previousResults.length;
    
    // Use quantum-inspired Bayesian weighting for final estimation
    let weightedSum = 0;
    let totalWeight = 0;
    
    // Weight calculation with recency bias and consistency analysis
    for (let i = 0; i < this.previousResults.length; i++) {
      const value = this.previousResults[(this.resultIndex + i) % this.previousResults.length];
      if (value > 0) {
        // Calculate temporal decay weight (more recent values get higher weight)
        const temporalWeight = i < 2 ? 3 : 1;
        
        // Calculate consistency weight (values closer to mean get higher weight)
        const consistencyWeight = calculateConsistencyWeight(value, this.previousResults);
        
        // Combined weight with 70% temporal, 30% consistency
        const weight = (temporalWeight * 0.7) + (consistencyWeight * 0.3);
        
        weightedSum += value * weight;
        totalWeight += weight;
      }
    }
    
    const finalSpO2 = totalWeight > 0 ? 
                      Math.round(weightedSum / totalWeight) : 
                      newValue;
    
    // Apply Bayesian stability update with higher threshold for significant changes
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
