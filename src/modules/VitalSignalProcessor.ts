
interface Peak {
  timestamp: number;
  value: number;
  interval: number;
}

export class VitalSignalProcessor {
  private readonly SAMPLE_RATE = 30; // Frecuencia de muestreo típica de cámaras (30 FPS)
  private readonly WINDOW_SIZE = 150; // 5 segundos de datos a 30 FPS
  private readonly MIN_PEAK_DISTANCE = 15; // Mínimo 0.5 segundos entre picos a 30 FPS
  private readonly MAX_BPM = 200;
  private readonly MIN_BPM = 40;

  private signalBuffer: number[] = [];
  private peakBuffer: Peak[] = [];
  private lastPeakTime: number = 0;
  private baselineValue: number = 0;
  private lastUpdateTime: number = 0;

  constructor() {
    this.reset();
  }

  reset() {
    this.signalBuffer = [];
    this.peakBuffer = [];
    this.lastPeakTime = 0;
    this.baselineValue = 0;
    this.lastUpdateTime = 0;
  }

  processSignal(value: number): {
    bpm: number;
    confidence: number;
    peaks: Peak[];
    isValid: boolean;
  } {
    const currentTime = Date.now();
    
    // Agregar nuevo valor al buffer
    this.signalBuffer.push(value);
    
    // Mantener tamaño de ventana fijo
    if (this.signalBuffer.length > this.WINDOW_SIZE) {
      this.signalBuffer.shift();
    }

    // Necesitamos al menos 2 segundos de datos
    if (this.signalBuffer.length < 60) {
      return { bpm: 0, confidence: 0, peaks: [], isValid: false };
    }

    // Detectar picos
    const peaks = this.detectPeaks();
    
    // Calcular intervalos entre picos
    const intervals = this.calculateIntervals(peaks);
    
    // Calcular BPM y confianza
    const { bpm, confidence } = this.calculateBPM(intervals);

    // Actualizar buffer de picos
    this.updatePeakBuffer(peaks);

    return {
      bpm,
      confidence,
      peaks: this.peakBuffer,
      isValid: confidence > 0.5
    };
  }

  private detectPeaks(): Peak[] {
    const peaks: Peak[] = [];
    const currentTime = Date.now();

    // Usar ventana deslizante para detección de picos
    for (let i = 2; i < this.signalBuffer.length - 2; i++) {
      const window = this.signalBuffer.slice(i - 2, i + 3);
      const centerValue = this.signalBuffer[i];

      // Verificar si es un pico local
      if (this.isPeak(window, centerValue)) {
        const timeSinceLastPeak = currentTime - this.lastPeakTime;
        
        // Verificar distancia mínima entre picos
        if (timeSinceLastPeak > (1000 * this.MIN_PEAK_DISTANCE) / this.SAMPLE_RATE) {
          peaks.push({
            timestamp: currentTime,
            value: centerValue,
            interval: timeSinceLastPeak
          });
          this.lastPeakTime = currentTime;
        }
      }
    }

    return peaks;
  }

  private isPeak(window: number[], centerValue: number): boolean {
    // Implementar detección de picos más robusta
    const threshold = this.calculateDynamicThreshold(window);
    const isHigherThanNeighbors = window.every((val, idx) => {
      if (idx === 2) return true; // Centro
      return centerValue > val;
    });

    return isHigherThanNeighbors && centerValue > threshold;
  }

  private calculateDynamicThreshold(window: number[]): number {
    const mean = window.reduce((a, b) => a + b, 0) / window.length;
    const variance = window.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / window.length;
    const stdDev = Math.sqrt(variance);

    return mean + stdDev * 1.5; // Umbral adaptativo
  }

  private calculateIntervals(peaks: Peak[]): number[] {
    const intervals: number[] = [];
    
    for (let i = 1; i < peaks.length; i++) {
      const interval = peaks[i].timestamp - peaks[i - 1].timestamp;
      intervals.push(interval);
    }

    return intervals;
  }

  private calculateBPM(intervals: number[]): { bpm: number; confidence: number } {
    if (intervals.length < 3) {
      return { bpm: 0, confidence: 0 };
    }

    // Filtrar intervalos anómalos
    const validIntervals = intervals.filter(interval => {
      const bpm = 60000 / interval;
      return bpm >= this.MIN_BPM && bpm <= this.MAX_BPM;
    });

    if (validIntervals.length < 3) {
      return { bpm: 0, confidence: 0 };
    }

    // Calcular media y desviación estándar
    const mean = validIntervals.reduce((a, b) => a + b, 0) / validIntervals.length;
    const variance = validIntervals.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / validIntervals.length;
    const stdDev = Math.sqrt(variance);

    // Calcular BPM
    const bpm = Math.round(60000 / mean);

    // Calcular confianza basada en la variabilidad
    const coefficientOfVariation = stdDev / mean;
    const confidence = Math.max(0, Math.min(1, 1 - coefficientOfVariation));

    return {
      bpm: bpm,
      confidence: confidence
    };
  }

  private updatePeakBuffer(newPeaks: Peak[]) {
    this.peakBuffer = [...this.peakBuffer, ...newPeaks]
      .slice(-this.WINDOW_SIZE);
  }
}

