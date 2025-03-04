
/**
 * Handles SpO2 signal processing and filtering
 */
import { SPO2_CONSTANTS } from './SpO2Constants';

export class SpO2Processor {
  private spo2Buffer: number[] = [];
  private spo2RawBuffer: number[] = [];
  private lastSpo2Value: number = 0;

  reset(): void {
    this.spo2Buffer = [];
    this.spo2RawBuffer = [];
    this.lastSpo2Value = 0;
  }

  getLastValue(): number {
    return this.lastSpo2Value;
  }

  addRawValue(value: number): void {
    this.spo2RawBuffer.push(value);
    if (this.spo2RawBuffer.length > SPO2_CONSTANTS.BUFFER_SIZE) {
      this.spo2RawBuffer.shift();
    }
  }

  processValue(calibratedSpO2: number): number {
    // Aplicar filtro simple para valores atípicos
    if (this.spo2RawBuffer.length >= 3) {
      const recentValues = [...this.spo2RawBuffer].slice(-3);
      recentValues.sort((a, b) => a - b);
      calibratedSpO2 = recentValues[1]; // Mediana de 3 valores
    }

    // Mantener buffer de valores
    this.spo2Buffer.push(calibratedSpO2);
    if (this.spo2Buffer.length > SPO2_CONSTANTS.BUFFER_SIZE) {
      this.spo2Buffer.shift();
    }

    // Calcular promedio simple para estabilidad
    if (this.spo2Buffer.length >= 3) {
      const sum = this.spo2Buffer.reduce((a, b) => a + b, 0);
      const avg = Math.round(sum / this.spo2Buffer.length);
      
      // Suavizado simple con valor anterior
      if (this.lastSpo2Value > 0) {
        calibratedSpO2 = Math.round(
          SPO2_CONSTANTS.MOVING_AVERAGE_ALPHA * avg + 
          (1 - SPO2_CONSTANTS.MOVING_AVERAGE_ALPHA) * this.lastSpo2Value
        );
      } else {
        calibratedSpO2 = avg;
      }
    }
    
    // Límite máximo realista
    calibratedSpO2 = Math.min(calibratedSpO2, 98);
    
    // Actualizar último valor
    this.lastSpo2Value = calibratedSpO2;
    
    return calibratedSpO2;
  }
}
