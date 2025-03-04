
interface PPGDataPoint {
  time: number;
  value: number;
  isArrhythmia: boolean;
  isWaveStart?: boolean; // Make this optional to handle old data
}

export class CircularBuffer {
  private buffer: PPGDataPoint[];
  private maxSize: number;
  private fingerDetectionThreshold: number = 0.15; // MODIFICACIÓN #1: Reducido de 0.25 a 0.15 para aumentar sensibilidad

  constructor(size: number) {
    this.buffer = [];
    this.maxSize = size;
  }

  push(point: PPGDataPoint): void {
    this.buffer.push(point);
    if (this.buffer.length > this.maxSize) {
      this.buffer.shift();
    }
  }

  getPoints(): PPGDataPoint[] {
    return [...this.buffer];
  }

  clear(): void {
    this.buffer = [];
  }

  // MODIFICACIÓN #2: Añadimos método para verificar si hay un dedo detectado
  isFingerDetected(recentPoints: number = 10): boolean {
    if (this.buffer.length < recentPoints) return false;
    
    const latestPoints = this.buffer.slice(-recentPoints);
    const signalVariance = this.calculateVariance(latestPoints.map(p => p.value));
    
    return signalVariance > this.fingerDetectionThreshold;
  }

  // Método auxiliar para calcular la varianza de la señal
  private calculateVariance(values: number[]): number {
    if (values.length < 2) return 0;
    
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const squaredDiffs = values.map(val => Math.pow(val - mean, 2));
    return squaredDiffs.reduce((sum, val) => sum + val, 0) / values.length;
  }
}

export type { PPGDataPoint };
