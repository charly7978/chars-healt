interface PPGDataPoint {
  time: number;
  value: number;
  isArrhythmia: boolean;
  isWaveStart?: boolean; // Make this optional to handle old data
}

export class CircularBuffer {
  private buffer: PPGDataPoint[];
  private maxSize: number;
  private fingerDetectionThreshold: number = 0.05; // MODIFICACIÓN: Reducido radicalmente de 0.08 a 0.05
  private lastDetectionTime: number = 0;
  private detectionHysteresis: number = 0.08; // MODIFICACIÓN: Aumentado de 0.05 a 0.08 para mayor persistencia
  private persistenceTime: number = 15000; // NUEVA: Tiempo de persistencia ampliado a 15 segundos (antes 7s)

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

  // Mejorado drásticamente para mantener detección casi permanente
  isFingerDetected(recentPoints: number = 10): boolean {
    if (this.buffer.length < recentPoints) return false;
    
    const latestPoints = this.buffer.slice(-recentPoints);
    const signalVariance = this.calculateVariance(latestPoints.map(p => p.value));
    const currentTime = Date.now();
    
    // Condición de mantenimiento extendido
    const wasDetected = currentTime - this.lastDetectionTime < this.persistenceTime;
    
    // Umbral dinámico: mucho más bajo si ya estábamos detectando
    const effectiveThreshold = wasDetected 
      ? this.fingerDetectionThreshold - this.detectionHysteresis
      : this.fingerDetectionThreshold;
    
    // Detectar cualquier mínima variación en la señal
    if (signalVariance > effectiveThreshold) {
      this.lastDetectionTime = currentTime;
      return true;
    }
    
    // Verificar cambios incluso muy pequeños
    if (this.detectSignificantChanges(latestPoints, wasDetected ? 0.15 : 0.2)) {
      this.lastDetectionTime = currentTime;
      return true;
    }
    
    // Usar amplitud de la señal como criterio adicional
    if (this.hasSignificantAmplitude(latestPoints)) {
      this.lastDetectionTime = currentTime;
      return true;
    }
    
    // Mantener detección por un tiempo mucho más largo (15 segundos)
    if (currentTime - this.lastDetectionTime < this.persistenceTime) {
      return true;
    }
    
    return false;
  }

  // MODIFICADO: Umbral adaptativo basado en si ya estábamos detectando
  private detectSignificantChanges(points: PPGDataPoint[], threshold: number = 0.2): boolean {
    if (points.length < 5) return false;
    
    // Calcular la diferencia máxima entre puntos consecutivos
    let maxDiff = 0;
    for (let i = 1; i < points.length; i++) {
      const diff = Math.abs(points[i].value - points[i-1].value);
      maxDiff = Math.max(maxDiff, diff);
    }
    
    // Umbral más bajo para mantener la detección
    return maxDiff > threshold;
  }
  
  // NUEVO: Detector adicional basado en amplitud absoluta de la señal
  private hasSignificantAmplitude(points: PPGDataPoint[]): boolean {
    if (points.length < 3) return false;
    
    // Encontrar valor mínimo y máximo
    let min = Number.MAX_VALUE;
    let max = -Number.MAX_VALUE;
    
    for (const point of points) {
      min = Math.min(min, point.value);
      max = Math.max(max, point.value);
    }
    
    // Si hay una diferencia mínima, detectar como señal válida
    return (max - min) > 0.1;
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
