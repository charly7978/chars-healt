
interface PPGDataPoint {
  time: number;
  value: number;
  isArrhythmia: boolean;
  isWaveStart?: boolean; // Make this optional to handle old data
}

export class CircularBuffer {
  private buffer: PPGDataPoint[];
  private maxSize: number;
  private fingerDetectionThreshold: number = 0.00001; // MODIFICACIÓN: Umbral casi nulo
  private lastDetectionTime: number = 0;
  private detectionHysteresis: number = 0.00001; // MODIFICACIÓN: Histéresis mínima
  private persistenceTime: number = 60000; // NUEVA: Duración de 60 segundos de persistencia
  private detectionCounter: number = 0; // Contador de detección continua
  private isCurrentlyDetected: boolean = false; // Estado de detección

  constructor(size: number) {
    this.buffer = [];
    this.maxSize = size;
  }

  push(point: PPGDataPoint): void {
    this.buffer.push(point);
    if (this.buffer.length > this.maxSize) {
      this.buffer.shift();
    }
    
    // Revisar detección inmediatamente al recibir datos
    if (this.buffer.length > 3) {
      this.isCurrentlyDetected = this.checkFingerDetection();
    }
  }

  getPoints(): PPGDataPoint[] {
    return [...this.buffer];
  }

  clear(): void {
    this.buffer = [];
    this.lastDetectionTime = 0;
    this.detectionCounter = 0;
    this.isCurrentlyDetected = false;
  }

  // Método principal de detección
  isFingerDetected(): boolean {
    // Si no hay suficientes puntos, pero ya teníamos detección, mantener
    if (this.buffer.length < 3) {
      return this.isCurrentlyDetected || false;
    }
    
    // Verificar si estamos dentro del período de persistencia
    const currentTime = Date.now();
    if (currentTime - this.lastDetectionTime < this.persistenceTime) {
      this.isCurrentlyDetected = true;
      return true;
    }
    
    // Si el contador de detección es alto, devolver true automáticamente
    if (this.detectionCounter > 5) {
      this.isCurrentlyDetected = true;
      return true;
    }
    
    // Verificar con los algoritmos de detección
    const detected = this.checkFingerDetection();
    
    // Actualizar el estado y el contador según el resultado
    if (detected) {
      this.isCurrentlyDetected = true;
      this.lastDetectionTime = currentTime;
      this.detectionCounter = Math.min(20, this.detectionCounter + 1);
    } else {
      this.detectionCounter = Math.max(0, this.detectionCounter - 0.1);
      // Solo cambiar a no detectado si el contador llega a cero
      if (this.detectionCounter <= 0) {
        this.isCurrentlyDetected = false;
      }
    }
    
    return this.isCurrentlyDetected;
  }
  
  // Comprobación exhaustiva de detección usando múltiples algoritmos
  private checkFingerDetection(): boolean {
    // 1. Detectar cualquier cambio mínimo entre puntos
    if (this.detectAnyChange()) {
      return true;
    }
    
    // 2. Detectar por promedio absoluto (cualquier señal no nula)
    if (this.hasNonZeroSignal()) {
      return true;
    }
    
    // 3. Detectar por varianza (cualquier variabilidad)
    if (this.hasMinimalVariance()) {
      return true;
    }
    
    // 4. Detectar por pendiente (cualquier tendencia)
    if (this.hasMinimalSlope()) {
      return true;
    }
    
    // 5. Último recurso: detectar si hay más de X puntos con valores absolutos mayores a Y
    if (this.hasSignificantPoints()) {
      return true;
    }
    
    return false;
  }

  // Detecta CUALQUIER cambio entre puntos consecutivos
  private detectAnyChange(): boolean {
    const recentPoints = this.buffer.slice(-Math.min(5, this.buffer.length));
    
    for (let i = 1; i < recentPoints.length; i++) {
      const diff = Math.abs(recentPoints[i].value - recentPoints[i-1].value);
      if (diff > 0.00001) { // Umbral extremadamente bajo
        return true;
      }
    }
    
    return false;
  }
  
  // Detecta si la señal no es nula
  private hasNonZeroSignal(): boolean {
    const recentPoints = this.buffer.slice(-Math.min(10, this.buffer.length));
    
    const avgSignal = recentPoints.reduce((sum, p) => sum + Math.abs(p.value), 0) / recentPoints.length;
    return avgSignal > 0.00001; // Umbral extremadamente bajo
  }
  
  // Detecta variabilidad mínima
  private hasMinimalVariance(): boolean {
    const recentPoints = this.buffer.slice(-Math.min(15, this.buffer.length));
    const values = recentPoints.map(p => p.value);
    
    const variance = this.calculateVariance(values);
    return variance > 0.0000001; // Umbral extremadamente bajo
  }
  
  // Detecta pendiente mínima (tendencia)
  private hasMinimalSlope(): boolean {
    const recentPoints = this.buffer.slice(-Math.min(20, this.buffer.length));
    
    if (recentPoints.length < 3) return false;
    
    let sumSlope = 0;
    for (let i = 1; i < recentPoints.length; i++) {
      sumSlope += Math.abs(recentPoints[i].value - recentPoints[i-1].value);
    }
    
    const avgSlope = sumSlope / (recentPoints.length - 1);
    return avgSlope > 0.000001; // Umbral extremadamente bajo
  }
  
  // Detecta si hay puntos significativos
  private hasSignificantPoints(): boolean {
    const recentPoints = this.buffer.slice(-Math.min(30, this.buffer.length));
    
    // Contar cuántos puntos tienen un valor absoluto mayor al umbral
    const significantPoints = recentPoints.filter(p => Math.abs(p.value) > 0.001);
    return significantPoints.length > 2; // Solo necesitamos unos pocos puntos
  }

  // Método para calcular la varianza
  private calculateVariance(values: number[]): number {
    if (values.length < 2) return 0;
    
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const squaredDiffs = values.map(val => Math.pow(val - mean, 2));
    return squaredDiffs.reduce((sum, val) => sum + val, 0) / values.length;
  }
}

export type { PPGDataPoint };
