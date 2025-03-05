/**
 * Handles signal filtering operations
 * Optimizado para mejor rendimiento
 */
export class SignalFilter {
  private readonly SMA_WINDOW = 3;
  private smaBuffer: number[] = [];
  
  constructor() {
    // Pre-allocate buffer for better performance
    this.smaBuffer = new Array(this.SMA_WINDOW).fill(0);
    console.log("SignalFilter initialized with optimized performance");
  }
  
  /**
   * Apply Simple Moving Average filter to a signal
   * Optimized version for better performance
   */
  public applySMAFilter(values: number[], newValue: number): number {
    // Keep most recent values for quick access
    this.smaBuffer.shift();
    this.smaBuffer.push(newValue);
    
    // Manual sum is faster than reduce for small arrays
    let sum = 0;
    for (let i = 0; i < this.SMA_WINDOW; i++) {
      sum += this.smaBuffer[i];
    }
    
    return sum / this.SMA_WINDOW;
  }
  
  /**
   * Reset filter state
   */
  public reset(): void {
    this.smaBuffer = new Array(this.SMA_WINDOW).fill(0);
  }
}
