
/**
 * Utility for collecting vital signs data for final processing
 */
export const createVitalSignsDataCollector = () => {
  // Buffers for calculating final values
  const allHeartRateValues: number[] = [];
  const allSpo2Values: number[] = [];
  const allSystolicValues: number[] = [];
  const allDiastolicValues: number[] = [];
  
  /**
   * Add a heart rate value to the collection
   */
  const addHeartRate = (value: number) => {
    if (value > 0) {
      allHeartRateValues.push(value);
    }
  };
  
  /**
   * Add an SpO2 value to the collection
   */
  const addSpO2 = (value: number) => {
    if (value > 0 && value <= 100) {
      allSpo2Values.push(value);
    }
  };
  
  /**
   * Add a blood pressure reading to the collection
   */
  const addBloodPressure = (bp: string) => {
    if (bp === "--/--" || bp === "0/0") return;
    
    const [systolic, diastolic] = bp.split('/').map(Number);
    if (systolic > 0 && diastolic > 0) {
      allSystolicValues.push(systolic);
      allDiastolicValues.push(diastolic);
    }
  };
  
  /**
   * Calculate final average values
   */
  const calculateFinalValues = () => {
    // Filter invalid values
    const validHeartRates = allHeartRateValues.filter(v => v > 0);
    const validSpo2Values = allSpo2Values.filter(v => v > 0);
    const validSystolicValues = allSystolicValues.filter(v => v > 0);
    const validDiastolicValues = allDiastolicValues.filter(v => v > 0);
    
    let avgHeartRate = 0;
    let avgSpo2 = 0;
    let avgSystolic = 0;
    let avgDiastolic = 0;
    
    // Calculate heart rate average
    if (validHeartRates.length > 0) {
      avgHeartRate = Math.round(validHeartRates.reduce((a, b) => a + b, 0) / validHeartRates.length);
    }
    
    // Calculate SpO2 average
    if (validSpo2Values.length > 0) {
      avgSpo2 = Math.round(validSpo2Values.reduce((a, b) => a + b, 0) / validSpo2Values.length);
    }
    
    // Calculate blood pressure averages
    if (validSystolicValues.length > 0 && validDiastolicValues.length > 0) {
      avgSystolic = Math.round(validSystolicValues.reduce((a, b) => a + b, 0) / validSystolicValues.length);
      avgDiastolic = Math.round(validDiastolicValues.reduce((a, b) => a + b, 0) / validDiastolicValues.length);
    }
    
    console.log("VitalSignsDataCollector - Final values calculated:", {
      heartRate: avgHeartRate,
      spo2: avgSpo2,
      pressure: `${avgSystolic}/${avgDiastolic}`,
      samples: {
        heartRate: validHeartRates.length,
        spo2: validSpo2Values.length,
        systolic: validSystolicValues.length,
        diastolic: validDiastolicValues.length
      }
    });
    
    return {
      heartRate: avgHeartRate,
      spo2: avgSpo2 > 0 ? avgSpo2 : 97,
      pressure: (avgSystolic > 0 && avgDiastolic > 0) ? 
        `${avgSystolic}/${avgDiastolic}` : 
        "120/80"
    };
  };
  
  /**
   * Reset all collected data
   */
  const reset = () => {
    allHeartRateValues.length = 0;
    allSpo2Values.length = 0;
    allSystolicValues.length = 0;
    allDiastolicValues.length = 0;
  };
  
  return {
    addHeartRate,
    addSpO2,
    addBloodPressure,
    calculateFinalValues,
    reset,
    get collectedData() {
      return {
        heartRateCount: allHeartRateValues.length,
        spo2Count: allSpo2Values.length,
        bpCount: allSystolicValues.length
      };
    }
  };
};
