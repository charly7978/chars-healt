
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
    // Rangos más amplios para permitir cualquier lectura real
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
    // Pasar directamente valores no vacíos sin procesar
    if (rawBP !== "--/--" && rawBP !== "0/0" && rawBP !== "EVALUANDO") {
      // Verificar formato y valores médicamente válidos únicamente
      const bpParts = rawBP.split('/');
      if (bpParts.length === 2) {
        const systolic = parseInt(bpParts[0], 10);
        const diastolic = parseInt(bpParts[1], 10);
        
        // Solo filtramos valores médicamente imposibles
        if (!isNaN(systolic) && !isNaN(diastolic) &&
            systolic > 30 && systolic < 300 &&
            diastolic > 15 && diastolic < 250 &&
            systolic > diastolic) {
          
          // Guardamos como último valor válido
          lastValidBpRef = `${systolic}/${diastolic}`;
          console.log(`BP Stabilizer: Valor directo aceptado: ${lastValidBpRef}`);
          return lastValidBpRef;
        }
      }
    }
    
    // Si no hay un valor nuevo válido y tenemos uno anterior, usamos el anterior
    if (lastValidBpRef && lastValidBpRef !== "") {
      console.log(`BP Stabilizer: Usando último valor válido: ${lastValidBpRef}`);
      return lastValidBpRef;
    }
    
    // Si no hay valores válidos, mostramos marcador
    return rawBP;
  };
  
  return {
    stabilizeBloodPressure,
    isBloodPressureUnrealistic,
    reset
  };
};

export type BloodPressureStabilizer = ReturnType<typeof createBloodPressureStabilizer>;
