
interface Peak {
  timestamp: number;
  value: number;
  interval: number;
}

export class VitalSignalProcessor {
  private readonly SAMPLE_RATE = 30;
  private readonly WINDOW_SIZE = 90; // Reducido para mayor sensibilidad
  private readonly MIN_PEAK_DISTANCE = 12; // Ajustado para permitir BPM más altos
  private readonly MAX_BPM = 200;
  private readonly MIN_BPM = 40;
  private readonly MIN_PEAKS_FOR_BPM = 2; // Reducido para detección más rápida

  private signalBuffer: number[] = [];
  private peakBuffer: Peak[] = [];
  private lastPeakTime: number = 0;
  private baselineValue: number = 0;
  private lastValidBPM: number = 0;

  constructor() {
    this.reset();
  }

  reset() {
    this.signalBuffer = [];
    this.peakBuffer = [];
    this.lastPeakTime = 0;
    this.baselineValue = 0;
    this.lastValidBPM = 0;
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

    // Necesitamos al menos 1 segundo de datos
    if (this.signalBuffer.length < 30) {
      return { bpm: 0, confidence: 0, peaks: [], isValid: false };
    }

    // Normalizar señal
    const normalizedSignal = this.normalizeSignal(this.signalBuffer);
    
    // Detectar picos
    const peaks = this.detectPeaks(normalizedSignal);
    
    // Calcular intervalos entre picos
    const intervals = this.calculateIntervals(peaks);
    
    // Calcular BPM y confianza
    const { bpm, confidence } = this.calculateBPM(intervals);

    // Actualizar buffer de picos
    this.updatePeakBuffer(peaks);

    console.log("VitalSignalProcessor: Análisis de señal", {
      signalLength: this.signalBuffer.length,
      normalizedLength: normalizedSignal.length,
      peaksDetected: peaks.length,
      intervals: intervals.length,
      bpm,
      confidence
    });

    const isValid = confidence > 0.5 && bpm >= this.MIN_BPM && bpm <= this.MAX_BPM;
    if (isValid) {
      this.lastValidBPM = bpm;
    }

    return {
      bpm: isValid ? bpm : this.lastValidBPM,
      confidence,
      peaks: this.peakBuffer,
      isValid
    };
  }

  private normalizeSignal(signal: number[]): number[] {
    if (signal.length < 2) return signal;
    
    const min = Math.min(...signal);
    const max = Math.max(...signal);
    const range = max - min;
    
    return signal.map(value => range > 0 ? (value - min) / range : value);
  }

  private detectPeaks(normalizedSignal: number[]): Peak[] {
    const peaks: Peak[] = [];
    const currentTime = Date.now();

    // Calcular línea base usando media móvil
    const windowSize = 5;
    const baselineValues = normalizedSignal.slice(-windowSize);
    this.baselineValue = baselineValues.reduce((a, b) => a + b, 0) / windowSize;

    // Detectar picos
    for (let i = 2; i < normalizedSignal.length - 2; i++) {
      const window = normalizedSignal.slice(i - 2, i + 3);
      const threshold = this.calculateDynamicThreshold(window);

      if (this.isPeak(window, normalizedSignal[i], threshold)) {
        const timeSinceLastPeak = currentTime - this.lastPeakTime;
        
        // Verificar distancia mínima entre picos
        if (timeSinceLastPeak > (1000 * this.MIN_PEAK_DISTANCE) / this.SAMPLE_RATE) {
          peaks.push({
            timestamp: currentTime,
            value: normalizedSignal[i],
            interval: timeSinceLastPeak
          });
          
          this.lastPeakTime = currentTime;
          console.log("VitalSignalProcessor: Pico detectado", {
            value: normalizedSignal[i],
            timeSinceLastPeak,
            threshold
          });
        }
      }
    }

    return peaks;
  }

  private isPeak(window: number[], centerValue: number, threshold: number): boolean {
    const isLocalPeak = centerValue > window[1] && 
                       centerValue > window[3] &&
                       centerValue > window[0] &&
                       centerValue > window[4];

    const exceedsThreshold = centerValue > this.baselineValue + threshold;

    return isLocalPeak && exceedsThreshold;
  }

  private calculateDynamicThreshold(window: number[]): number {
    const mean = window.reduce((a, b) => a + b, 0) / window.length;
    const variance = window.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / window.length;
    const stdDev = Math.sqrt(variance);

    return stdDev * 0.8; // Reducido para mayor sensibilidad
  }

  private calculateIntervals(peaks: Peak[]): number[] {
    const intervals: number[] = [];
    
    for (let i = 1; i < peaks.length; i++) {
      const interval = peaks[i].timestamp - peaks[i - 1].timestamp;
      if (interval > 200 && interval < 1500) { // Filtrar intervalos irreales
        intervals.push(interval);
      }
    }

    return intervals;
  }

  private calculateBPM(intervals: number[]): { bpm: number; confidence: number } {
    if (intervals.length < this.MIN_PEAKS_FOR_BPM) {
      return { bpm: 0, confidence: 0 };
    }

    // Usar la mediana para mayor estabilidad
    intervals.sort((a, b) => a - b);
    const medianInterval = intervals[Math.floor(intervals.length / 2)];

    // Filtrar intervalos cercanos a la mediana
    const validIntervals = intervals.filter(interval => {
      const ratio = interval / medianInterval;
      return ratio >= 0.8 && ratio <= 1.2;
    });

    if (validIntervals.length < this.MIN_PEAKS_FOR_BPM) {
      return { bpm: 0, confidence: 0 };
    }

    // Calcular BPM usando la media de intervalos válidos
    const avgInterval = validIntervals.reduce((a, b) => a + b, 0) / validIntervals.length;
    const bpm = Math.round(60000 / avgInterval);

    // Calcular confianza
    const confidence = validIntervals.length / intervals.length;

    console.log("VitalSignalProcessor: BPM calculado", {
      bpm,
      confidence,
      validIntervals: validIntervals.length,
      totalIntervals: intervals.length,
      avgInterval
    });

    return { 
      bpm: bpm >= this.MIN_BPM && bpm <= this.MAX_BPM ? bpm : 0,
      confidence 
    };
  }

  private updatePeakBuffer(newPeaks: Peak[]) {
    this.peakBuffer = [...this.peakBuffer, ...newPeaks].slice(-this.WINDOW_SIZE);
  }
}
