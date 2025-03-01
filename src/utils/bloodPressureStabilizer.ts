
/**
 * Utility for minimal blood pressure stabilization
 */
export const createBloodPressureStabilizer = () => {
  // Buffer para estabilizar la medición de presión arterial
  const bpHistoryRef: string[] = [];
  const bpQualityRef: number[] = [];
  let lastValidBpRef: string = "120/80";
  
  // Constantes
  const BP_BUFFER_SIZE = 4; // Reduced buffer size for faster updates
  const SMOOTHING_FACTOR = 0.15; // Reduced for more direct readings
  
  /**
   * Reset stabilizer state
   */
  const reset = () => {
    bpHistoryRef.length = 0;
    bpQualityRef.length = 0;
    lastValidBpRef = "120/80";
  };
  
  /**
   * Check if blood pressure is unrealistic
   */
  const isBloodPressureUnrealistic = (rawBP: string): boolean => {
    // No procesar valores vacíos o placeholders
    if (rawBP === "--/--" || rawBP === "0/0") return true;
    
    // Verificar que el formato sea correcto
    const bpParts = rawBP.split('/');
    if (bpParts.length !== 2) return true;
    
    const systolic = parseInt(bpParts[0], 10);
    const diastolic = parseInt(bpParts[1], 10);
    
    // Only filter extreme physiological limits
    if (isNaN(systolic) || isNaN(diastolic) ||
        systolic > 300 || systolic < 40 ||
        diastolic > 220 || diastolic < 20 ||
        systolic <= diastolic) {
      return true;
    }
    
    return false;
  };
  
  /**
   * Stabilize blood pressure reading with minimal interference
   */
  const stabilizeBloodPressure = (rawBP: string, quality: number): string => {
    // No procesar valores vacíos o placeholders
    if (rawBP === "--/--" || rawBP === "0/0") return rawBP;
    
    // Verificar que el formato sea correcto
    const bpParts = rawBP.split('/');
    if (bpParts.length !== 2) return lastValidBpRef || "120/80";
    
    const systolic = parseInt(bpParts[0], 10);
    const diastolic = parseInt(bpParts[1], 10);
    
    // Filtrar solo valores médicamente imposibles
    if (isBloodPressureUnrealistic(rawBP)) {
      return lastValidBpRef || "120/80";
    }
    
    // Añadir al historial de mediciones
    bpHistoryRef.push(rawBP);
    bpQualityRef.push(quality);
    
    // Mantener buffer de tamaño limitado
    if (bpHistoryRef.length > BP_BUFFER_SIZE) {
      bpHistoryRef.shift();
      bpQualityRef.shift();
    }
    
    // Si no tenemos suficientes mediciones, usar la actual si es válida
    if (bpHistoryRef.length < 2) {
      lastValidBpRef = rawBP;
      return rawBP;
    }
    
    // Apply minimal smoothing for stability without distorting measurements
    const lastBpParts = lastValidBpRef.split('/').map(Number);
    const lastSystolic = lastBpParts[0] || 120;
    const lastDiastolic = lastBpParts[1] || 80;
    
    // Apply minimal smoothing to allow natural fluctuations
    const smoothedSystolic = Math.round(
      lastSystolic * SMOOTHING_FACTOR + systolic * (1 - SMOOTHING_FACTOR)
    );
    
    const smoothedDiastolic = Math.round(
      lastDiastolic * SMOOTHING_FACTOR + diastolic * (1 - SMOOTHING_FACTOR)
    );
    
    // Ensure systolic > diastolic by at least 20 mmHg
    const minGap = 20;
    const adjustedDiastolic = Math.min(smoothedDiastolic, smoothedSystolic - minGap);
    
    // Create minimally stabilized BP
    const stabilizedBP = `${smoothedSystolic}/${adjustedDiastolic}`;
    lastValidBpRef = stabilizedBP;
    
    return stabilizedBP;
  };
  
  return {
    stabilizeBloodPressure,
    isBloodPressureUnrealistic,
    reset
  };
};

export type BloodPressureStabilizer = ReturnType<typeof createBloodPressureStabilizer>;
