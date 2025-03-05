
/**
 * Utility functions for signal processing in SpO2 calculations
 */

/**
 * Optimized insertion sort for small arrays
 * Much faster than Array.sort() for arrays of size <= 10
 */
export function insertionSort(arr: number[], len: number): void {
  for (let i = 1; i < len; i++) {
    const key = arr[i];
    let j = i - 1;
    
    while (j >= 0 && arr[j] > key) {
      arr[j + 1] = arr[j];
      j--;
    }
    
    arr[j + 1] = key;
  }
}

/**
 * Calculate mode (most common value) from array
 */
export function calculateMode(arr: number[]): number {
  const frequencyMap = new Map<number, number>();
  let maxFreq = 0;
  let modeValue = arr[0];
  
  for (const value of arr) {
    const count = (frequencyMap.get(value) || 0) + 1;
    frequencyMap.set(value, count);
    
    if (count > maxFreq) {
      maxFreq = count;
      modeValue = value;
    }
  }
  
  return modeValue;
}

/**
 * Apply pattern-based filtering using temporal patterns
 */
export function applyPatternBasedFiltering(values: number[]): number {
  // Calculate trend direction and strength
  let prevVal = values[0];
  let increasingCount = 0;
  let decreasingCount = 0;
  
  for (let i = 1; i < values.length; i++) {
    if (values[i] > prevVal) {
      increasingCount++;
    } else if (values[i] < prevVal) {
      decreasingCount++;
    }
    prevVal = values[i];
  }
  
  // Determine if there's a strong trend
  const totalComparisons = values.length - 1;
  const increasingRatio = increasingCount / totalComparisons;
  const decreasingRatio = decreasingCount / totalComparisons;
  
  const hasStrongTrend = Math.max(increasingRatio, decreasingRatio) > 0.7;
  
  if (hasStrongTrend) {
    // For strong trends, use a weighted average that emphasizes the trend direction
    if (increasingRatio > decreasingRatio) {
      // Emphasize later values
      return Math.round((values[2] * 0.3) + (values[3] * 0.3) + (values[4] * 0.4));
    } else {
      // Emphasize earlier values
      return Math.round((values[0] * 0.4) + (values[1] * 0.3) + (values[2] * 0.3));
    }
  } else {
    // For no clear trend, use trimmed mean of middle values
    return Math.round((values[1] + values[2] + values[3]) / 3);
  }
}
