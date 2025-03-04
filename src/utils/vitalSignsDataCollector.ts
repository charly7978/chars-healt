/**
 * Creates a collector for vital signs data
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
     * Add glucose value to collection with timestamp validation
     */
    addGlucose: (value: number) => {
      const now = Date.now();
      
      // Validate glucose range (40-400 mg/dL es rango fisiológico amplio)
      if (value >= 40 && value <= 400) {
        // Check if we have a recent reading (< 10 seconds ago)
        const hasRecentReading = glucoseTimestamps.length > 0 && 
          (now - glucoseTimestamps[glucoseTimestamps.length - 1] < 10000);
        
        // Check for physiologically impossible glucose changes
        // (glucose doesn't change more than ~2-3 mg/dL per minute in normal conditions)
        const lastValue = glucoseValues.length > 0 ? glucoseValues[glucoseValues.length - 1] : 0;
        const timeDiff = glucoseTimestamps.length > 0 ? 
          (now - glucoseTimestamps[glucoseTimestamps.length - 1]) / 60000 : 1; // convert to minutes
        const changeRate = Math.abs(value - lastValue) / timeDiff;
        const isPhysiologicallyPlausible = changeRate <= 15 || glucoseValues.length === 0;
        
        // Add the reading if it's plausible or we don't have enough history
        if (!hasRecentReading && (isPhysiologicallyPlausible || glucoseValues.length < 3)) {
          glucoseValues.push(value);
          glucoseTimestamps.push(now);
          
          // Keep only the most recent 10 readings
          if (glucoseValues.length > 10) {
            glucoseValues.shift();
            glucoseTimestamps.shift();
          }
          
          console.log(`Glucose value added: ${value} mg/dL`, {
            historySize: glucoseValues.length,
            changeRate: changeRate.toFixed(2),
            timeSinceLast: timeDiff.toFixed(2)
          });
        } else if (hasRecentReading) {
          console.log(`Glucose reading ignored - too soon since last reading`);
        } else if (!isPhysiologicallyPlausible) {
          console.log(`Glucose reading ignored - implausible change: ${changeRate.toFixed(2)} mg/dL/min`);
        }
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
     * Get average hemoglobin from collected values
     */
    getAverageHemoglobin: (): number => {
      if (hemoglobinValues.length === 0) return 0;
      const sum = hemoglobinValues.reduce((acc, val) => acc + val, 0);
      return Math.round((sum / hemoglobinValues.length) * 10) / 10; // Round to 1 decimal place
    },
    
    /**
     * Get average glucose from collected values
     * Returns a more reliable average with temporal weighting
     */
    getAverageGlucose: (): number => {
      if (glucoseValues.length === 0) return 0;
      
      // If we have enough readings, apply a weighted average with more weight to recent readings
      if (glucoseValues.length >= 3) {
        // Create weights with more emphasis on recent readings
        const weights = glucoseValues.map((_, idx) => idx + 1);
        const totalWeight = weights.reduce((sum, w) => sum + w, 0);
        
        // Calculate weighted average
        const weightedSum = glucoseValues.reduce((sum, value, idx) => 
          sum + (value * weights[idx]), 0);
        
        return Math.round(weightedSum / totalWeight);
      }
      
      // Simple average for fewer readings
      const sum = glucoseValues.reduce((acc, val) => acc + val, 0);
      return Math.round(sum / glucoseValues.length);
    },
    
    /**
     * Get glucose trend based on recent values
     * Enhanced with more accurate trend detection
     */
    getGlucoseTrend: (): 'stable' | 'rising' | 'falling' | 'rising_rapidly' | 'falling_rapidly' | 'unknown' => {
      // Need at least 3 readings for a meaningful trend
      if (glucoseValues.length < 3) return 'unknown';
      
      // Get recent readings and their timestamps
      const recentValues = [...glucoseValues];
      const recentTimes = [...glucoseTimestamps];
      
      // Calculate rate of change in mg/dL per minute over multiple periods
      const ratesOfChange: number[] = [];
      for (let i = 1; i < recentValues.length; i++) {
        const timeChangeMinutes = (recentTimes[i] - recentTimes[i-1]) / 60000;
        if (timeChangeMinutes > 0) {
          const valueChange = recentValues[i] - recentValues[i-1];
          ratesOfChange.push(valueChange / timeChangeMinutes);
        }
      }
      
      // If no valid rates calculated, return unknown
      if (ratesOfChange.length === 0) return 'unknown';
      
      // Calculate average rate of change
      const avgRateOfChange = ratesOfChange.reduce((sum, rate) => sum + rate, 0) / ratesOfChange.length;
      
      // Consistent trend check - all rates should point in same direction
      const consistentTrend = ratesOfChange.every(rate => Math.sign(rate) === Math.sign(avgRateOfChange));
      
      console.log(`Glucose trend analysis: ${avgRateOfChange.toFixed(2)} mg/dL/min, consistent: ${consistentTrend}`);
      
      // Determine trend based on rate of change
      if (Math.abs(avgRateOfChange) < 1.0) return 'stable';
      if (avgRateOfChange > 3.0 && consistentTrend) return 'rising_rapidly';
      if (avgRateOfChange < -3.0 && consistentTrend) return 'falling_rapidly';
      if (avgRateOfChange > 0) return 'rising';
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
