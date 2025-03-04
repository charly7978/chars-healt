/**
 * Creates a collector for vital signs data
 * ESTA APPS ES DE MEDICION ULTRA REAL - PROHIBIDA CUALQUIER SIMULACION - NO ESTA PERMITIDO HACER MOVIMIENTOS POR CUENTA DE LA I.A SIN AUTORIZACION DEL USUARIO
 */
export const createVitalSignsDataCollector = () => {
  const spo2Values: number[] = [];
  const bpValues: string[] = [];
  const respirationRates: number[] = [];
  const respirationDepths: number[] = [];
  const glucoseValues: number[] = [];
  const glucoseTimestamps: number[] = [];
  const hemoglobinValues: number[] = [];
  
  return {
    /**
     * Add SpO2 value to collection
     */
    addSpO2: (value: number) => {
      if (value >= 80 && value <= 100) {
        spo2Values.push(value);
        if (spo2Values.length > 30) {
          spo2Values.shift();
        }
      }
    },
    
    /**
     * Add blood pressure reading to collection
     */
    addBloodPressure: (value: string) => {
      if (value !== '--/--' && value !== '0/0') {
        bpValues.push(value);
        if (bpValues.length > 10) {
          bpValues.shift();
        }
      }
    },
    
    /**
     * Add respiration rate reading to collection
     */
    addRespirationRate: (value: number) => {
      if (value >= 4 && value <= 60) {
        respirationRates.push(value);
        if (respirationRates.length > 10) {
          respirationRates.shift();
        }
      }
    },
    
    /**
     * Add respiration depth reading to collection
     */
    addRespirationDepth: (value: number) => {
      if (value >= 0 && value <= 100) {
        respirationDepths.push(value);
        if (respirationDepths.length > 10) {
          respirationDepths.shift();
        }
      }
    },
    
    /**
     * Add hemoglobin value to collection
     * ESTA APPS ES DE MEDICION ULTRA REAL - PROHIBIDA CUALQUIER SIMULACION - NO ESTA PERMITIDO HACER MOVIMIENTOS POR CUENTA DE LA I.A SIN AUTORIZACION DEL USUARIO
     */
    addHemoglobin: (value: number) => {
      if (value >= 8 && value <= 20) {
        hemoglobinValues.push(value);
        if (hemoglobinValues.length > 10) {
          hemoglobinValues.shift();
        }
      }
    },
    
    /**
     * Add glucose value to collection with timestamp
     */
    addGlucose: (value: number) => {
      const now = Date.now();
      
      // Only basic validation for physiological range
      if (value >= 40 && value <= 400) {
        // Store all valid measurements
        glucoseValues.push(value);
        glucoseTimestamps.push(now);
        
        // Keep buffer size limited
        if (glucoseValues.length > 10) {
          glucoseValues.shift();
          glucoseTimestamps.shift();
        }
        
        console.log(`Glucose value added: ${value} mg/dL (raw measurement)`);
      } else {
        console.log(`Glucose reading out of range: ${value} mg/dL`);
      }
    },
    
    /**
     * Get average SpO2 from collected values
     */
    getAverageSpO2: (): number => {
      if (spo2Values.length === 0) return 0;
      const sum = spo2Values.reduce((acc, val) => acc + val, 0);
      return Math.round(sum / spo2Values.length);
    },
    
    /**
     * Get average blood pressure from collected values
     */
    getAverageBloodPressure: (): string => {
      if (bpValues.length === 0) return '--/--';
      
      // Extraer systolic/diastolic
      const systolicValues: number[] = [];
      const diastolicValues: number[] = [];
      
      bpValues.forEach(bp => {
        const [sys, dia] = bp.split('/').map(Number);
        if (!isNaN(sys) && !isNaN(dia)) {
          systolicValues.push(sys);
          diastolicValues.push(dia);
        }
      });
      
      if (systolicValues.length === 0 || diastolicValues.length === 0) {
        return '--/--';
      }
      
      const avgSystolic = Math.round(systolicValues.reduce((acc, val) => acc + val, 0) / systolicValues.length);
      const avgDiastolic = Math.round(diastolicValues.reduce((acc, val) => acc + val, 0) / diastolicValues.length);
      
      return `${avgSystolic}/${avgDiastolic}`;
    },
    
    /**
     * Get average respiration rate from collected values
     * ESTA APPS ES DE MEDICION ULTRA REAL - PROHIBIDA CUALQUIER SIMULACION - NO ESTA PERMITIDO HACER MOVIMIENTOS POR CUENTA DE LA I.A SIN AUTORIZACION DEL USUARIO
     */
    getAverageRespirationRate: (): number => {
      if (respirationRates.length === 0) return 0;
      
      // Use the last measured value directly
      return respirationRates[respirationRates.length - 1];
    },
    
    /**
     * Get average respiration depth from collected values (0-100)
     */
    getAverageRespirationDepth: (): number => {
      if (respirationDepths.length === 0) return 0;
      
      // Use the last measured value directly
      return respirationDepths[respirationDepths.length - 1];
    },
    
    /**
     * Get average hemoglobin from collected values
     */
    getAverageHemoglobin: (): number => {
      if (hemoglobinValues.length === 0) return 0;
      
      // Use the last measured value directly
      return hemoglobinValues[hemoglobinValues.length - 1];
    },
    
    /**
     * Get average glucose from collected values
     * ESTA APPS ES DE MEDICION ULTRA REAL - PROHIBIDA CUALQUIER SIMULACION - NO ESTA PERMITIDO HACER MOVIMIENTOS POR CUENTA DE LA I.A SIN AUTORIZACION DEL USUARIO
     */
    getAverageGlucose: (): number => {
      if (glucoseValues.length === 0) return 0;
      
      // Use the most recent measured value
      return glucoseValues[glucoseValues.length - 1];
    },
    
    /**
     * Get glucose trend based on recent values
     */
    getGlucoseTrend: (): 'stable' | 'rising' | 'falling' | 'rising_rapidly' | 'falling_rapidly' | 'unknown' => {
      // Need at least 3 readings for a trend
      if (glucoseValues.length < 3) return 'unknown';
      
      // Calculate simple trend from last 3 measurements
      const last = glucoseValues[glucoseValues.length - 1];
      const prev = glucoseValues[glucoseValues.length - 2];
      const diff = last - prev;
      
      // Simple trend calculation based on actual measurements
      if (Math.abs(diff) < 2) return 'stable';
      if (diff > 10) return 'rising_rapidly';
      if (diff < -10) return 'falling_rapidly';
      if (diff > 0) return 'rising';
      return 'falling';
    },
    
    /**
     * Get the number of glucose readings collected
     */
    getGlucoseReadingsCount: (): number => {
      return glucoseValues.length;
    },
    
    /**
     * Reset all collected data
     */
    reset: () => {
      spo2Values.length = 0;
      bpValues.length = 0;
      respirationRates.length = 0;
      respirationDepths.length = 0;
      glucoseValues.length = 0;
      glucoseTimestamps.length = 0;
      hemoglobinValues.length = 0;
    }
  };
};
