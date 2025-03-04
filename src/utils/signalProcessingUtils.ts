
/**
 * Apply Simple Moving Average filter to a signal
 * 
 * @param signal - Existing signal data array
 * @param newValue - New value to add to the signal
 * @param windowSize - Size of the moving average window
 * @returns Filtered value
 */
export function applySMAFilter(signal: number[], newValue: number, windowSize: number): number {
  if (signal.length === 0) return newValue;
  
  // Calculate how many samples to use for the moving average
  const samplesToUse = Math.min(windowSize, signal.length);
  
  // Calculate the sum of the most recent samples
  let sum = newValue;
  for (let i = 1; i <= samplesToUse; i++) {
    sum += signal[signal.length - i];
  }
  
  // Return the average
  return sum / (samplesToUse + 1);
}
