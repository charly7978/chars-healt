
/**
 * Utility for blood pressure processing without any fixed values
 */
export const createBloodPressureStabilizer = () => {
  // Buffer para estabilizar la medición de presión arterial
  const bpHistoryRef: string[] = [];
  const bpQualityRef: number[] = [];
  let lastValidBpRef: string = "";
  
  // Constantes - Reducidas para permitir más variación natural
  const BP_BUFFER_SIZE = 2; // Reducido drásticamente para mostrar cambios en tiempo real
  const SMOOTHING_FACTOR = 0.05; // Casi sin suavizado para mostrar lecturas directas
  
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
   * Sólo filtra valores médicamente imposibles, muestra todo lo demás
   */
  const isBloodPressureUnrealistic = (rawBP: string): boolean => {
    // No procesar valores vacíos o placeholders
    if (rawBP === "--/--" || rawBP === "0/0") return true;
    
    // Verificar que el formato sea correcto
    const bpParts = rawBP.split('/');
    if (bpParts.length !== 2) return true;
    
    const systolic = parseInt(bpParts[0], 10);
    const diastolic = parseInt(bpParts[1], 10);
    
    // Sólo filtrar valores fisiológicamente imposibles
    // Rangos extremadamente amplios para permitir cualquier lectura real
    if (isNaN(systolic) || isNaN(diastolic) ||
        systolic > 300 || systolic < 30 ||
        diastolic > 250 || diastolic < 15 ||
        systolic <= diastolic) {
      return true;
    }
    
    return false;
  };
  
  /**
   * Process blood pressure with minimal interference - muestra directamente los valores
   */
  const stabilizeBloodPressure = (rawBP: string, quality: number): string => {
    // No procesar valores vacíos o placeholders
    if (rawBP === "--/--" || rawBP === "0/0") return rawBP;
    
    // Verificar que el formato sea correcto
    const bpParts = rawBP.split('/');
    if (bpParts.length !== 2) return lastValidBpRef || "--/--";
    
    const systolic = parseInt(bpParts[0], 10);
    const diastolic = parseInt(bpParts[1], 10);
    
    // Mostrar directamente los valores si son medicamente posibles
    if (isBloodPressureUnrealistic(rawBP)) {
      return lastValidBpRef || "--/--";
    }
    
    // Mostrar la lectura actual directamente para valores válidos
    const directBP = `${systolic}/${diastolic}`;
    
    // Añadir al historial con mínimo filtrado
    bpHistoryRef.push(directBP);
    bpQualityRef.push(quality);
    
    // Mantener buffer pequeño para respuesta rápida
    if (bpHistoryRef.length > BP_BUFFER_SIZE) {
      bpHistoryRef.shift();
      bpQualityRef.shift();
    }
    
    // Actualizar último valor válido
    lastValidBpRef = directBP;
    
    // Devolver directamente la lectura
    return directBP;
  };
  
  return {
    stabilizeBloodPressure,
    isBloodPressureUnrealistic,
    reset
  };
};

export type BloodPressureStabilizer = ReturnType<typeof createBloodPressureStabilizer>;
