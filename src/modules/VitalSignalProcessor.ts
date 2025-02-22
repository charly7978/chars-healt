
interface Peak {
  timestamp: number;
  value: number;
  interval: number;
}

export class VitalSignalProcessor {
  private readonly SAMPLE_RATE = 30;
  private readonly WINDOW_SIZE = 150;
  private readonly MIN_PEAK_DISTANCE = 15;
  private readonly MAX_BPM = 200;
  private readonly MIN_BPM = 40;
  private readonly MIN_PEAKS_FOR_BPM = 3;

  private signalBuffer: number[] = [];
  private peakBuffer: Peak[] = [];
  private lastPeakTime: number = 0;
  private baselineValue: number = 0;

  constructor() {
    this.reset();
  }

  reset() {
    this.signalBuffer = [];
    this.peakBuffer = [];
    this.lastPeakTime = 0;
    this.baselineValue = 0;
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

    // Detectar picos con el nuevo método mejorado
    const peaks = this.detectPeaks();
    
    // Calcular intervalos entre picos
    const intervals = this.calculateIntervals(peaks);
    
    // Calcular BPM y confianza con el método mejorado
    const { bpm, confidence } = this.calculateBPM(intervals);

    // Actualizar buffer de picos
    this.updatePeakBuffer(peaks);

    console.log("VitalSignalProcessor: Procesamiento completo", {
      signalLength: this.signalBuffer.length,
      peaksDetected: peaks.length,
      bpm,
      confidence
    });

    return {
      bpm,
      confidence,
      peaks: this.peakBuffer,
      isValid: confidence > 0.6 && bpm >= this.MIN_BPM && bpm <= this.MAX_BPM
    };
  }

  private detectPeaks(): Peak[] {
    const peaks: Peak[] = [];
    const currentTime = Date.now();

    // Calcular línea base usando ventana móvil
    const windowSize = 10;
    const recentValues = this.signalBuffer.slice(-windowSize);
    this.baselineValue = recentValues.reduce((a, b) => a + b, 0) / windowSize;

    // Detectar picos usando ventana deslizante mejorada
    for (let i = 2; i < this.signalBuffer.length - 2; i++) {
      const window = this.signalBuffer.slice(i - 2, i + 3);
      const centerValue = this.signalBuffer[i];
      const threshold = this.calculateDynamicThreshold(window);

      if (this.isPeak(window, centerValue, threshold)) {
        const timeSinceLastPeak = currentTime - this.lastPeakTime;
        
        // Verificar distancia mínima entre picos
        if (timeSinceLastPeak > (1000 * this.MIN_PEAK_DISTANCE) / this.SAMPLE_RATE) {
          peaks.push({
            timestamp: currentTime,
            value: centerValue,
            interval: timeSinceLastPeak
          });
          
          this.lastPeakTime = currentTime;
          console.log("VitalSignalProcessor: Pico detectado", {
            value: centerValue,
            timeSinceLastPeak
          });
        }
      }
    }

    return peaks;
  }

  private isPeak(window: number[], centerValue: number, threshold: number): boolean {
    // Verificar si es mayor que los vecinos inmediatos
    const isLocalPeak = window[2] > window[1] && 
                       window[2] > window[3] &&
                       window[2] > window[0] &&
                       window[2] > window[4];

    // Verificar si supera el umbral dinámico
    const exceedsThreshold = centerValue > this.baselineValue + threshold;

    return isLocalPeak && exceedsThreshold;
  }

  private calculateDynamicThreshold(window: number[]): number {
    const mean = window.reduce((a, b) => a + b, 0) / window.length;
    const variance = window.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / window.length;
    const stdDev = Math.sqrt(variance);

    // Umbral adaptativo basado en la variabilidad de la señal
    return stdDev * 1.2;
  }

  private calculateIntervals(peaks: Peak[]): number[] {
    const intervals: number[] = [];
    
    for (let i = 1; i < peaks.length; i++) {
      const interval = peaks[i].timestamp - peaks[i - 1].timestamp;
      if (interval > 0 && interval < 2000) { // Filtrar intervalos irreales
        intervals.push(interval);
      }
    }

    return intervals;
  }

  private calculateBPM(intervals: number[]): { bpm: number; confidence: number } {
    if (intervals.length < this.MIN_PEAKS_FOR_BPM) {
      return { bpm: 0, confidence: 0 };
    }

    // Ordenar intervalos para calcular la mediana
    intervals.sort((a, b) => a - b);
    const medianInterval = intervals[Math.floor(intervals.length / 2)];

    // Filtrar intervalos cercanos a la mediana
    const validIntervals = intervals.filter(interval => {
      const ratio = interval / medianInterval;
      return ratio >= 0.7 && ratio <= 1.3;
    });

    if (validIntervals.length < this.MIN_PEAKS_FOR_BPM) {
      return { bpm: 0, confidence: 0 };
    }

    // Calcular BPM usando la mediana de intervalos válidos
    const avgInterval = validIntervals.reduce((a, b) => a + b, 0) / validIntervals.length;
    const bpm = Math.round(60000 / avgInterval);

    // Calcular confianza basada en la consistencia de los intervalos
    const confidence = validIntervals.length / intervals.length;

    // Validar rango de BPM
    if (bpm < this.MIN_BPM || bpm > this.MAX_BPM) {
      return { bpm: 0, confidence: 0 };
    }

    console.log("VitalSignalProcessor: BPM calculado", {
      bpm,
      confidence,
      validIntervals: validIntervals.length,
      totalIntervals: intervals.length,
      avgInterval
    });

    return { bpm, confidence };
  }

  private updatePeakBuffer(newPeaks: Peak[]) {
    this.peakBuffer = [...this.peakBuffer, ...newPeaks]
      .slice(-this.WINDOW_SIZE);
  }
}
