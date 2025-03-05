
/**
 * Handles SpO2 signal processing and filtering
 */
import { SPO2_CONSTANTS } from './SpO2Constants';
import { applyPatternBasedFiltering } from './utils/SignalUtils';
import { AnomalyDetector } from './AnomalyDetector';
import { SignalStabilizer } from './SignalStabilizer';

export class SpO2Processor {
  private spo2Buffer: number[] = [];
  private spo2RawBuffer: number[] = [];
  private lastSpo2Value: number = 0;
  private frameSkipCounter: number = 0;
  private renderQualityMode: boolean = true; // Always enable high quality rendering
  
  private anomalyDetector: AnomalyDetector;
  private signalStabilizer: SignalStabilizer;

  constructor() {
    this.anomalyDetector = new AnomalyDetector();
    this.signalStabilizer = new SignalStabilizer();
  }

  /**
   * Reset processor state
   */
  reset(): void {
    this.spo2Buffer = [];
    this.spo2RawBuffer = [];
    this.lastSpo2Value = 0;
    this.frameSkipCounter = 0;
    this.anomalyDetector.reset();
    this.signalStabilizer.reset();
  }

  /**
   * Get the last processed SpO2 value
   */
  getLastValue(): number {
    return this.lastSpo2Value;
  }

  /**
   * Add a raw SpO2 value to the buffer
   */
  addRawValue(value: number): void {
    // Minimal frame skipping for extremely fluid visuals
    this.frameSkipCounter = (this.frameSkipCounter + 1) % 1; // No frame skipping
    if (this.frameSkipCounter !== 0) return;
    
    if (value < 90 || value > 100) return; // Prevent physiologically impossible values
    
    // Add to anomaly detector history
    this.anomalyDetector.addValue(value);
    
    // Use a more efficient buffer implementation with pre-allocated space
    if (this.spo2RawBuffer.length >= SPO2_CONSTANTS.BUFFER_SIZE * 2) {
      // Shift elements manually instead of using array.shift() for better performance
      for (let i = 0; i < this.spo2RawBuffer.length - 1; i++) {
        this.spo2RawBuffer[i] = this.spo2RawBuffer[i + 1];
      }
      this.spo2RawBuffer[this.spo2RawBuffer.length - 1] = value;
    } else {
      this.spo2RawBuffer.push(value);
    }
  }

  /**
   * Process and filter a SpO2 value
   */
  processValue(calibratedSpO2: number): number {
    // Apply anomaly detection before further processing
    const isAnomaly = this.anomalyDetector.detectAnomaly(calibratedSpO2);
    let filteredSpO2 = isAnomaly ? this.lastSpo2Value || calibratedSpO2 : calibratedSpO2;
    
    // Apply median filter to eliminate outliers
    const bufferLength = this.spo2RawBuffer.length;
    if (bufferLength >= 5) {
      filteredSpO2 = this.signalStabilizer.applyMedianFilter(this.spo2RawBuffer, bufferLength);
    }

    // Optimized buffer management with pre-allocation
    if (this.spo2Buffer.length >= SPO2_CONSTANTS.BUFFER_SIZE) {
      // Manually shift elements for better performance
      for (let i = 0; i < this.spo2Buffer.length - 1; i++) {
        this.spo2Buffer[i] = this.spo2Buffer[i + 1];
      }
      this.spo2Buffer[this.spo2Buffer.length - 1] = filteredSpO2;
    } else {
      this.spo2Buffer.push(filteredSpO2);
    }

    // Performance optimization: Only do expensive calculations when we have sufficient data
    if (this.spo2Buffer.length >= 5) {
      // Use a fixed-size array for processing to avoid allocations
      const valuesToProcess = new Array(5);
      const startPos = Math.max(0, this.spo2Buffer.length - 5);
      
      for (let i = 0; i < 5; i++) {
        valuesToProcess[i] = this.spo2Buffer[startPos + i] || this.spo2Buffer[this.spo2Buffer.length - 1];
      }
      
      // Sort in-place with optimized algorithm for small arrays
      for (let i = 1; i < valuesToProcess.length; i++) {
        const key = valuesToProcess[i];
        let j = i - 1;
        
        while (j >= 0 && valuesToProcess[j] > key) {
          valuesToProcess[j + 1] = valuesToProcess[j];
          j--;
        }
        
        valuesToProcess[j + 1] = key;
      }
      
      // Enhanced filtering: Use pattern-based weighting
      filteredSpO2 = applyPatternBasedFiltering(valuesToProcess);
      
      // Use extra strong smoothing to prevent value changes
      if (this.lastSpo2Value > 0) {
        // Adaptive alpha based on signal stability
        const signalStability = this.anomalyDetector.calculateSignalStability();
        const alpha = 0.05 + (0.2 * (1 - signalStability)); // Alpha ranges from 0.05 (stable) to 0.25 (unstable)
                      
        filteredSpO2 = Math.round(
          alpha * filteredSpO2 + 
          (1 - alpha) * this.lastSpo2Value
        );
      }
    }
    
    // Final stabilization pass
    filteredSpO2 = this.signalStabilizer.stabilizeValue(filteredSpO2);
    
    // Update the last valid value (with additional smoothing for display stability)
    // Only update if the difference is significant (prevents micro-flickering)
    if (Math.abs(filteredSpO2 - this.lastSpo2Value) >= 1) {
      this.lastSpo2Value = filteredSpO2;
    }
    
    return this.lastSpo2Value; // Return the extra-stable value
  }
}
