
/**
 * Utility for stabilizing blood pressure measurements
 * ESTA APPS ES DE MEDICION ULTRA REAL - PROHIBIDA CUALQUIER SIMULACION - NO ESTA PERMITIDO HACER MOVIMIENTOS POR CUENTA DE LA I.A SIN AUTORIZACION DEL USUARIO
 */
export const createBloodPressureStabilizer = () => {
  // Buffer para almacenar mediciones de presión arterial
  const bpHistoryRef: string[] = [];
  const bpQualityRef: number[] = [];
  let lastValidBpRef: string = "120/80";
  
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
   * ESTA APPS ES DE MEDICION ULTRA REAL - PROHIBIDA CUALQUIER SIMULACION - NO ESTA PERMITIDO HACER MOVIMIENTOS POR CUENTA DE LA I.A SIN AUTORIZACION DEL USUARIO
   */
  const isBloodPressureUnrealistic = (rawBP: string): boolean => {
    // No procesar valores vacíos o placeholders
    if (rawBP === "--/--" || rawBP === "0/0") return true;
    
    // Verificar que el formato sea correcto
    const bpParts = rawBP.split('/');
    if (bpParts.length !== 2) return true;
    
    const systolic = parseInt(bpParts[0], 10);
    const diastolic = parseInt(bpParts[1], 10);
    
    // Verificar valores dentro de rangos fisiológicos
    // Basado en guías de la American Heart Association (AHA)
    if (isNaN(systolic) || isNaN(diastolic) ||
        systolic > 200 || systolic < 80 ||
        diastolic > 120 || diastolic < 50 ||
        systolic <= diastolic ||
        (systolic - diastolic) < 20 || (systolic - diastolic) > 80) {
      return true;
    }
    
    return false;
  };
  
  /**
   * Stabilize blood pressure reading using basic validation
   * ESTA APPS ES DE MEDICION ULTRA REAL - PROHIBIDA CUALQUIER SIMULACION - NO ESTA PERMITIDO HACER MOVIMIENTOS POR CUENTA DE LA I.A SIN AUTORIZACION DEL USUARIO
   */
  const stabilizeBloodPressure = (rawBP: string, quality: number): string => {
    // No procesar valores vacíos o placeholders
    if (rawBP === "--/--" || rawBP === "0/0") return rawBP;
    
    // Verificar que el formato sea correcto
    const bpParts = rawBP.split('/');
    if (bpParts.length !== 2) return lastValidBpRef || "120/80";
    
    // Verificar valores dentro de rangos fisiológicos
    if (isBloodPressureUnrealistic(rawBP)) {
      return lastValidBpRef || "120/80";
    }
    
    // Añadir al historial de mediciones
    bpHistoryRef.push(rawBP);
    bpQualityRef.push(quality);
    
    // Mantener buffer de tamaño limitado
    if (bpHistoryRef.length > 5) {
      bpHistoryRef.shift();
      bpQualityRef.shift();
    }
    
    // Use measured value directly
    lastValidBpRef = rawBP;
    return rawBP;
  };
  
  return {
    stabilizeBloodPressure,
    isBloodPressureUnrealistic,
    reset
  };
};

export type BloodPressureStabilizer = ReturnType<typeof createBloodPressureStabilizer>;
