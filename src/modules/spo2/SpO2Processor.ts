/**
 * Handles SpO2 signal processing and filtering
 * ESTA APPS ES DE MEDICION ULTRA REAL - PROHIBIDA CUALQUIER SIMULACION - NO ESTA PERMITIDO HACER MOVIMIENTOS POR CUENTA DE LA I.A SIN AUTORIZACION DEL USUARIO
 */
import { SPO2_CONSTANTS } from './SpO2Constants';

export class SpO2Processor {
  private spo2Buffer: number[] = [];
  private spo2RawBuffer: number[] = [];
  private lastSpo2Value: number = 0;
  private frameSkipCounter: number = 0;
  private medianCache: number[] = new Array(5).fill(0);
  
  /**
   * Reset processor state
   * ESTA APPS ES DE MEDICION ULTRA REAL - PROHIBIDA CUALQUIER SIMULACION - NO ESTA PERMITIDO HACER MOVIMIENTOS POR CUENTA DE LA I.A SIN AUTORIZACION DEL USUARIO
   */
  reset(): void {
    this.spo2Buffer = [];
    this.spo2RawBuffer = [];
    this.lastSpo2Value = 0;
    this.frameSkipCounter = 0;
    this.medianCache = new Array(5).fill(0);
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
    // Use all raw values directly
    this.frameSkipCounter = (this.frameSkipCounter + 1) % 1; // No frame skipping
    
    if (value < 90 || value > 100) return; // Prevent physiologically impossible values
    
    // Store raw value in buffer
    if (this.spo2RawBuffer.length >= SPO2_CONSTANTS.BUFFER_SIZE * 2) {
      for (let i = 0; i < this.spo2RawBuffer.length - 1; i++) {
        this.spo2RawBuffer[i] = this.spo2RawBuffer[i + 1];
      }
      this.spo2RawBuffer[this.spo2RawBuffer.length - 1] = value;
    } else {
      this.spo2RawBuffer.push(value);
    }
  }

  /**
   * Process a raw value with minimal filtering
   * ESTA APPS ES DE MEDICION ULTRA REAL - PROHIBIDA CUALQUIER SIMULACION - NO ESTA PERMITIDO HACER MOVIMIENTOS POR CUENTA DE LA I.A SIN AUTORIZACION DEL USUARIO
   */
  processRawValue(value: number): number {
    // Store raw value and update last value
    this.lastSpo2Value = value;
    
    // Add to buffer for historical data
    if (this.spo2Buffer.length >= SPO2_CONSTANTS.BUFFER_SIZE) {
      for (let i = 0; i < this.spo2Buffer.length - 1; i++) {
        this.spo2Buffer[i] = this.spo2Buffer[i + 1];
      }
      this.spo2Buffer[this.spo2Buffer.length - 1] = value;
    } else {
      this.spo2Buffer.push(value);
    }
    
    return value; // Return actual measured value
  }

  /**
   * Process and filter a SpO2 value
   */
  processValue(calibratedSpO2: number): number {
    // This is the old method with heavy stabilization
    // Now we use processRawValue instead for real measurements
    return this.processRawValue(calibratedSpO2);
  }
  
  /**
   * Optimized insertion sort for small arrays
   * Much faster than Array.sort() for arrays of size <= 10
   */
  private insertionSort(arr: number[], len: number): void {
    for (let i = 1; i < len; i++) {
      const key = arr[i];
      let j = i - 1;
      
      while (j >= 0 && arr[j] > key) {
        arr[j + 1] = arr[j];
        j--;
      }
      
      arr[j + 1] = key;
    }
  }
}
