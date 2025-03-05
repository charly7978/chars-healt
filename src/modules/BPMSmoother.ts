
/**
 * Handles heart rate (BPM) smoothing
 */
export class BPMSmoother {
  private readonly BPM_SMOOTHING_ALPHA = 0.25; // Smoothing factor for BPM
  private lastBPM: number = 0;
  
  constructor() {
    console.log("BPMSmoother initialized");
  }
  
  /**
   * Apply smoothing to BPM values
   */
  public smooth(rawBPM: number): number {
    if (rawBPM <= 0) return 0;
    
    if (this.lastBPM <= 0) {
      this.lastBPM = rawBPM;
      return rawBPM;
    }
    
    const smoothed = Math.round(
      this.BPM_SMOOTHING_ALPHA * rawBPM + 
      (1 - this.BPM_SMOOTHING_ALPHA) * this.lastBPM
    );
    
    this.lastBPM = smoothed;
    return smoothed;
  }
  
  /**
   * Reset all internal data
   */
  public reset(): void {
    this.lastBPM = 0;
  }
}
