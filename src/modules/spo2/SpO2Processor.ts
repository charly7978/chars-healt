
/**
 * Handles SpO2 signal processing and filtering
 * With performance optimizations for mobile devices
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
  private renderQualityMode: boolean = false; // Disable high quality for better performance
  private processingThrottle: number = 0;
  
  private anomalyDetector: AnomalyDetector;
  private signalStabilizer: SignalStabilizer;
  
  // Pre-allocated arrays for better performance
  private readonly valuesToProcess: number[] = new Array(5);

  constructor() {
    this.anomalyDetector = new AnomalyDetector();
    this.signalStabilizer = new SignalStabilizer();
    
    // Pre-allocate buffers with capacity for better performance
    this.spo2Buffer = new Array(SPO2_CONSTANTS.BUFFER_SIZE * 2);
    this.spo2RawBuffer = new Array(SPO2_CONSTANTS.BUFFER_SIZE * 2);
  }

  /**
   * Reset processor state
   */
  reset(): void {
    this.spo2Buffer = [];
    this.spo2RawBuffer = [];
    this.lastSpo2Value = 0;
    this.frameSkipCounter = 0;
    this.processingThrottle = 0;
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
   * With optimized frame skipping
   */
  addRawValue(value: number): void {
    // Improved frame skipping logic for better performance
    this.frameSkipCounter = (this.frameSkipCounter + 1) % 2; // Skip every other frame
    if (this.frameSkipCounter !== 0) return;
    
    // Processing throttle to reduce CPU usage
    this.processingThrottle = (this.processingThrottle + 1) % 3;
    if (this.processingThrottle !== 0) return;
    
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
   * Optimized for mobile performance
   */
  processValue(calibratedSpO2: number): number {
    // Apply anomaly detection before further processing
    const isAnomaly = this.anomalyDetector.detectAnomaly(calibratedSpO2);
    let filteredSpO2 = isAnomaly ? this.lastSpo2Value || calibratedSpO2 : calibratedSpO2;
    
    // Apply median filter to eliminate outliers - with buffer size check for performance
    const bufferLength = this.spo2RawBuffer.length;
    if (bufferLength >= 5) {
      filteredSpO2 = this.signalStabilizer.applyMedianFilter(this.spo2RawBuffer, Math.min(bufferLength, 9));
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
      // Use a pre-allocated array for processing to avoid allocations
      const startPos = Math.max(0, this.spo2Buffer.length - 5);
      
      for (let i = 0; i < 5; i++) {
        this.valuesToProcess[i] = this.spo2Buffer[startPos + i] || this.spo2Buffer[this.spo2Buffer.length - 1];
      }
      
      // Sort in-place with optimized algorithm for small arrays
      // Insertion sort is faster for small arrays (<10 elements)
      for (let i = 1; i < 5; i++) {
        const key = this.valuesToProcess[i];
        let j = i - 1;
        
        while (j >= 0 && this.valuesToProcess[j] > key) {
          this.valuesToProcess[j + 1] = this.valuesToProcess[j];
          j--;
        }
        
        this.valuesToProcess[j + 1] = key;
      }
      
      // Enhanced filtering: Use pattern-based weighting
      filteredSpO2 = applyPatternBasedFiltering(this.valuesToProcess);
      
      // Use extra strong smoothing to prevent value changes
      if (this.lastSpo2Value > 0) {
        // Use fixed alpha for stability and performance
        const alpha = 0.15; // Balance between stability and responsiveness
                      
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
