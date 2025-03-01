/**
 * Utility for blood pressure processing without any simulation
 */
export const createBloodPressureStabilizer = () => {
  // Minimal tracking for signal quality
  const bpHistoryRef: string[] = [];
  const bpQualityRef: number[] = [];
  let lastValidBpRef: string = "";
  
  // Minimal constants for basic filtering of impossible values
  const BP_BUFFER_SIZE = 1; // Absolute minimum to show direct readings
  
  /**
   * Reset stabilizer state
   */
  const reset = () => {
    bpHistoryRef.length = 0;
    bpQualityRef.length = 0;
    lastValidBpRef = "";
  };
  
  /**
   * Check if blood pressure is physiologically impossible
   * Only filters medically impossible values
   */
  const isBloodPressureUnrealistic = (rawBP: string): boolean => {
    // Don't process empty or placeholder values
    if (rawBP === "--/--" || rawBP === "0/0") return true;
    
    // Check format
    const bpParts = rawBP.split('/');
    if (bpParts.length !== 2) return true;
    
    const systolic = parseInt(bpParts[0], 10);
    const diastolic = parseInt(bpParts[1], 10);
    
    // Only filter extreme values that are medically impossible
    // Very wide ranges to allow any real reading
    if (isNaN(systolic) || isNaN(diastolic) ||
        systolic > 300 || systolic < 30 ||
        diastolic > 250 || diastolic < 15 ||
        systolic <= diastolic) {
      return true;
    }
    
    return false;
  };
  
  /**
   * Process blood pressure with direct pass-through
   * Shows exactly what was measured with minimal intervention
   */
  const stabilizeBloodPressure = (rawBP: string, quality: number): string => {
    // Don't process empty values
    if (rawBP === "--/--" || rawBP === "0/0") return rawBP;
    
    // Check format
    const bpParts = rawBP.split('/');
    if (bpParts.length !== 2) return lastValidBpRef || "--/--";
    
    const systolic = parseInt(bpParts[0], 10);
    const diastolic = parseInt(bpParts[1], 10);
    
    // Filter only impossible values
    if (isBloodPressureUnrealistic(rawBP)) {
      return lastValidBpRef || "--/--";
    }
    
    // Direct measurement with no simulation
    const directBP = `${systolic}/${diastolic}`;
    console.log(`BP Stabilizer: Passing through real measurement: ${directBP}`);
    
    // Keep track of last valid values
    bpHistoryRef.push(directBP);
    bpQualityRef.push(quality);
    
    // Minimal buffer to show real-time changes
    if (bpHistoryRef.length > BP_BUFFER_SIZE) {
      bpHistoryRef.shift();
      bpQualityRef.shift();
    }
    
    // Update last valid value
    lastValidBpRef = directBP;
    
    // Return the actual measured value directly
    return directBP;
  };
  
  return {
    stabilizeBloodPressure,
    isBloodPressureUnrealistic,
    reset
  };
};

export type BloodPressureStabilizer = ReturnType<typeof createBloodPressureStabilizer>;
