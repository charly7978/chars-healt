
/**
 * Creates a collector for vital signs data
 */
export const createVitalSignsDataCollector = () => {
  const spo2Values: number[] = [];
  const bpValues: string[] = [];
  const respirationRates: number[] = [];
  const respirationDepths: number[] = [];
  const glucoseValues: number[] = [];
  
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
     * Add blood glucose reading to collection
     */
    addBloodGlucose: (value: number) => {
      if (value >= 40 && value <= 400) {
        glucoseValues.push(value);
        if (glucoseValues.length > 10) {
          glucoseValues.shift();
        }
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
     */
    getAverageRespirationRate: (): number => {
      if (respirationRates.length === 0) return 0;
      const sum = respirationRates.reduce((acc, val) => acc + val, 0);
      return Math.round(sum / respirationRates.length * 10) / 10; // Redondear a 1 decimal
    },
    
    /**
     * Get average respiration depth from collected values (0-100)
     */
    getAverageRespirationDepth: (): number => {
      if (respirationDepths.length === 0) return 0;
      const sum = respirationDepths.reduce((acc, val) => acc + val, 0);
      return Math.round(sum / respirationDepths.length);
    },
    
    /**
     * Get average blood glucose from collected values
     */
    getAverageBloodGlucose: (): number => {
      if (glucoseValues.length === 0) return 0;
      const sum = glucoseValues.reduce((acc, val) => acc + val, 0);
      return Math.round(sum / glucoseValues.length);
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
    }
  };
};
