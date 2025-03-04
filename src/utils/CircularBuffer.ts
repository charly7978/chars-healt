
interface PPGDataPoint {
  time: number;
  value: number;
  isArrhythmia: boolean;
  isWaveStart?: boolean; // Make this optional to handle old data
}

export class CircularBuffer {
  private buffer: PPGDataPoint[];
  private maxSize: number;
  private fingerDetectionThreshold: number = 0.12; // MODIFICACIÓN #1: Reducido aún más de 0.15 a 0.12 para mantener la detección más estable
  private lastDetectionTime: number = 0; // MODIFICACIÓN #2: Añadido para mantener la detección por más tiempo

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
    this.lastDetectionTime = 0;
  }

  // Mejorado para mantener la detección por más tiempo
  isFingerDetected(recentPoints: number = 10): boolean {
    if (this.buffer.length < recentPoints) return false;
    
    const latestPoints = this.buffer.slice(-recentPoints);
    const signalVariance = this.calculateVariance(latestPoints.map(p => p.value));
    const currentTime = Date.now();
    
    // Si detectamos una varianza superior al umbral, actualizamos el tiempo de última detección
    if (signalVariance > this.fingerDetectionThreshold) {
      this.lastDetectionTime = currentTime;
      return true;
    }
    
    // Mantenemos la detección por hasta 5 segundos después de la última detección real
    // Esto evita que la detección se pierda por fluctuaciones momentáneas en la señal
    if (currentTime - this.lastDetectionTime < 5000) {
      return true;
    }
    
    return false;
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
