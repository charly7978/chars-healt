
/**
 * Handles signal filtering operations
 */
export class SignalFilter {
  private readonly SMA_WINDOW = 3;
  
  constructor() {
    console.log("SignalFilter initialized");
  }
  
  /**
   * Apply Simple Moving Average filter to a signal
   */
  public applySMAFilter(values: number[], newValue: number): number {
    const smaBuffer = values.slice(-this.SMA_WINDOW);
    smaBuffer.push(newValue);
    return smaBuffer.reduce((a, b) => a + b, 0) / smaBuffer.length;
  }
}
