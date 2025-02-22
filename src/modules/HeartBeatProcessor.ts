/**
 * HeartBeatProcessor
 * 
 * Este procesador aplica varios filtros y un esquema de detección de picos 
 * para estimar la frecuencia cardíaca a partir de una señal PPG.
 * 
 * Mejoras principales respecto a versiones anteriores:
 *  1) Filtro de mediana y un nuevo "bandpassFilter" (pasa banda) 
 *     en dos etapas (High-Pass + Low-Pass de 1er orden) para reducir ruido 
 *     y realzar la componente cardíaca (≈0.5 a 5 Hz).
 *  2) Ventanas más amplias en la mediana y moving average, y baseline 
 *     todavía menos agresivo para no aplanar picos reales.
 *  3) Confirmación de pico con doble/triple chequeo de descenso, 
 *     reduciendo aún más los falsos positivos.
 *  4) Un EMA adicional para suavizar el BPM en tiempo real y un cálculo 
 *     más estable del BPM final, evitando que se tome solo la última medición.
 */
export class HeartBeatProcessor {
  // ───────────── CONFIGURACIONES PRINCIPALES ─────────────

  // Tasa de muestreo (frames por segundo).
  private readonly SAMPLE_RATE = 30;         
  // Buffer de señal (≈2s a 30 FPS).
  private readonly WINDOW_SIZE = 60;         

  // Rango de BPM plausible.
  private readonly MIN_PEAK_DISTANCE = 9;     // Aproximadamente 190 BPM máximos
  private readonly MAX_BPM = 190;
  private readonly MIN_BPM = 40;

  // Parámetros para la detección de picos.
  private readonly SIGNAL_THRESHOLD = 0.42;   // Umbral de amplitud
  private readonly MIN_CONFIDENCE = 0.75;     // Confianza mínima
  private readonly DERIVATIVE_THRESHOLD = -0.06; // Pendiente requerida (algo estricta)
  private readonly MIN_PEAK_TIME_MS = 315;    // Tiempo mínimo entre picos (~190 BPM)
  private readonly WARMUP_TIME_MS = 5000;     // Ignora detecciones en primeros 5s

  // Filtros de preprocesamiento.
  private readonly MEDIAN_FILTER_WINDOW = 5;  // Ventana para el filtro de mediana
  private readonly MOVING_AVERAGE_WINDOW = 7; // Ventana para promedio móvil
  private readonly EMA_ALPHA = 0.2;           // Filtro exponencial para la señal
  private readonly BASELINE_FACTOR = 0.997;   // Baseline muy poco agresivo

  // Parámetros del filtro pasa-banda (doble etapa: High-Pass y Low-Pass).
  // Suponiendo fcLow=0.5 Hz y fcHigh=5 Hz para el pulso (~30 BPM a ~300 BPM).
  // Cálculo de RC = 1/(2πfc). alpha = RC/(RC + dt). dt = 1/SAMPLE_RATE.
  private readonly HP_ALPHA: number; 
  private readonly LP_ALPHA: number; 

  // Parámetros del beep.
  private readonly BEEP_FREQUENCY = 1000;
  private readonly BEEP_DURATION = 50;

  // ───────────── VARIABLES DE PROCESAMIENTO ─────────────

  // Buffers de filtros.
  private signalBuffer: number[] = [];     
  private medianBuffer: number[] = [];     
  private movingAverageBuffer: number[] = [];

  // Estados para el filtro pasa banda (HP y LP), de 1er orden:
  private lastHP: number = 0;     // Salida anterior del high-pass
  private lastHPIn: number = 0;   // Entrada anterior del high-pass
  private lastLP: number = 0;     // Salida anterior del low-pass

  // Variables de audio.
  private audioContext: AudioContext | null = null;
  private lastBeepTime: number = 0;

  // Detección de picos y BPM.
  private lastPeakTime: number | null = null;
  private previousPeakTime: number | null = null;
  private bpmHistory: number[] = [];

  // Baseline + derivadas.
  private baseline: number = 0;
  private lastValue: number = 0;      // Valor procesado anterior
  private values: number[] = [];      // Pequeña ventana para calcular derivada suave
  private smoothedValue: number = 0;  // Salida del EMA
  private startTime: number = 0;      // Para warm-up

  // Confirmación de pico (falsos positivos).
  private peakConfirmationBuffer: number[] = [];
  private lastConfirmedPeak: boolean = false;

  // Suavizado del BPM en tiempo real.
  private smoothBPM: number = 0;
  private readonly BPM_ALPHA = 0.2; // Cuanto menor, más suave la variación

  constructor() {
    // Inicializamos alpha para el high-pass y low-pass.
    // High pass (fc=0.5 Hz).
    const fcLow = 0.5;
    const dt = 1 / this.SAMPLE_RATE;
    const rcLow = 1.0 / (2.0 * Math.PI * fcLow);
    this.HP_ALPHA = rcLow / (rcLow + dt);

    // Low pass (fc=5 Hz).
    const fcHigh = 5.0;
    const rcHigh = 1.0 / (2.0 * Math.PI * fcHigh);
    this.LP_ALPHA = rcHigh / (rcHigh + dt);

    this.initAudio();
    this.startTime = Date.now();
  }

  // ───────────── AUDIO PARA BEEP ─────────────

  private async initAudio() {
    try {
      this.audioContext = new AudioContext();
      await this.audioContext.resume();
      // Beep de prueba a volumen muy bajo
      await this.playBeep(0.01);
      console.log("HeartBeatProcessor: AudioContext initialized", {
        sampleRate: this.audioContext.sampleRate,
        state: this.audioContext.state
      });
    } catch (error) {
      console.error("HeartBeatProcessor: Error initializing audio", error);
    }
  }

  private async playBeep(volume: number = 0.1) {
    if (!this.audioContext || this.isInWarmup()) return;

    const now = Date.now();
    // Prevenimos beeps muy seguidos (200 ms).
    if (now - this.lastBeepTime < 200) return;

    try {
      const oscillator = this.audioContext.createOscillator();
      const gainNode = this.audioContext.createGain();

      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(
        this.BEEP_FREQUENCY,
        this.audioContext.currentTime
      );

      gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
      gainNode.gain.linearRampToValueAtTime(
        volume,
        this.audioContext.currentTime + 0.01
      );
      gainNode.gain.linearRampToValueAtTime(
        0,
        this.audioContext.currentTime + 0.05
      );

      oscillator.connect(gainNode);
      gainNode.connect(this.audioContext.destination);

      oscillator.start();
      oscillator.stop(this.audioContext.currentTime + 0.05);

      this.lastBeepTime = now;
    } catch (error) {
      console.error("HeartBeatProcessor: Error playing beep", error);
    }
  }

  // ───────────── CONTROL DE TIEMPOS ─────────────

  private isInWarmup(): boolean {
    return Date.now() - this.startTime < this.WARMUP_TIME_MS;
  }

  // ───────────── FILTROS ─────────────

  /**
   * bandpassFilter:
   * Aplica un filtro pasa banda simple en dos etapas: 
   *   1) High-pass de primer orden. 
   *   2) Low-pass de primer orden.
   * El objetivo es atenuar DC y ruidos fuera de ~0.5 a ~5 Hz (rango típico PPG cardiaco).
   */
  private bandpassFilter(input: number): number {
    // High-pass
    //   y[n] = alphaHP * (y[n-1] + x[n] - x[n-1])
    const hpVal = this.HP_ALPHA * (this.lastHP + input - this.lastHPIn);

    this.lastHPIn = input;
    this.lastHP = hpVal;

    // Low-pass
    //   y[n] = alphaLP * y[n-1] + (1 - alphaLP) * hpVal
    const lpVal = this.LP_ALPHA * this.lastLP + (1 - this.LP_ALPHA) * hpVal;
    this.lastLP = lpVal;

    return lpVal;
  }

  // Filtro de mediana: reduce picos espurios
  private medianFilter(value: number): number {
    this.medianBuffer.push(value);
    if (this.medianBuffer.length > this.MEDIAN_FILTER_WINDOW) {
      this.medianBuffer.shift();
    }
    const sorted = [...this.medianBuffer].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  }

  // Promedio móvil
  private calculateMovingAverage(value: number): number {
    this.movingAverageBuffer.push(value);
    if (this.movingAverageBuffer.length > this.MOVING_AVERAGE_WINDOW) {
      this.movingAverageBuffer.shift();
    }
    const sum = this.movingAverageBuffer.reduce((a, b) => a + b, 0);
    return sum / this.movingAverageBuffer.length;
  }

  // Filtro exponencial (EMA) final
  private calculateEMA(value: number): number {
    this.smoothedValue =
      this.EMA_ALPHA * value + (1 - this.EMA_ALPHA) * this.smoothedValue;
    return this.smoothedValue;
  }

  // ───────────── PROCESAR SEÑAL POR MUESTRA ─────────────

  public processSignal(rawValue: number): {
    bpm: number;
    confidence: number;
    isPeak: boolean;
    filteredValue: number; // para graficar
  } {
    // Paso 1: Filtro de mediana
    const medVal = this.medianFilter(rawValue);

    // Paso 2: Filtro pasa-banda
    const bandVal = this.bandpassFilter(medVal);

    // Paso 3: Promedio móvil
    const movAvgVal = this.calculateMovingAverage(bandVal);

    // Paso 4: EMA final
    const smoothed = this.calculateEMA(movAvgVal);

    // Guardamos para graficar la señal final
    this.signalBuffer.push(smoothed);
    if (this.signalBuffer.length > this.WINDOW_SIZE) {
      this.signalBuffer.shift();
    }

    // Esperar 1s (~30 muestras) antes de intentar picos
    if (this.signalBuffer.length < 30) {
      return { bpm: 0, confidence: 0, isPeak: false, filteredValue: smoothed };
    }

    // Ajuste de baseline muy leve
    this.baseline =
      this.baseline * this.BASELINE_FACTOR + smoothed * (1 - this.BASELINE_FACTOR);

    const normalizedValue = smoothed - this.baseline;

    // Cálculo de derivada suave
    this.values.push(smoothed);
    if (this.values.length > 3) this.values.shift();
    let smoothDerivative = smoothed - this.lastValue;
    if (this.values.length === 3) {
      smoothDerivative = (this.values[2] - this.values[0]) / 2;
    }
    this.lastValue = smoothed;

    // Detectar pico
    const { isPeak, confidence } = this.detectPeak(normalizedValue, smoothDerivative);

    // Confirmar pico real
    const isConfirmedPeak = this.confirmPeak(isPeak, normalizedValue, confidence);

    // Si hay pico confirmado y no estamos en warmup, actualizar BPM y beep
    if (isConfirmedPeak && !this.isInWarmup()) {
      const now = Date.now();
      const timeSinceLastPeak = this.lastPeakTime
        ? now - this.lastPeakTime
        : Number.MAX_VALUE;

      if (timeSinceLastPeak >= this.MIN_PEAK_TIME_MS) {
        this.previousPeakTime = this.lastPeakTime;
        this.lastPeakTime = now;
        this.playBeep(0.1);
        this.updateBPM();
      }
    }

    return {
      bpm: Math.round(this.getSmoothBPM()), // BPM suavizado
      confidence,
      isPeak: isConfirmedPeak && !this.isInWarmup(),
      filteredValue: smoothed // Para graficar la señal final
    };
  }

  // ───────────── DETECCIÓN Y CONFIRMACIÓN DE PICOS ─────────────

  private detectPeak(normalizedValue: number, derivative: number): {
    isPeak: boolean;
    confidence: number;
  } {
    const now = Date.now();
    const timeSinceLastPeak = this.lastPeakTime
      ? now - this.lastPeakTime
      : Number.MAX_VALUE;
    if (timeSinceLastPeak < this.MIN_PEAK_TIME_MS) {
      return { isPeak: false, confidence: 0 };
    }

    // Criterios de pico
    const isPeak =
      derivative < this.DERIVATIVE_THRESHOLD &&
      normalizedValue > this.SIGNAL_THRESHOLD &&
      this.lastValue > this.baseline;

    // Confianza (amplitud y pendiente)
    const amplitudeConfidence = Math.min(
      Math.max(Math.abs(normalizedValue) / (this.SIGNAL_THRESHOLD * 2), 0),
      1
    );
    const derivativeConfidence = Math.min(
      Math.max(Math.abs(derivative) / Math.abs(this.DERIVATIVE_THRESHOLD), 0),
      1
    );
    const confidence = (amplitudeConfidence + derivativeConfidence) / 2;

    return { isPeak, confidence };
  }

  private confirmPeak(isPeak: boolean, normalizedValue: number, confidence: number): boolean {
    this.peakConfirmationBuffer.push(normalizedValue);
    if (this.peakConfirmationBuffer.length > 5) {
      this.peakConfirmationBuffer.shift();
    }

    // Doble/triple verificación de descenso
    if (isPeak && !this.lastConfirmedPeak && confidence >= this.MIN_CONFIDENCE) {
      if (this.peakConfirmationBuffer.length > 3) {
        const len = this.peakConfirmationBuffer.length;
        const goingDown1 =
          this.peakConfirmationBuffer[len - 1] < this.peakConfirmationBuffer[len - 2];
        const goingDown2 =
          this.peakConfirmationBuffer[len - 2] < this.peakConfirmationBuffer[len - 3];
        if (goingDown1 && goingDown2) {
          this.lastConfirmedPeak = true;
          return true;
        }
      }
    } else if (!isPeak) {
      this.lastConfirmedPeak = false;
    }

    return false;
  }

  // ───────────── CÁLCULO DEL BPM ─────────────

  private updateBPM() {
    if (!this.lastPeakTime || !this.previousPeakTime) return;
    const interval = this.lastPeakTime - this.previousPeakTime;
    if (interval <= 0) return;

    const instantBPM = 60000 / interval;
    if (instantBPM >= this.MIN_BPM && instantBPM <= this.MAX_BPM) {
      this.bpmHistory.push(instantBPM);
      // Evitamos crecer indefinidamente
      if (this.bpmHistory.length > 12) {
        this.bpmHistory.shift();
      }
    }
  }

  /**
   * getSmoothBPM
   * Suaviza el BPM actual con un EMA para evitar fluctuaciones bruscas.
   */
  private getSmoothBPM(): number {
    const rawBPM = this.calculateCurrentBPM();
    if (this.smoothBPM === 0) {
      this.smoothBPM = rawBPM;
      return rawBPM;
    }
    this.smoothBPM =
      this.BPM_ALPHA * rawBPM + (1 - this.BPM_ALPHA) * this.smoothBPM;
    return this.smoothBPM;
  }

  /**
   * calculateCurrentBPM
   * Toma la historia de BPM (hasta 12 muestras), descarta la más baja y la más alta
   * para mitigar outliers, y devuelve el promedio de las restantes.
   */
  private calculateCurrentBPM(): number {
    if (this.bpmHistory.length < 2) {
      return 0;
    }
    const sortedBPMs = [...this.bpmHistory].sort((a, b) => a - b);
    // Descartar el mínimo y el máximo
    const trimmed = sortedBPMs.slice(1, -1);
    if (trimmed.length === 0) {
      return 0;
    }
    const avg = trimmed.reduce((a, b) => a + b, 0) / trimmed.length;
    return avg;
  }

  /**
   * Devuelve un BPM final tras la medición, recortando el 10% inferior y superior
   * para una estimación estable al finalizar.
   */
  public getFinalBPM(): number {
    if (this.bpmHistory.length < 5) {
      return 0;
    }
    const sorted = [...this.bpmHistory].sort((a, b) => a - b);
    const cut = Math.round(sorted.length * 0.1);
    const finalSet = sorted.slice(cut, sorted.length - cut);
    if (finalSet.length === 0) return 0;
    const sum = finalSet.reduce((acc, val) => acc + val, 0);
    return Math.round(sum / finalSet.length);
  }

  // ───────────── RESET ─────────────

  public reset() {
    this.signalBuffer = [];
    this.medianBuffer = [];
    this.movingAverageBuffer = [];
    this.values = [];
    this.peakConfirmationBuffer = [];
    this.bpmHistory = [];
    this.smoothBPM = 0;

    this.lastHP = 0;
    this.lastHPIn = 0;
    this.lastLP = 0;

    this.lastPeakTime = null;
    this.previousPeakTime = null;
    this.lastConfirmedPeak = false;
    this.lastBeepTime = 0;
    this.baseline = 0;
    this.lastValue = 0;
    this.smoothedValue = 0;

    this.startTime = Date.now();
  }
}
