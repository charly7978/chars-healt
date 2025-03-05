
/**
 * Utility functions for the SignalCanvas component
 */

/**
 * Smooths a value using an exponential smoothing algorithm
 * @param currentValue The current raw value
 * @param previousValue The previous smoothed value
 * @param smoothingFactor The smoothing factor (higher = more responsive)
 * @returns The smoothed value
 */
export const smoothValue = (
  currentValue: number, 
  previousValue: number | null, 
  smoothingFactor: number
): number => {
  if (previousValue === null) return currentValue;
  return previousValue + smoothingFactor * (currentValue - previousValue);
};

/**
 * Find maximum peak indices in visible points
 * @param visiblePoints Array of data points
 * @param peakMinValue Minimum value to consider a peak
 * @param peakDistanceMs Minimum distance between peaks in ms
 * @returns Array of indices representing peaks
 */
export const findMaxPeakIndices = (
  visiblePoints: any[], 
  peakMinValue: number, 
  peakDistanceMs: number
): number[] => {
  const maxPeakIndices: number[] = [];
  
  for (let i = 2; i < visiblePoints.length - 2; i++) {
    const point = visiblePoints[i];
    const prevPoint1 = visiblePoints[i - 1];
    const prevPoint2 = visiblePoints[i - 2];
    const nextPoint1 = visiblePoints[i + 1];
    const nextPoint2 = visiblePoints[i + 2];
    
    if (point.value > prevPoint1.value && 
        point.value > prevPoint2.value && 
        point.value > nextPoint1.value && 
        point.value > nextPoint2.value) {
      
      const peakAmplitude = point.value;
      
      if (peakAmplitude > peakMinValue) {
        const peakTime = point.time;
        
        const hasPeakNearby = maxPeakIndices.some(idx => {
          const existingPeakTime = visiblePoints[idx].time;
          return Math.abs(existingPeakTime - peakTime) < peakDistanceMs;
        });
        
        if (!hasPeakNearby) {
          maxPeakIndices.push(i);
        }
      }
    }
  }
  
  return maxPeakIndices;
};
