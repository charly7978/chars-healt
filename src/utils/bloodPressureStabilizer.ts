
/**
 * Blood pressure stabilizer - minimally stabilizes BP readings
 */
export const createBloodPressureStabilizer = () => {
  // Ventana de estabilización muy pequeña (solo 2 valores) para ver más cambios
  const MAX_HISTORY_SIZE = 2;
  
  // Valores anteriores
  const systolicHistory: number[] = [];
  const diastolicHistory: number[] = [];
  
  // Valores de cambio máximos permitidos por lectura
  const MAX_SYSTOLIC_VARIATION = 30; // Permitir más variación para ver valores reales
  const MAX_DIASTOLIC_VARIATION = 15; // Permitir más variación para ver valores reales
  
  // Estado de medición
  let lastValidSystolic = 0;
  let lastValidDiastolic = 0;
  let unrealisticReadingsCounter = 0;
  const MAX_UNREALISTIC_READINGS = 3;
  
  /**
   * Estabilizar una lectura de presión arterial
   * @param bpString La lectura actual en formato "sistólica/diastólica"
   * @param signalQuality Calidad de la señal (0-100)
   * @returns La lectura estabilizada
   */
  const stabilizeBloodPressure = (bpString: string, signalQuality: number): string => {
    console.log(`bloodPressureStabilizer: Estabilizando "${bpString}", signalQuality=${signalQuality}`);
    
    // Permitir valores marcadores
    if (bpString === "--/--" || bpString === "0/0" || bpString === "EVALUANDO") {
      return bpString;
    }
    
    const parts = bpString.split('/');
    if (parts.length !== 2) {
      console.log(`bloodPressureStabilizer: Formato inválido "${bpString}"`);
      return "--/--";
    }
    
    const systolic = parseInt(parts[0], 10);
    const diastolic = parseInt(parts[1], 10);
    
    // Verificar si los valores son médicamente posibles
    if (isNaN(systolic) || isNaN(diastolic) || 
        systolic <= diastolic || 
        systolic < 30 || systolic > 300 || 
        diastolic < 15 || diastolic > 200) {
      console.log(`bloodPressureStabilizer: Valores médicamente imposibles "${bpString}"`);
      
      // Incrementar contador de lecturas irreales
      unrealisticReadingsCounter++;
      
      // Si tenemos demasiadas lecturas irreales consecutivas, empezar desde cero
      if (unrealisticReadingsCounter >= MAX_UNREALISTIC_READINGS) {
        console.log("bloodPressureStabilizer: Demasiadas lecturas irreales consecutivas, reseteo");
        systolicHistory.length = 0;
        diastolicHistory.length = 0;
        lastValidSystolic = 0;
        lastValidDiastolic = 0;
        unrealisticReadingsCounter = 0;
        return "--/--";
      }
      
      // Usar valor estabilizado anterior si disponible
      if (lastValidSystolic > 0 && lastValidDiastolic > 0) {
        return `${lastValidSystolic}/${lastValidDiastolic}`;
      }
      
      return "--/--";
    }
    
    // Reiniciar contador de lecturas irreales
    unrealisticReadingsCounter = 0;
    
    // Primera lectura válida
    if (lastValidSystolic === 0 || lastValidDiastolic === 0) {
      lastValidSystolic = systolic;
      lastValidDiastolic = diastolic;
      systolicHistory.push(systolic);
      diastolicHistory.push(diastolic);
      
      console.log(`bloodPressureStabilizer: Primera lectura válida "${bpString}"`);
      return bpString;
    }
    
    // Verificar si la variación es médicamente posible en un intervalo de tiempo corto
    const systolicVariation = Math.abs(systolic - lastValidSystolic);
    const diastolicVariation = Math.abs(diastolic - lastValidDiastolic);
    
    let stabilizedSystolic = systolic;
    let stabilizedDiastolic = diastolic;
    
    // Para señales de alta calidad, permitir más variación
    const qualityFactor = Math.max(0.2, Math.min(1.0, signalQuality / 100));
    const allowedSystolicVariation = MAX_SYSTOLIC_VARIATION * qualityFactor;
    const allowedDiastolicVariation = MAX_DIASTOLIC_VARIATION * qualityFactor;
    
    // Aplicar limitación de cambio por lectura
    if (systolicVariation > allowedSystolicVariation) {
      console.log(`bloodPressureStabilizer: Variación sistólica ${systolicVariation} > ${allowedSystolicVariation}`);
      stabilizedSystolic = lastValidSystolic + (systolic > lastValidSystolic ? allowedSystolicVariation : -allowedSystolicVariation);
    }
    
    if (diastolicVariation > allowedDiastolicVariation) {
      console.log(`bloodPressureStabilizer: Variación diastólica ${diastolicVariation} > ${allowedDiastolicVariation}`);
      stabilizedDiastolic = lastValidDiastolic + (diastolic > lastValidDiastolic ? allowedDiastolicVariation : -allowedDiastolicVariation);
    }
    
    // Actualizar historial
    systolicHistory.push(stabilizedSystolic);
    diastolicHistory.push(stabilizedDiastolic);
    
    if (systolicHistory.length > MAX_HISTORY_SIZE) {
      systolicHistory.shift();
    }
    
    if (diastolicHistory.length > MAX_HISTORY_SIZE) {
      diastolicHistory.shift();
    }
    
    // Calcular promedio ponderado con más peso a los valores recientes
    let systolicSum = 0;
    let diastolicSum = 0;
    let weightSum = 0;
    
    for (let i = 0; i < systolicHistory.length; i++) {
      const weight = 1 + i; // Más peso a valores más recientes
      systolicSum += systolicHistory[i] * weight;
      diastolicSum += diastolicHistory[i] * weight;
      weightSum += weight;
    }
    
    // Calcular promedio ponderado final
    const finalSystolic = Math.round(systolicSum / weightSum);
    const finalDiastolic = Math.round(diastolicSum / weightSum);
    
    // Mantener consistencia sistólica > diastólica
    if (finalSystolic <= finalDiastolic) {
      const fixedSystolic = finalDiastolic + 10;
      console.log(`bloodPressureStabilizer: Corrigiendo relación sistólica/diastólica ${finalSystolic}/${finalDiastolic} -> ${fixedSystolic}/${finalDiastolic}`);
      lastValidSystolic = fixedSystolic;
      lastValidDiastolic = finalDiastolic;
      return `${fixedSystolic}/${finalDiastolic}`;
    }
    
    lastValidSystolic = finalSystolic;
    lastValidDiastolic = finalDiastolic;
    
    console.log(`bloodPressureStabilizer: Presión estabilizada "${finalSystolic}/${finalDiastolic}"`);
    return `${finalSystolic}/${finalDiastolic}`;
  };
  
  /**
   * Resetear historial y estado
   */
  const reset = () => {
    systolicHistory.length = 0;
    diastolicHistory.length = 0;
    lastValidSystolic = 0;
    lastValidDiastolic = 0;
    unrealisticReadingsCounter = 0;
    console.log("bloodPressureStabilizer: Reset completo");
  };
  
  return {
    stabilizeBloodPressure,
    reset
  };
};

export type BloodPressureStabilizer = ReturnType<typeof createBloodPressureStabilizer>;
