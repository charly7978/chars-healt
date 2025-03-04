
interface PPGDataPoint {
  time: number;
  value: number;
  isArrhythmia: boolean;
  isWaveStart?: boolean; // Make this optional to handle old data
}

export class CircularBuffer {
  private buffer: PPGDataPoint[];
  private maxSize: number;
  private fingerDetectionThreshold: number = 0.08; // MODIFICACIÓN: Reducido drásticamente de 0.12 a 0.08 para detectar señales muy débiles
  private lastDetectionTime: number = 0;
  private detectionHysteresis: number = 0.05; // NUEVA: Histéresis para evitar oscilaciones en la detección

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

  // Mejorado significativamente para mantener la detección más estable
  isFingerDetected(recentPoints: number = 10): boolean {
    if (this.buffer.length < recentPoints) return false;
    
    const latestPoints = this.buffer.slice(-recentPoints);
    const signalVariance = this.calculateVariance(latestPoints.map(p => p.value));
    const currentTime = Date.now();
    
    // Detección con histéresis: usamos un umbral más bajo si ya estábamos detectando
    const wasDetected = currentTime - this.lastDetectionTime < 7000; // MODIFICACIÓN: Aumentado a 7 segundos
    const effectiveThreshold = wasDetected 
      ? this.fingerDetectionThreshold - this.detectionHysteresis 
      : this.fingerDetectionThreshold;
    
    // Detección basada en la varianza de la señal
    if (signalVariance > effectiveThreshold) {
      this.lastDetectionTime = currentTime;
      return true;
    }
    
    // Verificación adicional: detectar cambios significativos en la señal
    if (this.detectSignificantChanges(latestPoints)) {
      this.lastDetectionTime = currentTime;
      return true;
    }
    
    // Mantener la detección por hasta 7 segundos después de la última detección real
    if (currentTime - this.lastDetectionTime < 7000) { // MODIFICACIÓN: Aumentado de 5 a 7 segundos
      return true;
    }
    
    return false;
  }

  // NUEVO: Método para detectar cambios significativos en la señal que indican presencia de dedo
  private detectSignificantChanges(points: PPGDataPoint[]): boolean {
    if (points.length < 5) return false;
    
    // Calcular la diferencia máxima entre puntos consecutivos
    let maxDiff = 0;
    for (let i = 1; i < points.length; i++) {
      const diff = Math.abs(points[i].value - points[i-1].value);
      maxDiff = Math.max(maxDiff, diff);
    }
    
    // Si hay cambios significativos, probablemente hay un dedo
    return maxDiff > 0.2;
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
