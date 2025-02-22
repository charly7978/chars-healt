
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

    // Log para debugging
    console.log("VitalSignalProcessor: Análisis", {
      signalBufferLength: this.signalBuffer.length,
      peaksDetected: peaks.length,
      intervals: intervals.length,
      calculatedBPM: bpm,
      confidence: confidence
    });

    return {
      bpm,
      confidence,
      peaks: this.peakBuffer,
      isValid: confidence > 0.5 && bpm >= this.MIN_BPM && bpm <= this.MAX_BPM
    };
  }

  private detectPeaks(): Peak[] {
    const peaks: Peak[] = [];
    const currentTime = Date.now();

    // Actualizar línea base con media móvil
    const recentValues = this.signalBuffer.slice(-10);
    this.baselineValue = recentValues.reduce((a, b) => a + b, 0) / recentValues.length;

    // Usar ventana deslizante para detección de picos
    for (let i = 2; i < this.signalBuffer.length - 2; i++) {
      const window = this.signalBuffer.slice(i - 2, i + 3);
      const centerValue = this.signalBuffer[i];

      // Verificar si es un pico local
      if (this.isPeak(window, centerValue)) {
        const timeSinceLastPeak = currentTime - this.lastPeakTime;
        
        // Verificar distancia mínima entre picos y umbral adaptativo
        if (timeSinceLastPeak > (1000 * this.MIN_PEAK_DISTANCE) / this.SAMPLE_RATE &&
            centerValue > this.baselineValue + this.calculateDynamicThreshold(window)) {
          
          peaks.push({
            timestamp: currentTime,
            value: centerValue,
            interval: timeSinceLastPeak
          });
          
          this.lastPeakTime = currentTime;
          console.log("VitalSignalProcessor: Pico detectado", {
            value: centerValue,
            timeSinceLastPeak,
            threshold: this.baselineValue + this.calculateDynamicThreshold(window)
          });
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

    return isHigherThanNeighbors && centerValue > this.baselineValue + threshold;
  }

  private calculateDynamicThreshold(window: number[]): number {
    const mean = window.reduce((a, b) => a + b, 0) / window.length;
    const variance = window.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / window.length;
    const stdDev = Math.sqrt(variance);

    return stdDev * 1.5; // Umbral adaptativo
  }

  private calculateIntervals(peaks: Peak[]): number[] {
    const intervals: number[] = [];
    
    for (let i = 1; i < peaks.length; i++) {
      const interval = peaks[i].timestamp - peaks[i - 1].timestamp;
      if (interval > 0) { // Solo intervalos positivos
        intervals.push(interval);
      }
    }

    return intervals;
  }

  private calculateBPM(intervals: number[]): { bpm: number; confidence: number } {
    if (intervals.length < 3) {
      return { bpm: 0, confidence: 0 };
    }

    // Filtrar intervalos anómalos usando la mediana
    intervals.sort((a, b) => a - b);
    const medianInterval = intervals[Math.floor(intervals.length / 2)];
    
    // Considerar solo intervalos cercanos a la mediana
    const validIntervals = intervals.filter(interval => {
      const ratio = interval / medianInterval;
      return ratio >= 0.7 && ratio <= 1.3;
    });

    if (validIntervals.length < 3) {
      return { bpm: 0, confidence: 0 };
    }

    // Calcular BPM usando la mediana de los intervalos válidos
    const medianValidInterval = validIntervals[Math.floor(validIntervals.length / 2)];
    const bpm = Math.round(60000 / medianValidInterval);

    // Calcular confianza basada en la consistencia de los intervalos
    const confidence = validIntervals.length / intervals.length;

    // Verificar que el BPM está en un rango razonable
    if (bpm < this.MIN_BPM || bpm > this.MAX_BPM) {
      return { bpm: 0, confidence: 0 };
    }

    console.log("VitalSignalProcessor: BPM calculado", {
      bpm,
      confidence,
      validIntervals: validIntervals.length,
      totalIntervals: intervals.length
    });

    return { bpm, confidence };
  }

  private updatePeakBuffer(newPeaks: Peak[]) {
    this.peakBuffer = [...this.peakBuffer, ...newPeaks]
      .slice(-this.WINDOW_SIZE);
  }
}
