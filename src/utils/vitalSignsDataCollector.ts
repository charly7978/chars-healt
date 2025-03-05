
/**
 * Utility for collecting and calculating final vital signs values
 */
export const createVitalSignsDataCollector = () => {
  const heartRateValues: number[] = [];
  const spo2Values: number[] = [];
  const systolicValues: number[] = [];
  const diastolicValues: number[] = [];
  let hasValidValues = false;
  
  /**
   * Reset all collected data
   */
  const reset = () => {
    heartRateValues.length = 0;
    spo2Values.length = 0;
    systolicValues.length = 0;
    diastolicValues.length = 0;
    hasValidValues = false;
  };
  
  /**
   * Add heart rate value to collection
   */
  const addHeartRate = (bpm: number) => {
    if (bpm > 0) {
      heartRateValues.push(bpm);
    }
  };
  
  /**
   * Add SpO2 value to collection
   */
  const addSpO2 = (spo2: number) => {
    if (spo2 > 0) {
      spo2Values.push(spo2);
    }
  };
  
  /**
   * Add blood pressure value to collection
   */
  const addBloodPressure = (pressure: string) => {
    if (pressure === "--/--" || pressure === "0/0") return;
    
    const [systolic, diastolic] = pressure.split('/').map(Number);
    if (systolic > 0 && diastolic > 0) {
      systolicValues.push(systolic);
      diastolicValues.push(diastolic);
    }
  };
  
  /**
   * Calculate final values based on collected data
   */
  const calculateFinalValues = (currentHeartRate: number, currentSpO2: number, currentPressure: string) => {
    try {
      console.log("Calculando PROMEDIOS REALES con todos los valores capturados...");
      
      const validHeartRates = heartRateValues.filter(v => v > 0);
      const validSpo2Values = spo2Values.filter(v => v > 0);
      const validSystolicValues = systolicValues.filter(v => v > 0);
      const validDiastolicValues = diastolicValues.filter(v => v > 0);
      
      console.log("Valores acumulados para promedios:", {
        heartRateValues: validHeartRates.length,
        spo2Values: validSpo2Values.length,
        systolicValues: validSystolicValues.length,
        diastolicValues: validDiastolicValues.length
      });
      
      let avgHeartRate = 0;
      let avgSpo2 = 0;
      let avgSystolic = 0;
      let avgDiastolic = 0;
      
      if (validHeartRates.length > 0) {
        avgHeartRate = Math.round(validHeartRates.reduce((a, b) => a + b, 0) / validHeartRates.length);
      } else {
        avgHeartRate = currentHeartRate;
      }
      
      if (validSpo2Values.length > 0) {
        avgSpo2 = Math.round(validSpo2Values.reduce((a, b) => a + b, 0) / validSpo2Values.length);
      } else {
        avgSpo2 = currentSpO2;
      }
      
      let finalBPString = currentPressure;
      if (validSystolicValues.length > 0 && validDiastolicValues.length > 0) {
        avgSystolic = Math.round(validSystolicValues.reduce((a, b) => a + b, 0) / validSystolicValues.length);
        avgDiastolic = Math.round(validDiastolicValues.reduce((a, b) => a + b, 0) / validDiastolicValues.length);
        finalBPString = `${avgSystolic}/${avgDiastolic}`;
      }
      
      console.log("PROMEDIOS REALES calculados:", {
        heartRate: avgHeartRate,
        spo2: avgSpo2,
        pressure: finalBPString
      });
      
      hasValidValues = true;
      
      return {
        heartRate: avgHeartRate > 0 ? avgHeartRate : currentHeartRate,
        spo2: avgSpo2 > 0 ? avgSpo2 : currentSpO2,
        pressure: finalBPString
      };
    } catch (error) {
      console.error("Error en calculateFinalValues:", error);
      hasValidValues = true;
      
      return {
        heartRate: currentHeartRate,
        spo2: currentSpO2,
        pressure: currentPressure
      };
    }
  };
  
  /**
   * Get current data collection status
   */
  const getStats = () => {
    return {
      heartRateCount: heartRateValues.length,
      spo2Count: spo2Values.length,
      bpCount: systolicValues.length,
      hasValidValues
    };
  };
  
  return {
    addHeartRate,
    addSpO2,
    addBloodPressure,
    calculateFinalValues,
    reset,
    getStats
  };
};

export type VitalSignsDataCollector = ReturnType<typeof createVitalSignsDataCollector>;
