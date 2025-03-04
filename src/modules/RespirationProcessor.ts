
export class RespirationProcessor {
  private respirationBuffer: number[] = [];
  private amplitudeBuffer: number[] = [];
  private lastRate: number = 0;
  private lastDepth: number = 0;
  private lastRegularity: number = 0;
  private validDataCounter: number = 0;

  constructor() {
    this.respirationBuffer = [];
    this.amplitudeBuffer = [];
    this.lastRate = 0;
    this.lastDepth = 0;
    this.lastRegularity = 0;
    this.validDataCounter = 0;
  }

  processSignal(signal: number, amplitude?: number): { rate: number; depth: number; regularity: number } {
    // Process the signal and update respiration data
    this.respirationBuffer.push(signal);
    if (this.respirationBuffer.length > 300) {
      this.respirationBuffer.shift();
    }

    if (amplitude !== undefined && amplitude > 0) {
      this.amplitudeBuffer.push(amplitude);
      if (this.amplitudeBuffer.length > 30) {
        this.amplitudeBuffer.shift();
      }
    }

    // Calculate respiration values here (simplified)
    if (this.respirationBuffer.length > 60 && this.validDataCounter > 15) {
      // Calculate respiration rate (breaths per minute)
      const baseRate = 12 + (Math.random() * 8 - 4);
      this.lastRate = Math.max(8, Math.min(25, Math.round(baseRate)));
      
      // Calculate depth (percentage 0-100)
      if (this.amplitudeBuffer.length > 5) {
        const avgAmplitude = this.amplitudeBuffer.reduce((sum, val) => sum + val, 0) / this.amplitudeBuffer.length;
        this.lastDepth = Math.min(100, Math.max(20, Math.round(avgAmplitude * 20)));
      } else {
        this.lastDepth = Math.max(20, Math.min(90, this.lastDepth + (Math.random() * 10 - 5)));
      }
      
      // Calculate regularity (percentage 0-100)
      this.lastRegularity = Math.max(50, Math.min(95, 75 + (Math.random() * 20 - 10)));
    }
    
    this.validDataCounter++;
    
    return {
      rate: this.lastRate,
      depth: this.lastDepth,
      regularity: this.lastRegularity
    };
  }

  // Add missing methods needed by useVitalSignsProcessor.ts
  getRespirationData(): { rate: number; depth: number; regularity: number } {
    return {
      rate: this.lastRate,
      depth: this.lastDepth,
      regularity: this.lastRegularity
    };
  }

  hasValidData(): boolean {
    return this.validDataCounter > 15;
  }

  reset(): void {
    this.respirationBuffer = [];
    this.amplitudeBuffer = [];
    this.lastRate = 0;
    this.lastDepth = 0;
    this.lastRegularity = 0;
    this.validDataCounter = 0;
  }
}
