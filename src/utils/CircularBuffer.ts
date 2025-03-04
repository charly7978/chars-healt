
interface PPGDataPoint {
  time: number;
  value: number;
  isArrhythmia: boolean;
  isWaveStart?: boolean;
}

export class CircularBuffer {
  private buffer: PPGDataPoint[];
  private maxSize: number;
  private detectionThreshold: number = 0.00001;
  private lastDetectionTime: number = 0;
  private persistenceTime: number = 45000; // 45 segundos de persistencia
  private isFingerCurrentlyDetected: boolean = false;

  constructor(size: number) {
    this.buffer = [];
    this.maxSize = size;
  }

  push(point: PPGDataPoint): void {
    this.buffer.push(point);
    if (this.buffer.length > this.maxSize) {
      this.buffer.shift();
    }
    
    // Actualizar estado de detección
    if (this.buffer.length > 3) {
      this.isFingerCurrentlyDetected = this.detectFinger();
    }
  }

  getPoints(): PPGDataPoint[] {
    return [...this.buffer];
  }

  clear(): void {
    this.buffer = [];
    this.lastDetectionTime = 0;
    this.isFingerCurrentlyDetected = false;
  }

  isFingerDetected(): boolean {
    // Si no hay suficientes puntos, mantener detección actual
    if (this.buffer.length < 3) {
      return this.isFingerCurrentlyDetected;
    }
    
    // Verificar persistencia de tiempo
    const currentTime = Date.now();
    if (currentTime - this.lastDetectionTime < this.persistenceTime) {
      return true;
    }
    
    // Detectar con algoritmo simplificado
    const detected = this.detectFinger();
    
    if (detected) {
      this.lastDetectionTime = currentTime;
      this.isFingerCurrentlyDetected = true;
    }
    
    return this.isFingerCurrentlyDetected;
  }
  
  private detectFinger(): boolean {
    // Método 1: Detectar cambios en la señal
    if (this.hasSignalChange()) {
      return true;
    }
    
    // Método 2: Detectar señal no nula
    if (this.hasNonZeroSignal()) {
      return true;
    }
    
    return false;
  }

  private hasSignalChange(): boolean {
    const recentPoints = this.buffer.slice(-Math.min(5, this.buffer.length));
    
    for (let i = 1; i < recentPoints.length; i++) {
      const diff = Math.abs(recentPoints[i].value - recentPoints[i-1].value);
      if (diff > this.detectionThreshold) {
        return true;
      }
    }
    
    return false;
  }
  
  private hasNonZeroSignal(): boolean {
    const recentPoints = this.buffer.slice(-Math.min(10, this.buffer.length));
    const avgSignal = recentPoints.reduce((sum, p) => sum + Math.abs(p.value), 0) / recentPoints.length;
    return avgSignal > this.detectionThreshold;
  }
}

export type { PPGDataPoint };
