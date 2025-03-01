
/**
 * Utility for blood pressure processing without any simulation or filtering
 */
export const createBloodPressureStabilizer = () => {
  // Tracking de valores sin buffer para mostrar datos inmediatos
  let lastValidBpRef: string = "";
  
  /**
   * Reset stabilizer state
   */
  const reset = () => {
    lastValidBpRef = "";
  };
  
  /**
   * Check if blood pressure is physiologically impossible
   * Solo filtra valores médicamente imposibles
   */
  const isBloodPressureUnrealistic = (rawBP: string): boolean => {
    // No procesar valores vacíos
    if (rawBP === "--/--" || rawBP === "0/0") return true;
    
    // Verificar formato
    const bpParts = rawBP.split('/');
    if (bpParts.length !== 2) return true;
    
    const systolic = parseInt(bpParts[0], 10);
    const diastolic = parseInt(bpParts[1], 10);
    
    // Solo filtrar valores extremos que son médicamente imposibles
    // Rangos muy amplios para permitir cualquier lectura real
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
   * Muestra exactamente lo que se midió sin ninguna intervención
   */
  const stabilizeBloodPressure = (rawBP: string, quality: number): string => {
    // No procesar valores vacíos
    if (rawBP === "--/--" || rawBP === "0/0") return rawBP;
    
    // Verificar formato
    const bpParts = rawBP.split('/');
    if (bpParts.length !== 2) return lastValidBpRef || "--/--";
    
    const systolic = parseInt(bpParts[0], 10);
    const diastolic = parseInt(bpParts[1], 10);
    
    // Filtrar solo valores imposibles
    if (isBloodPressureUnrealistic(rawBP)) {
      return lastValidBpRef || "--/--";
    }
    
    // Medición directa sin simulación
    const directBP = `${systolic}/${diastolic}`;
    console.log(`BP Stabilizer: Medición directa: ${directBP}, calidad: ${quality}`);
    
    // Actualizar último valor válido
    lastValidBpRef = directBP;
    
    // Retornar el valor medido real directamente
    return directBP;
  };
  
  return {
    stabilizeBloodPressure,
    isBloodPressureUnrealistic,
    reset
  };
};

export type BloodPressureStabilizer = ReturnType<typeof createBloodPressureStabilizer>;
