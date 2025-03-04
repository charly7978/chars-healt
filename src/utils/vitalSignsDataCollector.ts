
// Utility for collecting and analyzing vital signs data

/**
 * Create a data collector for vital signs
 */
export function createVitalSignsDataCollector() {
  // Recent measurements
  const glucoseHistory: number[] = [];
  const spo2History: number[] = [];
  const pressureHistory: string[] = [];
  const respirationHistory: number[] = [];
  const maxHistoryLength = 10;

  const reset = () => {
    glucoseHistory.length = 0;
    spo2History.length = 0;
    pressureHistory.length = 0;
    respirationHistory.length = 0;
  };

  // Add measurements
  const addGlucose = (value: number) => {
    if (value > 0) {
      glucoseHistory.push(value);
      if (glucoseHistory.length > maxHistoryLength) {
        glucoseHistory.shift();
      }
    }
  };

  const addSpO2 = (value: number) => {
    if (value > 0) {
      spo2History.push(value);
      if (spo2History.length > maxHistoryLength) {
        spo2History.shift();
      }
    }
  };

  const addBloodPressure = (value: string) => {
    if (value && value !== "--/--") {
      pressureHistory.push(value);
      if (pressureHistory.length > maxHistoryLength) {
        pressureHistory.shift();
      }
    }
  };

  const addRespirationRate = (value: number) => {
    if (value > 0) {
      respirationHistory.push(value);
      if (respirationHistory.length > maxHistoryLength) {
        respirationHistory.shift();
      }
    }
  };

  const getAverageGlucose = (): number => {
    if (glucoseHistory.length === 0) return 0;
    let total = 0;
    let weightSum = 0;
    
    for (let i = 0; i < glucoseHistory.length; i++) {
      const weight = 1 + (i * 0.5);
      total += glucoseHistory[i] * weight;
      weightSum += weight;
    }
    
    return Math.round(total / weightSum);
  };

  const getGlucoseTrend = (): 'stable' | 'rising' | 'falling' | 'rising_rapidly' | 'falling_rapidly' | 'unknown' => {
    if (glucoseHistory.length < 3) return 'unknown';
    
    const recent = glucoseHistory.slice(-3);
    let sumChange = 0;
    for (let i = 1; i < recent.length; i++) {
      sumChange += recent[i] - recent[i-1];
    }
    const avgChange = sumChange / (recent.length - 1);
    
    if (avgChange > 3) return 'rising_rapidly';
    if (avgChange > 1) return 'rising';
    if (avgChange < -3) return 'falling_rapidly';
    if (avgChange < -1) return 'falling';
    return 'stable';
  };

  return {
    reset,
    addGlucose,
    addSpO2,
    addBloodPressure,
    addRespirationRate,
    getAverageGlucose,
    getGlucoseTrend
  };
}
