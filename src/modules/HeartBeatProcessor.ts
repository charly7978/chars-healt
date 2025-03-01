export class HeartBeatProcessor {
  // ────────── CONFIGURACIONES PRINCIPALES ──────────
  private readonly SAMPLE_RATE = 30;
  private readonly WINDOW_SIZE = 60;
  private readonly MIN_BPM = 40;
  private readonly MAX_BPM = 200; // Se mantiene amplio para no perder picos fuera de rango
  private readonly SIGNAL_THRESHOLD = 0.25; // Reducido para mejorar sensibilidad
  private readonly MIN_CONFIDENCE = 0.55; // Reducido para detectar más picos
  private readonly DERIVATIVE_THRESHOLD = 0.035; // Ajustado para mejor detección de subidas
  private readonly MIN_PEAK_TIME_MS = 300; // Reducido para detectar frecuencias más altas
  private readonly WARMUP_TIME_MS = 2000; // Reducido tiempo de calentamiento

  // Parámetros de filtrado
  private readonly MEDIAN_FILTER_WINDOW = 3; 
  private readonly MOVING_AVERAGE_WINDOW = 5; // Aumentado para suavizar más la señal
  private readonly EMA_ALPHA = 0.3; // Ajustado para suavizado óptimo
  private readonly BASELINE_FACTOR = 0.98; // Ajustado para adaptación más rápida

  // Parámetros de beep
  private readonly BEEP_PRIMARY_FREQUENCY = 880; 
  private readonly BEEP_SECONDARY_FREQUENCY = 440; 
  private readonly BEEP_DURATION = 60; // Reducido para un beep más corto y rápido
  private readonly BEEP_VOLUME = 0.8; 
  private readonly MIN_BEEP_INTERVAL_MS = 250; // Reducido para permitir beeps más frecuentes

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
  private peakAmplitudes: number[] = [];

  constructor() {
    this.initAudio();
    this.startTime = Date.now();
  }

  private async initAudio() {
    try {
      this.audioContext = new AudioContext();
      await this.audioContext.resume();
      await this.playBeep(0.01);
      console.log("HeartBeatProcessor: Audio Context Initialized");
    } catch (error) {
      console.error("HeartBeatProcessor: Error initializing audio", error);
    }
  }

  private async playBeep(volume: number = this.BEEP_VOLUME) {
    try {
      const now = Date.now();
      if (now - this.lastBeepTime < this.MIN_BEEP_INTERVAL_MS) {
        return;
      }
      this.lastBeepTime = now;

      if (typeof window === "undefined") {
        return;
      }
      if (!this.audioContext) {
        await this.initAudio();
      }
      if (!this.audioContext) {
        return;
      }

      // Crear dos osciladores para un sonido más rico y similar al latido cardíaco
      const oscillator1 = this.audioContext.createOscillator();
      const oscillator2 = this.audioContext.createOscillator();
      const gainNode = this.audioContext.createGain();

      // Configurar osciladores
      oscillator1.type = "sine";
      oscillator1.frequency.setValueAtTime(
        this.BEEP_PRIMARY_FREQUENCY,
        this.audioContext.currentTime
      );
      
      oscillator2.type = "sine";
      oscillator2.frequency.setValueAtTime(
        this.BEEP_SECONDARY_FREQUENCY,
        this.audioContext.currentTime
      );

      // Configurar envolvente de amplitud para un sonido más suave "lub-dub"
      gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
      gainNode.gain.linearRampToValueAtTime(
        volume,
        this.audioContext.currentTime + 0.01
      );
      gainNode.gain.linearRampToValueAtTime(
        volume * 0.3,
        this.audioContext.currentTime + 0.03
      );
      gainNode.gain.linearRampToValueAtTime(
        volume * 0.7,
        this.audioContext.currentTime + 0.05
      );
      gainNode.gain.linearRampToValueAtTime(
        0,
        this.audioContext.currentTime + this.BEEP_DURATION / 1000
      );

      // Conectar los nodos
      oscillator1.connect(gainNode);
      oscillator2.connect(gainNode);
      gainNode.connect(this.audioContext.destination);

      // Iniciar y detener los osciladores
      oscillator1.start(this.audioContext.currentTime);
      oscillator2.start(this.audioContext.currentTime + 0.02); // Pequeño retraso para el segundo tono
      
      oscillator1.stop(
        this.audioContext.currentTime + this.BEEP_DURATION / 1000
      );
      oscillator2.stop(
        this.audioContext.currentTime + this.BEEP_DURATION / 1000
      );
    } catch (e) {
      console.error("Error playing beep", e);
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
    const sorted = [...this.medianBuffer].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  }

  private calculateMovingAverage(value: number): number {
    this.movingAverageBuffer.push(value);
    if (this.movingAverageBuffer.length > this.MOVING_AVERAGE_WINDOW) {
      this.movingAverageBuffer.shift();
    }
    const sum = this.movingAverageBuffer.reduce((a, b) => a + b, 0);
    return sum / this.movingAverageBuffer.length;
  }

  private calculateEMA(value: number): number {
    this.smoothedValue =
      this.EMA_ALPHA * value + (1 - this.EMA_ALPHA) * this.smoothedValue;
    return this.smoothedValue;
  }

  public processSignal(value: number): {
    bpm: number;
    confidence: number;
    isPeak: boolean;
    filteredValue: number;
    arrhythmiaCount: number;
  } {
    // Filtros sucesivos para mejorar la señal
    const medVal = this.medianFilter(value);
    const movAvgVal = this.calculateMovingAverage(medVal);
    const smoothed = this.calculateEMA(movAvgVal);

    this.signalBuffer.push(smoothed);
    if (this.signalBuffer.length > this.WINDOW_SIZE) {
      this.signalBuffer.shift();
    }

    if (this.signalBuffer.length < 15) { // Reducido para comenzar antes
      return {
        bpm: 0,
        confidence: 0,
        isPeak: false,
        filteredValue: smoothed,
        arrhythmiaCount: 0
      };
    }

    // Actualizar línea base con adaptación más rápida
    this.baseline =
      this.baseline * this.BASELINE_FACTOR + smoothed * (1 - this.BASELINE_FACTOR);

    // Normalizar valor respecto a la línea base
    const normalizedValue = smoothed - this.baseline;
    this.autoResetIfSignalIsLow(Math.abs(normalizedValue));

    // Mantener un buffer corto para cálculo de derivada
    this.values.push(smoothed);
    if (this.values.length > 3) {
      this.values.shift();
    }

    // Calcular la derivada (tasa de cambio de la señal)
    let smoothDerivative = smoothed - this.lastValue;
    if (this.values.length === 3) {
      // Usar derivada centrada para más precisión
      smoothDerivative = (this.values[2] - this.values[0]) / 2;
    }
    this.lastValue = smoothed;

    // Detectar pico basado en derivada y umbral
    const { isPeak, confidence } = this.detectPeak(normalizedValue, smoothDerivative);
    
    // Confirmar pico para evitar falsos positivos
    const isConfirmedPeak = this.confirmPeak(isPeak, normalizedValue, confidence);

    // Si se confirmó un pico y no estamos en periodo de calentamiento
    if (isConfirmedPeak && !this.isInWarmup()) {
      const now = Date.now();
      const timeSinceLastPeak = this.lastPeakTime
        ? now - this.lastPeakTime
        : Number.MAX_VALUE;

      // Verificar que haya pasado suficiente tiempo desde el último pico
      if (timeSinceLastPeak >= this.MIN_PEAK_TIME_MS) {
        this.previousPeakTime = this.lastPeakTime;
        this.lastPeakTime = now;
        
        // Reproducir beep para indicar latido
        this.playBeep(Math.min(0.2 + confidence * 0.6, 0.8)); // Volumen proporcional a confianza
        
        // Guardar amplitud para análisis posterior
        this.peakAmplitudes.push(Math.abs(normalizedValue));
        if (this.peakAmplitudes.length > 20) {
          this.peakAmplitudes.shift();
        }
        
        // Actualizar cálculo de BPM
        this.updateBPM();
      }
    }

    return {
      bpm: Math.round(this.getSmoothBPM()),
      confidence,
      isPeak: isConfirmedPeak && !this.isInWarmup(),
      filteredValue: smoothed,
      arrhythmiaCount: 0
    };
  }

  private autoResetIfSignalIsLow(amplitude: number) {
    if (amplitude < this.LOW_SIGNAL_THRESHOLD) {
      this.lowSignalCount++;
      if (this.lowSignalCount >= this.LOW_SIGNAL_FRAMES) {
        this.resetDetectionStates();
      }
    } else {
      this.lowSignalCount = 0;
    }
  }

  private resetDetectionStates() {
    this.lastPeakTime = null;
    this.previousPeakTime = null;
    this.lastConfirmedPeak = false;
    this.peakCandidateIndex = null;
    this.peakCandidateValue = 0;
    this.peakConfirmationBuffer = [];
    this.values = [];
    this.peakAmplitudes = [];
    console.log("HeartBeatProcessor: auto-reset detection states (low signal).");
  }

  private detectPeak(normalizedValue: number, derivative: number): {
    isPeak: boolean;
    confidence: number;
  } {
    const now = Date.now();
    const timeSinceLastPeak = this.lastPeakTime
      ? now - this.lastPeakTime
      : Number.MAX_VALUE;

    // No detectar picos demasiado cercanos en el tiempo
    if (timeSinceLastPeak < this.MIN_PEAK_TIME_MS) {
      return { isPeak: false, confidence: 0 };
    }

    // Sistema de detección combinado:
    // 1. Detectar cuando la derivada es positiva (la señal está subiendo)
    // 2. El valor normalizado debe estar por encima del umbral
    // 3. Verificación adicional de que estamos por encima de la línea base
    const isOverThreshold =
      derivative > this.DERIVATIVE_THRESHOLD &&
      normalizedValue > this.SIGNAL_THRESHOLD;

    // Calcular confianza basada en amplitud
    const amplitudeConfidence = Math.min(
      Math.max(Math.abs(normalizedValue) / (this.SIGNAL_THRESHOLD * 1.5), 0),
      1
    );
    
    // Calcular confianza basada en derivada
    const derivativeConfidence = Math.min(
      Math.max(derivative / (this.DERIVATIVE_THRESHOLD * 1.2), 0),
      1
    );

    // Confianza combinada (promedio ponderado)
    const confidence = (amplitudeConfidence * 0.6 + derivativeConfidence * 0.4);

    return { isPeak: isOverThreshold, confidence };
  }

  private confirmPeak(
    isPeak: boolean,
    normalizedValue: number,
    confidence: number
  ): boolean {
    // Añadir valor actual al buffer de confirmación
    this.peakConfirmationBuffer.push(normalizedValue);
    if (this.peakConfirmationBuffer.length > 5) {
      this.peakConfirmationBuffer.shift();
    }

    // Solo intentar confirmar si es un posible pico con confianza suficiente
    if (isPeak && !this.lastConfirmedPeak && confidence >= this.MIN_CONFIDENCE) {
      // Necesitamos al menos 3 muestras para confirmar un pico
      if (this.peakConfirmationBuffer.length >= 3) {
        const len = this.peakConfirmationBuffer.length;
        
        // Verificar patrón de subida seguido de bajada (punto de inflexión)
        const goingUp = 
          this.peakConfirmationBuffer[len - 3] < this.peakConfirmationBuffer[len - 2];
        const goingDown = 
          this.peakConfirmationBuffer[len - 2] > this.peakConfirmationBuffer[len - 1];

        // Patrón típico de un pico real: subida seguida de bajada
        if (goingUp && goingDown) {
          this.lastConfirmedPeak = true;
          return true;
        }
      }
    } else if (!isPeak) {
      // Resetear estado cuando ya no es un pico
      this.lastConfirmedPeak = false;
    }

    return false;
  }

  private updateBPM() {
    if (!this.lastPeakTime || !this.previousPeakTime) return;
    
    // Calcular intervalo entre picos en milisegundos
    const interval = this.lastPeakTime - this.previousPeakTime;
    if (interval <= 0) return;

    // Convertir intervalo a BPM
    const instantBPM = 60000 / interval;
    
    // Filtrar valores fisiológicamente imposibles
    if (instantBPM >= this.MIN_BPM && instantBPM <= this.MAX_BPM) {
      this.bpmHistory.push(instantBPM);
      
      // Mantener historial limitado para promediar
      if (this.bpmHistory.length > 12) {
        this.bpmHistory.shift();
      }
    }
  }

  private getSmoothBPM(): number {
    const rawBPM = this.calculateCurrentBPM();
    
    // Si no tenemos BPM previo, usar el actual
    if (this.smoothBPM === 0) {
      this.smoothBPM = rawBPM;
      return rawBPM;
    }
    
    // Suavizar el BPM para evitar fluctuaciones bruscas
    this.smoothBPM =
      this.BPM_ALPHA * rawBPM + (1 - this.BPM_ALPHA) * this.smoothBPM;
    return this.smoothBPM;
  }

  private calculateCurrentBPM(): number {
    if (this.bpmHistory.length < 2) {
      return 0;
    }
    
    // Ordenar valores para eliminar outliers
    const sorted = [...this.bpmHistory].sort((a, b) => a - b);
    
    // Usar valores centrales (eliminar extremos)
    const trimmed = sorted.slice(1, -1);
    if (!trimmed.length) return 0;
    
    // Calcular promedio de valores filtrados
    const avg = trimmed.reduce((a, b) => a + b, 0) / trimmed.length;
    return avg;
  }

  public getFinalBPM(): number {
    if (this.bpmHistory.length < 5) {
      return 0;
    }
    
    // Ordenar para eliminar outliers
    const sorted = [...this.bpmHistory].sort((a, b) => a - b);
    
    // Recortar el 10% más alto y más bajo
    const cut = Math.round(sorted.length * 0.1);
    const finalSet = sorted.slice(cut, sorted.length - cut);
    
    if (!finalSet.length) return 0;
    
    // Calcular promedio final
    const sum = finalSet.reduce((acc, val) => acc + val, 0);
    return Math.round(sum / finalSet.length);
  }

  public reset() {
    this.signalBuffer = [];
    this.medianBuffer = [];
    this.movingAverageBuffer = [];
    this.peakConfirmationBuffer = [];
    this.bpmHistory = [];
    this.values = [];
    this.smoothBPM = 0;
    this.lastPeakTime = null;
    this.previousPeakTime = null;
    this.lastConfirmedPeak = false;
    this.lastBeepTime = 0;
    this.baseline = 0;
    this.lastValue = 0;
    this.smoothedValue = 0;
    this.startTime = Date.now();
    this.peakCandidateIndex = null;
    this.peakCandidateValue = 0;
    this.lowSignalCount = 0;
    this.peakAmplitudes = [];
  }

  public getRRIntervals(): { intervals: number[]; lastPeakTime: number | null; amplitudes?: number[] } {
    // Pasar las amplitudes de los picos para la detección de arritmias
    return {
      intervals: [...this.bpmHistory],
      lastPeakTime: this.lastPeakTime,
      amplitudes: [...this.peakAmplitudes] // Usar amplitudes reales almacenadas
    };
  }
}
