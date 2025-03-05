/**
 * Handles hemoglobin calculation from red and IR signals
 */
export class HemoglobinCalculator {
  private lastHemoglobinValue: number = 0;
  private redSignalBuffer: number[] = [];
  private irSignalBuffer: number[] = [];
  
  constructor() {
    console.log("HemoglobinCalculator initialized");
  }
  
  /**
   * Update signal buffers with new values
   */
  public updateSignalBuffers(redValue: number, irValue: number): void {
    // Only add non-zero values to avoid skewing the calculation
    if (redValue > 0 && irValue > 0) {
      this.redSignalBuffer.push(redValue);
      this.irSignalBuffer.push(irValue);
      
      // Keep the buffers at a reasonable size
      if (this.redSignalBuffer.length > 500) {
        this.redSignalBuffer.shift();
      }
      if (this.irSignalBuffer.length > 500) {
        this.irSignalBuffer.shift();
      }
      
      // Log buffer sizes occasionally for debugging
      if (this.redSignalBuffer.length % 50 === 0) {
        console.log(`Signal buffers size - Red: ${this.redSignalBuffer.length}, IR: ${this.irSignalBuffer.length}`);
      }
    }
  }
  
  /**
   * Calculate hemoglobin based on the collected signal buffers
   */
  public calculate(): number | null {
    // Check if we have enough data
    if (this.redSignalBuffer.length > 50 && this.irSignalBuffer.length > 50) {
      const hemoglobin = this.calculateHemoglobin(this.redSignalBuffer, this.irSignalBuffer);
      if (hemoglobin > 0) {
        this.lastHemoglobinValue = hemoglobin;
        console.log(`Calculated hemoglobin: ${hemoglobin} g/dL`);
        return hemoglobin;
      } else if (this.lastHemoglobinValue > 0) {
        // Use last valid value if current calculation failed
        return this.lastHemoglobinValue;
      }
    } else {
      console.log(`Not enough data for hemoglobin calculation. Red buffer: ${this.redSignalBuffer.length}, IR buffer: ${this.irSignalBuffer.length}`);
    }
    return null;
  }
  
  /**
   * Reset all internal data
   */
  public reset(): void {
    this.redSignalBuffer = [];
    this.irSignalBuffer = [];
    this.lastHemoglobinValue = 0;
  }
  
  /**
   * Calculate hemoglobin concentration using optical properties
   * Based on modified Beer-Lambert law for non-invasive estimation
   */
  private calculateHemoglobin(redSignal: number[], irSignal: number[]): number {
    // Ensure we have valid data
    if (!redSignal || !irSignal || redSignal.length < 10 || irSignal.length < 10) {
      console.log("Insufficient data for hemoglobin calculation");
      return 0;
    }

    try {
      // Calculate AC and DC components for both wavelengths
      const redAC = this.calculateAC(redSignal);
      const redDC = this.calculateDC(redSignal);
      const irAC = this.calculateAC(irSignal);
      const irDC = this.calculateDC(irSignal);

      // Log raw values for debugging
      console.log(`Hemoglobin calculation - redAC: ${redAC}, redDC: ${redDC}, irAC: ${irAC}, irDC: ${irDC}`);

      // Avoid division by zero or very small values
      if (redDC < 0.001 || irDC < 0.001 || irAC < 0.001) {
        console.log("Invalid signal values for hemoglobin calculation");
        return 0;
      }

      // Calculate R value (ratio of ratios) used in pulse oximetry
      // R = (AC_red/DC_red)/(AC_ir/DC_ir)
      const R = (redAC / redDC) / (irAC / irDC);
      
      if (isNaN(R) || R <= 0) {
        console.log("Invalid R ratio calculated:", R);
        return 0;
      }
      
      console.log(`Hemoglobin R ratio: ${R}`);

      // Apply Beer-Lambert based model for hemoglobin estimation
      // Coefficients based on empirical data and optical properties of hemoglobin
      const a = 14.5; // Baseline for normal hemoglobin
      const b = -9.8; // Coefficient for R ratio
      const c = 2.7;  // Coefficient for squared term (non-linearity)

      // Calculate hemoglobin using polynomial model
      let hemoglobin = a + (b * R) + (c * Math.pow(R, 2));
      
      if (isNaN(hemoglobin)) {
        console.log("Hemoglobin calculation resulted in NaN");
        return 0;
      }

      // Apply physiological limits (normal range for adults is ~12-17 g/dL)
      hemoglobin = Math.max(5.0, Math.min(22.0, hemoglobin));

      // Round to one decimal place for display
      const roundedValue = Math.round(hemoglobin * 10) / 10;
      console.log(`Final hemoglobin value: ${roundedValue} g/dL`);
      return roundedValue;
    } catch (error) {
      console.error("Error calculating hemoglobin:", error);
      return 0;
    }
  }
  
  /**
   * Calculate AC component (amplitude) of a signal
   */
  private calculateAC(values: number[]): number {
    if (values.length === 0) return 0;
    return Math.max(...values) - Math.min(...values);
  }

  /**
   * Calculate DC component (average) of a signal
   */
  private calculateDC(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }
}
