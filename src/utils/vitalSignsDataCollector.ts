
// Utility for collecting and analyzing vital signs data

/**
 * Create a data collector for vital signs
 */
export function createVitalSignsDataCollector() {
  // Recent glucose measurements
  const glucoseHistory: number[] = [];
  const maxHistoryLength = 10;

  // Reset all collected data
  const reset = () => {
    glucoseHistory.length = 0;
  };

  // Add a new glucose measurement
  const addGlucose = (value: number) => {
    if (value > 0) {
      glucoseHistory.push(value);
      if (glucoseHistory.length > maxHistoryLength) {
        glucoseHistory.shift();
      }
    }
  };

  // Get average glucose from recent measurements
  const getAverageGlucose = (): number => {
    if (glucoseHistory.length === 0) return 0;
    
    // Weighted average - more recent values have higher weight
    let total = 0;
    let weightSum = 0;
    
    for (let i = 0; i < glucoseHistory.length; i++) {
      const weight = 1 + (i * 0.5); // Older values get higher weights
      total += glucoseHistory[i] * weight;
      weightSum += weight;
    }
    
    return Math.round(total / weightSum);
  };

  // Determine glucose trend
  const getGlucoseTrend = (): 'stable' | 'rising' | 'falling' | 'rising_rapidly' | 'falling_rapidly' | 'unknown' => {
    if (glucoseHistory.length < 3) return 'unknown';
    
    // Get last few readings
    const recent = glucoseHistory.slice(-3);
    
    // Calculate rate of change (mg/dL per reading)
    let sumChange = 0;
    for (let i = 1; i < recent.length; i++) {
      sumChange += recent[i] - recent[i-1];
    }
    const avgChange = sumChange / (recent.length - 1);
    
    // Determine trend based on rate of change
    if (avgChange > 3) return 'rising_rapidly';
    if (avgChange > 1) return 'rising';
    if (avgChange < -3) return 'falling_rapidly';
    if (avgChange < -1) return 'falling';
    return 'stable';
  };

  return {
    reset,
    addGlucose,
    getAverageGlucose,
    getGlucoseTrend
  };
}
