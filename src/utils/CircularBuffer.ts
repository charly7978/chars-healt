
interface PPGDataPoint {
  time: number;
  value: number;
  isArrhythmia: boolean;
  isWaveStart?: boolean; // Make this optional to handle old data
}

export class CircularBuffer {
  private buffer: PPGDataPoint[];
  private maxSize: number;
  private fingerDetectionThreshold: number = 0.01; // MODIFICACIÓN: Umbral extremadamente bajo
  private lastDetectionTime: number = 0;
  private detectionHysteresis: number = 0.02; // MODIFICACIÓN: Histéresis reducida
  private persistenceTime: number = 30000; // NUEVA: Duración extrema de 30 segundos de persistencia
  private detectionCounter: number = 0; // Nuevo contador de detección continua

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
    this.detectionCounter = 0;
  }

  // Reescrita completamente para mantener detección casi permanente
  isFingerDetected(recentPoints: number = 5): boolean {
    // Si no hay suficientes puntos, no podemos detectar nada
    if (this.buffer.length < 3) return false;
    
    const currentTime = Date.now();
    
    // Verificar si ya estábamos en modo de detección
    const wasDetected = currentTime - this.lastDetectionTime < this.persistenceTime;
    
    // Siempre detectar después de acumular algunos puntos (casi inmediato)
    if (this.buffer.length >= 5 && this.detectionCounter < 10) {
      this.detectionCounter++;
      this.lastDetectionTime = currentTime;
      return true;
    }
    
    // Tomar los últimos puntos para análisis
    const latestPoints = this.buffer.slice(-Math.min(recentPoints, this.buffer.length));
    
    // 1. Detector por varianza (extremadamente sensible)
    const signalVariance = this.calculateVariance(latestPoints.map(p => p.value));
    if (signalVariance > 0.0001) { // Umbral ultra sensible
      this.lastDetectionTime = currentTime;
      this.detectionCounter += 5;
      return true;
    }
    
    // 2. Detector por cambios entre puntos (aún más sensible)
    if (this.detectMinimalChanges(latestPoints)) {
      this.lastDetectionTime = currentTime;
      this.detectionCounter += 3;
      return true;
    }
    
    // 3. Detector por amplitud absoluta (prácticamente cualquier señal no plana)
    if (this.hasMinimalAmplitude(latestPoints)) {
      this.lastDetectionTime = currentTime;
      this.detectionCounter += 2;
      return true;
    }
    
    // 4. Persistencia extremadamente larga (30 segundos)
    if (wasDetected) {
      // Decrementar contador pero mantener detección
      this.detectionCounter = Math.max(0, this.detectionCounter - 1);
      return true;
    }
    
    // Reiniciar contador si no se detecta nada
    this.detectionCounter = 0;
    return false;
  }

  // Modificado para detectar cambios mínimos entre puntos consecutivos
  private detectMinimalChanges(points: PPGDataPoint[]): boolean {
    if (points.length < 2) return false;
    
    // Detectar cualquier cambio mayor a 0.001 entre puntos consecutivos
    for (let i = 1; i < points.length; i++) {
      const diff = Math.abs(points[i].value - points[i-1].value);
      if (diff > 0.001) { // Umbral extremadamente bajo
        return true;
      }
    }
    
    return false;
  }
  
  // Modificado para detectar cualquier mínima variación de amplitud
  private hasMinimalAmplitude(points: PPGDataPoint[]): boolean {
    if (points.length < 2) return false;
    
    // Encontrar valor mínimo y máximo
    let min = Number.MAX_VALUE;
    let max = -Number.MAX_VALUE;
    
    for (const point of points) {
      min = Math.min(min, point.value);
      max = Math.max(max, point.value);
    }
    
    // Cualquier diferencia mayor a 0.005 se considera señal válida
    return (max - min) > 0.005;
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
