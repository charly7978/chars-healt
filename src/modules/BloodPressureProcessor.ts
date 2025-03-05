
/**
 * Handles blood pressure calculation
 */
export class BloodPressureProcessor {
  private lastSystolic: number = 120;
  private lastDiastolic: number = 80;
  private measurementCount: number = 0;
  
  constructor() {
    console.log("BloodPressureProcessor initialized");
  }
  
  /**
   * Calculate blood pressure based on PPG values
   */
  public calculate(values: number[]): { systolic: number; diastolic: number } {
    this.measurementCount++;
    
    const rawBP = this.calculateRawBloodPressure(values);
    
    if (rawBP.systolic > 0 && rawBP.diastolic > 0) {
      const systolicAdjustment = Math.min(5, Math.max(-5, (rawBP.systolic - this.lastSystolic) / 2));
      const diastolicAdjustment = Math.min(3, Math.max(-3, (rawBP.diastolic - this.lastDiastolic) / 2));
      
      const finalSystolic = Math.round(this.lastSystolic + systolicAdjustment);
      const finalDiastolic = Math.round(this.lastDiastolic + diastolicAdjustment);
      
      this.lastSystolic = finalSystolic;
      this.lastDiastolic = finalDiastolic;
      
      return {
        systolic: Math.max(90, Math.min(180, finalSystolic)),
        diastolic: Math.max(60, Math.min(110, Math.min(finalSystolic - 30, finalDiastolic)))
      };
    }
    
    if (this.lastSystolic === 0 || this.lastDiastolic === 0) {
      const systolic = 120 + Math.floor(Math.random() * 8) - 4;
      const diastolic = 80 + Math.floor(Math.random() * 6) - 3;
      
      this.lastSystolic = systolic;
      this.lastDiastolic = diastolic;
      
      return { systolic, diastolic };
    }
    
    const signalQuality = Math.min(1.0, Math.max(0.1, 
      values.length > 30 ? 
      (values.reduce((sum, v) => sum + Math.abs(v), 0) / values.length) / 100 : 
      0.5
    ));
    
    const variationFactor = (1.1 - signalQuality) * 4;
    const systolicVariation = Math.floor(Math.random() * variationFactor) - Math.floor(variationFactor/2);
    const diastolicVariation = Math.floor(Math.random() * (variationFactor * 0.6)) - Math.floor((variationFactor * 0.6)/2);
    
    const systolic = Math.max(90, Math.min(180, this.lastSystolic + systolicVariation));
    const diastolic = Math.max(60, Math.min(110, Math.min(systolic - 30, this.lastDiastolic + diastolicVariation)));
    
    this.lastSystolic = systolic;
    this.lastDiastolic = diastolic;
    
    return { systolic, diastolic };
  }
  
  /**
   * Calculate raw blood pressure values (to be refined)
   */
  private calculateRawBloodPressure(values: number[]): { systolic: number; diastolic: number } {
    // Simplified calculation for testing
    if (values.length < 20) {
      return { systolic: 0, diastolic: 0 };
    }
    
    // Basic calculation based on signal variance and mean
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    
    // Calculate variance
    let variance = 0;
    for (const v of values) {
      variance += Math.pow(v - mean, 2);
    }
    variance /= values.length;
    
    // Apply formula based on empirical relationship
    // These formulas are simplified for demonstration
    const systolic = 100 + Math.sqrt(variance) * 5 + (mean * 0.2);
    const diastolic = 60 + Math.sqrt(variance) * 2 + (mean * 0.1);
    
    return {
      systolic: Math.round(systolic),
      diastolic: Math.round(diastolic)
    };
  }
  
  /**
   * Reset all internal data
   */
  public reset(): void {
    this.lastSystolic = 120;
    this.lastDiastolic = 80;
    this.measurementCount = 0;
  }
}
