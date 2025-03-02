export class HeartBeatProcessor {
  // ────────── CONFIGURACIONES PRINCIPALES ──────────
  private readonly SAMPLE_RATE = 30;
  private readonly WINDOW_SIZE = 60;
  private readonly MIN_BPM = 40;
  private readonly MAX_BPM = 200; // Se mantiene amplio para no perder picos fuera de rango
  private readonly SIGNAL_THRESHOLD = 0.40; 
  private readonly MIN_CONFIDENCE = 0.60;
  private readonly DERIVATIVE_THRESHOLD = -0.03; 
  private readonly MIN_PEAK_TIME_MS = 400; 
  private readonly WARMUP_TIME_MS = 3000; 

  // Parámetros de filtrado
  private readonly MEDIAN_FILTER_WINDOW = 3; 
  private readonly MOVING_AVERAGE_WINDOW = 3; 
  private readonly EMA_ALPHA = 0.4; 
  private readonly BASELINE_FACTOR = 1.0; 

  // Parámetros de beep
  private readonly BEEP_PRIMARY_FREQUENCY = 880; 
  private readonly BEEP_SECONDARY_FREQUENCY = 440; 
  private readonly BEEP_DURATION = 80; 
  private readonly BEEP_VOLUME = 0.9; 
  private readonly MIN_BEEP_INTERVAL_MS = 300;

  // ────────── AUTO-RESET SI LA SEÑAL ES MUY BAJA ──────────
  private readonly LOW_SIGNAL_THRESHOLD = 0.03;
  private readonly LOW_SIGNAL_FRAMES = 10;
  private lowSignalCount = 0;

  // Variables internas
  private signalBuffer: number[] = [];
  private medianBuffer: number[] = [];
  private movingAverageBuffer: number[] = [];
  private smoothedValue: number = 0;
  private audioContext: AudioContext | null = null;
  private lastBeepTime = 0;
  private lastPeakTime: number | null = null;
  private previousPeakTime: number | null = null;
  private bpmHistory: number[] = [];
  private baseline: number = 0;
  private lastValue: number = 0;
  private values: number[] = [];
  private startTime: number = 0;
  private peakConfirmationBuffer: number[] = [];
  private lastConfirmedPeak: boolean = false;
  private smoothBPM: number = 0;
  private readonly BPM_ALPHA = 0.2;
  private peakCandidateIndex: number | null = null;
  private peakCandidateValue: number = 0;

  // Nuevo: Para almacenar amplitudes de picos para detección de arritmias
  private peakAmplitudes: number[] = [];
  private arrhythmiaCount = 0;

  constructor() {
    this.startTime = Date.now();
    this.initAudio();
    console.log("HeartBeatProcessor: Instancia creada");
  }

  private async initAudio() {
    try {
      // Intentar inicializar el audio context solo si es necesario
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    } catch (e) {
      console.log("Audio no disponible:", e);
    }
  }

  private async playBeep(volume: number = this.BEEP_VOLUME) {
    if (!this.audioContext) {
      return;
    }
    
    const currentTime = Date.now();
    if (currentTime - this.lastBeepTime < this.MIN_BEEP_INTERVAL_MS) {
      return;
    }
    
    this.lastBeepTime = currentTime;
    
    try {
      const oscillator = this.audioContext.createOscillator();
      const gainNode = this.audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(this.audioContext.destination);
      
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(this.BEEP_PRIMARY_FREQUENCY, this.audioContext.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(
        this.BEEP_SECONDARY_FREQUENCY,
        this.audioContext.currentTime + this.BEEP_DURATION / 1000
      );
      
      gainNode.gain.setValueAtTime(volume, this.audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(
        0.01,
        this.audioContext.currentTime + this.BEEP_DURATION / 1000
      );
      
      oscillator.start();
      oscillator.stop(this.audioContext.currentTime + this.BEEP_DURATION / 1000);
    } catch (e) {
      console.log("Error reproduciendo sonido:", e);
    }
  }

  private isInWarmup(): boolean {
    return Date.now() - this.startTime < this.WARMUP_TIME_MS;
  }

  private medianFilter(value: number): number {
    this.medianBuffer.push(value);
    
    if (this.medianBuffer.length > this.MEDIAN_FILTER_WINDOW) {
      this.medianBuffer.shift();
    }
    
    const sortedBuffer = [...this.medianBuffer].sort((a, b) => a - b);
    return sortedBuffer[Math.floor(sortedBuffer.length / 2)];
  }

  private calculateMovingAverage(value: number): number {
    this.movingAverageBuffer.push(value);
    
    if (this.movingAverageBuffer.length > this.MOVING_AVERAGE_WINDOW) {
      this.movingAverageBuffer.shift();
    }
    
    return this.movingAverageBuffer.reduce((sum, val) => sum + val, 0) / this.movingAverageBuffer.length;
  }

  private calculateEMA(value: number): number {
    this.smoothedValue = this.EMA_ALPHA * value + (1 - this.EMA_ALPHA) * this.smoothedValue;
    return this.smoothedValue;
  }

  public processSignal(value: number): {
    bpm: number;
    confidence: number;
    isPeak: boolean;
    filteredValue: number;
    arrhythmiaCount: number;
  } {
    // Aplicar filtros para mejorar la señal
    const medianFiltered = this.medianFilter(value);
    const movingAverage = this.calculateMovingAverage(medianFiltered);
    const filteredValue = this.calculateEMA(movingAverage);
    
    // Actualizar historial de valores
    this.values.push(filteredValue);
    if (this.values.length > this.WINDOW_SIZE) {
      this.values.shift();
    }
    
    // Actualizar la línea base
    if (this.values.length >= 10) {
      // Usar solo valores altos para la línea base
      const sortedValues = [...this.values].sort((a, b) => b - a);
      const topValues = sortedValues.slice(0, Math.floor(sortedValues.length * 0.3));
      this.baseline = topValues.reduce((sum, val) => sum + val, 0) / topValues.length * this.BASELINE_FACTOR;
    }
    
    // Verificar calidad de la señal
    this.autoResetIfSignalIsLow(filteredValue);
    
    // Normalizar valor
    const normalizedValue = Math.max(0, filteredValue - this.baseline);
    
    // Calcular derivada para detectar picos
    const derivative = filteredValue - this.lastValue;
    this.lastValue = filteredValue;
    
    // Detectar pico basado en cruce de umbral y derivada negativa
    const { isPeak, confidence } = this.detectPeak(normalizedValue, derivative);
    
    // Procesar el pico para confirmar que es válido
    const confirmedPeak = this.confirmPeak(isPeak, normalizedValue, confidence);
    
    // Si es un pico confirmado, actualizar tiempos y calcular BPM
    if (confirmedPeak) {
      this.previousPeakTime = this.lastPeakTime;
      this.lastPeakTime = Date.now();
      
      // IMPORTANTE: Almacenar la amplitud del pico para análisis de arritmias
      this.peakAmplitudes.push(normalizedValue);
      if (this.peakAmplitudes.length > 10) {
        this.peakAmplitudes.shift();
      }
      
      this.updateBPM();
      this.playBeep(Math.min(1.0, confidence + 0.4));
    }
    
    // Obtener BPM suavizado
    const finalBPM = this.getSmoothBPM();
    
    return {
      bpm: finalBPM,
      confidence: confidence,
      isPeak: confirmedPeak,
      filteredValue: filteredValue,
      arrhythmiaCount: this.arrhythmiaCount
    };
  }

  private autoResetIfSignalIsLow(amplitude: number) {
    if (amplitude < this.LOW_SIGNAL_THRESHOLD) {
      this.lowSignalCount++;
      if (this.lowSignalCount > this.LOW_SIGNAL_FRAMES) {
        this.resetDetectionStates();
      }
    } else {
      this.lowSignalCount = 0;
    }
  }

  private resetDetectionStates() {
    this.lastPeakTime = null;
    this.previousPeakTime = null;
    this.bpmHistory = [];
    this.smoothBPM = 0;
    this.lastConfirmedPeak = false;
    this.peakConfirmationBuffer = [];
    this.peakCandidateIndex = null;
    this.peakCandidateValue = 0;
    this.lowSignalCount = 0;
  }

  private detectPeak(normalizedValue: number, derivative: number): {
    isPeak: boolean;
    confidence: number;
  } {
    // Durante el periodo de calentamiento, no detectar picos
    if (this.isInWarmup()) {
      return { isPeak: false, confidence: 0 };
    }
    
    // Umbral de señal mínimo para detectar picos
    if (normalizedValue < this.SIGNAL_THRESHOLD) {
      return { isPeak: false, confidence: 0 };
    }
    
    // Detectar pico cuando la derivada cruza por debajo del umbral (pendiente negativa)
    const isPotentialPeak = derivative < this.DERIVATIVE_THRESHOLD;
    
    // Verificar tiempo mínimo entre picos para evitar falsas detecciones
    let timeCheck = true;
    if (this.lastPeakTime !== null) {
      const timeSinceLastPeak = Date.now() - this.lastPeakTime;
      const minTimeMs = 60000 / this.MAX_BPM; // Tiempo mínimo basado en MAX_BPM
      timeCheck = timeSinceLastPeak > minTimeMs;
    }
    
    // Calcular confianza basada en la amplitud y la pendiente
    let confidence = Math.min(1.0, normalizedValue * 2) * 0.7 + 
                    Math.min(1.0, Math.abs(derivative) * 10) * 0.3;
    
    // Solo considerar como pico si cumple todos los criterios
    const isPeak = isPotentialPeak && timeCheck && confidence >= this.MIN_CONFIDENCE;
    
    return { isPeak, confidence };
  }

  private confirmPeak(
    isPeak: boolean,
    normalizedValue: number,
    confidence: number
  ): boolean {
    // Si no es un candidato a pico, actualizar buffer y salir
    if (!isPeak) {
      this.peakConfirmationBuffer.push({ value: normalizedValue, isPeak: false });
      if (this.peakConfirmationBuffer.length > 5) {
        this.peakConfirmationBuffer.shift();
      }
      return false;
    }
    
    // Encontrar el valor máximo cercano para confirmar el verdadero pico
    if (this.peakCandidateIndex === null || normalizedValue > this.peakCandidateValue) {
      this.peakCandidateIndex = this.peakConfirmationBuffer.length;
      this.peakCandidateValue = normalizedValue;
    }
    
    // Agregar el punto actual al buffer
    this.peakConfirmationBuffer.push({ value: normalizedValue, isPeak: true });
    
    // Mantener tamaño del buffer
    if (this.peakConfirmationBuffer.length > 5) {
      this.peakConfirmationBuffer.shift();
      if (this.peakCandidateIndex !== null) {
        this.peakCandidateIndex--;
      }
    }
    
    // Verificar si hemos pasado el pico (valor empieza a descender)
    if (this.peakConfirmationBuffer.length >= 3 && 
        this.peakCandidateIndex !== null && 
        this.peakCandidateIndex < this.peakConfirmationBuffer.length - 1) {
      
      // Confirmar el pico y reiniciar
      const confirmedPeak = true;
      this.peakCandidateIndex = null;
      this.peakCandidateValue = 0;
      this.lastConfirmedPeak = true;
      return confirmedPeak;
    }
    
    return false;
  }

  private updateBPM() {
    // Solo actualizar BPM si tenemos dos picos consecutivos
    if (this.previousPeakTime !== null && this.lastPeakTime !== null) {
      const interval = this.lastPeakTime - this.previousPeakTime;
      
      // Convertir a BPM
      if (interval > 0) {
        const instantBPM = 60000 / interval;
        
        // Solo aceptar valores dentro del rango fisiológico
        if (instantBPM >= this.MIN_BPM && instantBPM <= this.MAX_BPM) {
          this.bpmHistory.push(instantBPM);
          if (this.bpmHistory.length > 5) {
            this.bpmHistory.shift();
          }
        }
      }
    }
  }

  private getSmoothBPM(): number {
    // Si no hay suficiente historia, usar el cálculo directo
    if (this.bpmHistory.length === 0) {
      return this.calculateCurrentBPM();
    }
    
    // Calcular promedio de los últimos valores para estabilidad
    const avgBPM = this.bpmHistory.reduce((sum, bpm) => sum + bpm, 0) / this.bpmHistory.length;
    
    // Aplicar suavizado exponencial
    if (this.smoothBPM === 0) {
      this.smoothBPM = avgBPM;
    } else {
      this.smoothBPM = this.BPM_ALPHA * avgBPM + (1 - this.BPM_ALPHA) * this.smoothBPM;
    }
    
    return Math.round(this.smoothBPM);
  }

  private calculateCurrentBPM(): number {
    // Si no hay picos detectados, retornar 0
    if (this.lastPeakTime === null || this.previousPeakTime === null) {
      return 0;
    }
    
    // Calcular BPM basado en el último intervalo
    const interval = this.lastPeakTime - this.previousPeakTime;
    if (interval <= 0) return 0;
    
    const instantBPM = 60000 / interval;
    
    // Verificar que está dentro del rango fisiológico
    if (instantBPM >= this.MIN_BPM && instantBPM <= this.MAX_BPM) {
      return Math.round(instantBPM);
    }
    
    return 0;
  }

  public getFinalBPM(): number {
    const currentBPM = this.getSmoothBPM();
    
    // Si no hay lecturas de BPM, comprobar si hay suficiente historia
    if (currentBPM === 0 && this.bpmHistory.length > 0) {
      // Usar el promedio de la historia reciente
      return Math.round(
        this.bpmHistory.reduce((sum, bpm) => sum + bpm, 0) / this.bpmHistory.length
      );
    }
    
    return currentBPM;
  }

  public reset() {
    this.signalBuffer = [];
    this.medianBuffer = [];
    this.movingAverageBuffer = [];
    this.smoothedValue = 0;
    this.lastBeepTime = 0;
    this.lastPeakTime = null;
    this.previousPeakTime = null;
    this.bpmHistory = [];
    this.baseline = 0;
    this.lastValue = 0;
    this.values = [];
    this.startTime = Date.now();
    this.peakConfirmationBuffer = [];
    this.lastConfirmedPeak = false;
    this.smoothBPM = 0;
    this.peakCandidateIndex = null;
    this.peakCandidateValue = 0;
    this.lowSignalCount = 0;
    
    // Resetear datos de arritmias
    this.peakAmplitudes = [];
    this.arrhythmiaCount = 0;
    
    console.log("HeartBeatProcessor: Reset completo");
  }

  public getRRIntervals(): { intervals: number[]; lastPeakTime: number | null; amplitudes?: number[] } {
    // Si no hay picos detectados o solo uno, no hay RR intervals
    if (this.lastPeakTime === null || this.previousPeakTime === null) {
      return { intervals: [], lastPeakTime: this.lastPeakTime, amplitudes: [] };
    }
    
    // Crear array de RR intervals basado en el historial de BPM
    // Calculando los intervalos correspondientes
    const intervals = this.bpmHistory.map(bpm => Math.round(60000 / bpm));
    
    // CRUCIAL: Incluir las amplitudes de los picos para detección de arritmias
    return { 
      intervals, 
      lastPeakTime: this.lastPeakTime,
      amplitudes: this.peakAmplitudes
    };
  }
}
