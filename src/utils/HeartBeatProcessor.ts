export class HeartBeatProcessor {
  // ────────── CONFIGURACIÓN AVANZADA ──────────
  // Parámetros principales - optimizados para procesamiento con cámara de móvil
  private readonly SAMPLE_RATE = 30; // Frecuencia típica de cámaras móviles
  private readonly WINDOW_SIZE = 90; // 3 segundos a 30fps - ideal para análisis
  private readonly MIN_BPM = 40;  // Límite clínico inferior para adultos
  private readonly MAX_BPM = 220; // Frecuencia cardíaca fisiológica máxima
  
  // Parámetros de calidad de señal
  private readonly MIN_CONFIDENCE = 0.2; // Reducido aún más para facilitar detección
  private readonly SIGNAL_THRESHOLD = 0.1; // Umbral más bajo para mejor detección
  private readonly NOISE_THRESHOLD = 0.1; // Para detectar señales ruidosas
  
  // Parámetros de detección de picos
  private readonly DERIVATIVE_THRESHOLD = -0.01; // Menos restrictivo para mejor detección
  private readonly MIN_PEAK_TIME_MS = 150; // Reducido para detectar ritmos más rápidos
  private readonly WARMUP_TIME_MS = 500; // Reducido para iniciar más rápido
  private readonly PEAK_AGE_WEIGHT = 0.8; // Mayor peso a picos recientes
  
  // Parámetros de filtrado
  private readonly MEDIAN_FILTER_WINDOW = 5; // Elimina ruido impulsivo
  private readonly BUTTERWORTH_LOW_PASS = 3.5; // Hz - Elimina ruido de alta frecuencia
  private readonly BUTTERWORTH_HIGH_PASS = 0.5; // Hz - Elimina deriva de línea base
  private readonly BUTTERWORTH_ORDER = 2; // Orden del filtro
  private readonly MOVING_AVERAGE_WINDOW = 3; // Etapa final de suavizado
  private readonly EMA_ALPHA = 0.3; // Factor de promedio móvil exponencial
  private readonly BASELINE_ALPHA = 0.02; // Adaptación de línea base más lenta
  
  // Parámetros de retroalimentación de audio
  private readonly BEEP_PRIMARY_FREQUENCY = 800; // Hz
  private readonly BEEP_SECONDARY_FREQUENCY = 400; // Hz
  private readonly BEEP_DURATION = 70; // ms
  private readonly BEEP_VOLUME = 0.75; // Volumen moderado
  private readonly MIN_BEEP_INTERVAL_MS = 250; // Prevenir superposición de beeps
  private readonly BEEP_ENVELOPE_RISE = 0.01; // seg
  private readonly BEEP_ENVELOPE_FALL = 0.05; // seg
  
  // Parámetros de detección de arritmia
  private readonly RR_BUFFER_SIZE = 16; // Almacenar intervalos RR
  private readonly HR_VAR_THRESHOLD = 12; // % de varianza para detección de arritmia
  private readonly CONSECUTIVE_IRREGULAR_BEATS = 2; // Número de latidos irregulares antes de alerta
  private readonly PREMATURE_BEAT_THRESHOLD = 0.8; // % del intervalo RR promedio
  
  // Parámetros de auto-reset
  private readonly LOW_SIGNAL_THRESHOLD = 0.02; // Más sensible
  private readonly LOW_SIGNAL_FRAMES = 30; // Más tolerante a señales débiles
  private readonly MAX_SIGNAL_AGE_MS = 10000; // Reset si no hay nuevos picos por 10 segundos
  
  // Debug mode
  private readonly DEBUG_MODE = true;
  
  // ────────── VARIABLES DE ESTADO ──────────
  // Buffers de señal y estado de procesamiento
  private signalBuffer: number[] = [];
  private medianBuffer: number[] = [];
  private movingAverageBuffer: number[] = [];
  private lowPassBuffer: number[] = [];
  private highPassBuffer: number[] = [];
  private smoothedValue: number = 0;
  private baseline: number = 0;
  private lastValue: number = 0;
  private values: number[] = [];
  private startTime: number = 0;
  private lastSignalTime: number = 0;
  private lowSignalCount = 0;
  
  // Estado de detección de picos
  private lastPeakTime: number | null = null;
  private previousPeakTime: number | null = null;
  private peakConfirmationBuffer: number[] = [];
  private lastConfirmedPeak: boolean = false;
  private peakCandidateIndex: number | null = null;
  private peakCandidateValue: number = 0;
  private peakThreshold: number = 0;
  private adaptiveThreshold: number = 0;
  private signalQuality: number = 0;
  
  // Cálculo de frecuencia cardíaca
  private bpmHistory: number[] = [];
  private rrIntervals: number[] = [];
  private smoothBPM: number = 0;
  private readonly BPM_ALPHA = 0.2; // Factor de suavizado para actualizaciones de BPM
  
  // Detección de arritmia
  private irregularBeatCount: number = 0;
  private consecutiveIrregularBeats: number = 0;
  private arrhythmiaDetected: boolean = false;
  private arrythmiaRiskScore: number = 0;
  private arrhythmiaType: string = '';
  
  // Contexto de audio
  private audioContext: AudioContext | null = null;
  private lastBeepTime = 0;
  private manualBeepRequest = false; // Para permitir beeps manuales
  
  // Coeficientes de filtro Butterworth
  private readonly LP_A = [1, -1.7236056, 0.7600501];
  private readonly LP_B = [0.0091334, 0.0182668, 0.0091334];
  private readonly HP_A = [1, -1.9556093, 0.9565925];
  private readonly HP_B = [0.9776399, -1.9552798, 0.9776399];
  
  constructor() {
    // Inicializar el audio de forma asíncrona
    this.initAudio().then(success => {
      if (success) {
        console.log("HeartBeatProcessor: Audio inicializado correctamente en el constructor");
      } else {
        console.warn("HeartBeatProcessor: No se pudo inicializar el audio en el constructor");
      }
    });
    
    this.reset();
    console.log("HeartBeatProcessor: Instancia creada y reseteada");
  }
  
  private async initAudio() {
    try {
      console.log("HeartBeatProcessor: Intentando inicializar contexto de audio...");
      
      if (typeof AudioContext !== 'undefined') {
        // Crear un nuevo contexto de audio si no existe o está cerrado
        if (!this.audioContext || this.audioContext.state === 'closed') {
          this.audioContext = new AudioContext();
          console.log("HeartBeatProcessor: Nuevo contexto de audio creado");
        }
        
        // Intentar reanudar el contexto si está suspendido
        if (this.audioContext.state === 'suspended') {
          console.log("HeartBeatProcessor: Intentando reanudar contexto suspendido...");
          await this.audioContext.resume();
          console.log("HeartBeatProcessor: Contexto reanudado, estado:", this.audioContext.state);
        }
        
        // Reproducir un beep de prueba con volumen bajo
        try {
          console.log("HeartBeatProcessor: Reproduciendo beep de prueba...");
          await this.playBeep(0.1);
          console.log("HeartBeatProcessor: Beep de prueba reproducido exitosamente");
        } catch (beepError) {
          console.warn("HeartBeatProcessor: No se pudo reproducir beep de prueba", beepError);
        }
        
        console.log("HeartBeatProcessor: Audio Context Inicializado, estado:", this.audioContext.state);
        return true;
      } else {
        console.error("HeartBeatProcessor: AudioContext no disponible en este navegador");
        return false;
      }
    } catch (error) {
      console.error("HeartBeatProcessor: Error inicializando audio", error);
      return false;
    }
  }
  
  public async ensureAudioInitialized() {
    console.log("HeartBeatProcessor: Verificando inicialización de audio...");
    
    if (!this.audioContext || this.audioContext.state === 'closed') {
      console.log("HeartBeatProcessor: Contexto de audio no existe o está cerrado, inicializando...");
      return await this.initAudio();
    }
    
    if (this.audioContext.state === 'suspended') {
      console.log("HeartBeatProcessor: Contexto de audio suspendido, intentando reanudar...");
      try {
        await this.audioContext.resume();
        console.log("HeartBeatProcessor: Contexto de audio reanudado exitosamente");
        
        // Reproducir un beep de prueba para verificar
        await this.playBeep(0.1);
        
        return true;
      } catch (error) {
        console.error("HeartBeatProcessor: Error reanudando contexto de audio", error);
        return false;
      }
    }
    
    console.log("HeartBeatProcessor: Contexto de audio ya inicializado y activo");
    return true;
  }
  
  public async requestManualBeep() {
    console.log("HeartBeatProcessor: Solicitud de beep manual recibida");
    
    // Asegurar que el audio esté inicializado
    const audioReady = await this.ensureAudioInitialized();
    if (!audioReady) {
      console.warn("HeartBeatProcessor: No se pudo inicializar el audio para beep manual");
      return false;
    }
    
    this.manualBeepRequest = true;
    
    // Reproducir beep con volumen alto
    try {
      await this.playBeep(0.9);
      console.log("HeartBeatProcessor: Beep manual reproducido exitosamente");
      return true;
    } catch (error) {
      console.error("HeartBeatProcessor: Error reproduciendo beep manual", error);
      return false;
    }
  }
  
  private async playBeep(volume: number = this.BEEP_VOLUME) {
    // Registrar intento de beep para depuración
    console.log("HeartBeatProcessor: Intentando reproducir beep", {
      audioContext: !!this.audioContext,
      audioState: this.audioContext?.state,
      inWarmup: this.isInWarmup(),
      manualRequest: this.manualBeepRequest,
      lastBeepTime: this.lastBeepTime,
      timeSinceLastBeep: Date.now() - this.lastBeepTime
    });
    
    if (!this.audioContext) {
      console.warn("HeartBeatProcessor: No hay contexto de audio disponible");
      this.manualBeepRequest = false;
      return;
    }
    
    if (this.audioContext.state === 'suspended') {
      try {
        console.log("HeartBeatProcessor: Intentando reanudar contexto de audio suspendido");
        await this.audioContext.resume();
        console.log("HeartBeatProcessor: Contexto de audio reanudado:", this.audioContext.state);
      } catch (error) {
        console.error("HeartBeatProcessor: Error reanudando contexto de audio", error);
        this.manualBeepRequest = false;
        return;
      }
    }
    
    const now = Date.now();
    if (!this.manualBeepRequest && now - this.lastBeepTime < this.MIN_BEEP_INTERVAL_MS) {
      console.log("HeartBeatProcessor: Beep ignorado - demasiado pronto desde el último beep");
      return;
    }
    
    this.manualBeepRequest = false;
    
    try {
      if (this.audioContext.state !== 'running') {
        console.warn("HeartBeatProcessor: Contexto de audio no está en ejecución:", this.audioContext.state);
        await this.audioContext.resume();
      }
      
      const primaryOscillator = this.audioContext.createOscillator();
      const primaryGain = this.audioContext.createGain();
      
      const secondaryOscillator = this.audioContext.createOscillator();
      const secondaryGain = this.audioContext.createGain();
      
      primaryOscillator.type = "sine";
      primaryOscillator.frequency.setValueAtTime(
        this.BEEP_PRIMARY_FREQUENCY,
        this.audioContext.currentTime
      );
      
      secondaryOscillator.type = "sine";
      secondaryOscillator.frequency.setValueAtTime(
        this.BEEP_SECONDARY_FREQUENCY,
        this.audioContext.currentTime
      );
      
      primaryGain.gain.setValueAtTime(0, this.audioContext.currentTime);
      primaryGain.gain.linearRampToValueAtTime(
        volume,
        this.audioContext.currentTime + this.BEEP_ENVELOPE_RISE
      );
      primaryGain.gain.exponentialRampToValueAtTime(
        0.01,
        this.audioContext.currentTime + this.BEEP_DURATION / 1000 + this.BEEP_ENVELOPE_FALL
      );
      
      secondaryGain.gain.setValueAtTime(0, this.audioContext.currentTime);
      secondaryGain.gain.linearRampToValueAtTime(
        volume * 0.3,
        this.audioContext.currentTime + this.BEEP_ENVELOPE_RISE
      );
      secondaryGain.gain.exponentialRampToValueAtTime(
        0.01,
        this.audioContext.currentTime + this.BEEP_DURATION / 1000 + this.BEEP_ENVELOPE_FALL
      );
      
      primaryOscillator.connect(primaryGain);
      secondaryOscillator.connect(secondaryGain);
      primaryGain.connect(this.audioContext.destination);
      secondaryGain.connect(this.audioContext.destination);
      
      const startTime = this.audioContext.currentTime;
      const stopTime = startTime + this.BEEP_DURATION / 1000 + this.BEEP_ENVELOPE_FALL + 0.01;
      
      primaryOscillator.start(startTime);
      secondaryOscillator.start(startTime);
      
      primaryOscillator.stop(stopTime);
      secondaryOscillator.stop(stopTime);
      
      this.lastBeepTime = now;
      
      console.log("HeartBeatProcessor: Beep reproducido exitosamente, volumen:", volume);
    } catch (error) {
      console.error("HeartBeatProcessor: Error reproduciendo beep", error);
    }
  }
  
  private isInWarmup(): boolean {
    return Date.now() - this.startTime < this.WARMUP_TIME_MS;
  }
  
  /**
   * Aplicar filtro de mediana para eliminar valores atípicos y ruido impulsivo
   */
  private medianFilter(value: number): number {
    this.medianBuffer.push(value);
    if (this.medianBuffer.length > this.MEDIAN_FILTER_WINDOW) {
      this.medianBuffer.shift();
    }
    
    // Ordenar valores y obtener el del medio
    const sorted = [...this.medianBuffer].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  }
  
  /**
   * Aplicar filtro de paso bajo Butterworth
   */
  private lowPassFilter(value: number): number {
    // Asegurar que el buffer esté inicializado correctamente
    while (this.lowPassBuffer.length < Math.max(this.LP_A.length, this.LP_B.length)) {
      this.lowPassBuffer.unshift(value);
    }
    
    // Calcular valor filtrado usando ecuación de diferencias
    let output = 0;
    
    // Aplicar componentes de feedforward (coeficientes B)
    for (let i = 0; i < this.LP_B.length; i++) {
      if (i === 0) {
        output += this.LP_B[i] * value;
      } else if (i < this.lowPassBuffer.length) {
        output += this.LP_B[i] * this.lowPassBuffer[i-1];
      }
    }
    
    // Aplicar componentes de feedback (coeficientes A, saltando A[0] que siempre es 1)
    for (let i = 1; i < this.LP_A.length; i++) {
      if (i < this.lowPassBuffer.length) {
        output -= this.LP_A[i] * this.lowPassBuffer[i-1];
      }
    }
    
    // Actualizar el buffer
    this.lowPassBuffer.unshift(output);
    if (this.lowPassBuffer.length > Math.max(this.LP_A.length, this.LP_B.length)) {
      this.lowPassBuffer.pop();
    }
    
    return output;
  }
  
  /**
   * Aplicar filtro de paso alto Butterworth para eliminar deriva de línea base
   */
  private highPassFilter(value: number): number {
    // Asegurar que el buffer esté inicializado correctamente
    while (this.highPassBuffer.length < Math.max(this.HP_A.length, this.HP_B.length)) {
      this.highPassBuffer.unshift(value);
    }
    
    // Calcular valor filtrado usando ecuación de diferencias
    let output = 0;
    
    // Aplicar componentes de feedforward (coeficientes B)
    for (let i = 0; i < this.HP_B.length; i++) {
      if (i === 0) {
        output += this.HP_B[i] * value;
      } else if (i < this.highPassBuffer.length) {
        output += this.HP_B[i] * this.highPassBuffer[i-1];
      }
    }
    
    // Aplicar componentes de feedback (coeficientes A, saltando A[0] que siempre es 1)
    for (let i = 1; i < this.HP_A.length; i++) {
      if (i < this.highPassBuffer.length) {
        output -= this.HP_A[i] * this.highPassBuffer[i-1];
      }
    }
    
    // Actualizar el buffer
    this.highPassBuffer.unshift(output);
    if (this.highPassBuffer.length > Math.max(this.HP_A.length, this.HP_B.length)) {
      this.highPassBuffer.pop();
    }
    
    return output;
  }
  
  /**
   * Aplicar filtro de promedio móvil para suavizado final
   */
  private calculateMovingAverage(value: number): number {
    this.movingAverageBuffer.push(value);
    if (this.movingAverageBuffer.length > this.MOVING_AVERAGE_WINDOW) {
      this.movingAverageBuffer.shift();
    }
    
    const sum = this.movingAverageBuffer.reduce((a, b) => a + b, 0);
    return sum / this.movingAverageBuffer.length;
  }
  
  /**
   * Aplicar promedio móvil exponencial para transiciones más suaves
   */
  private calculateEMA(value: number): number {
    this.smoothedValue = this.EMA_ALPHA * value + (1 - this.EMA_ALPHA) * this.smoothedValue;
    return this.smoothedValue;
  }
  
  /**
   * Función principal de procesamiento de señal
   */
  public processSignal(value: number): {
    bpm: number;
    confidence: number;
    isPeak: boolean;
    filteredValue: number;
    arrhythmiaCount: number;
    rrData?: {
      intervals: number[];
      lastPeakTime: number | null;
      arrhythmiaDetected: boolean;
      arrhythmiaScore: number;
      arrhythmiaType: string;
    }
  } {
    this.lastSignalTime = Date.now();
    
    // Evitar valores undefined o NaN
    if (value === undefined || value === null || isNaN(value)) {
      if (this.DEBUG_MODE) {
        console.warn("HeartBeatProcessor: Valor inválido recibido", { value });
      }
      value = 0;
    }
    
    // Pipeline de procesamiento de señal
    const medVal = this.medianFilter(value);
    const highpassed = this.highPassFilter(medVal);
    const bandpassed = this.lowPassFilter(highpassed);
    const movAvgVal = this.calculateMovingAverage(bandpassed);
    const smoothed = this.calculateEMA(movAvgVal);
    
    // Almacenar valores para análisis
    this.signalBuffer.push(smoothed);
    if (this.signalBuffer.length > this.WINDOW_SIZE) {
      this.signalBuffer.shift();
    }
    
    // Verificar si tenemos suficientes datos para análisis
    if (this.signalBuffer.length < Math.floor(this.WINDOW_SIZE / 3)) {
      return {
        bpm: 0,
        confidence: 0,
        isPeak: false,
        filteredValue: smoothed,
        arrhythmiaCount: 0
      };
    }
    
    // Calcular calidad de señal
    this.updateSignalQuality();
    
    // Actualizar línea base adaptativa
    this.baseline = (1 - this.BASELINE_ALPHA) * this.baseline + this.BASELINE_ALPHA * smoothed;
    
    // Normalizar señal
    const normalizedValue = smoothed - this.baseline;
    
    // Auto-reset si la señal es muy baja
    this.autoResetIfSignalIsLow(Math.abs(normalizedValue));
    
    // Calcular primera derivada para detección de picos
    this.values.push(smoothed);
    if (this.values.length > 3) {
      this.values.shift();
    }
    
    // Calcular diferencia central para mejor aproximación de derivada
    let smoothDerivative = 0;
    if (this.values.length === 3) {
      smoothDerivative = (this.values[2] - this.values[0]) / 2;
    } else if (this.values.length === 2) {
      smoothDerivative = this.values[1] - this.values[0];
    }
    
    this.lastValue = smoothed;
    
    // Actualizar umbral adaptativo
    this.updateAdaptiveThreshold();
    
    // Detectar y confirmar picos
    const { isPeak, confidence } = this.detectPeak(normalizedValue, smoothDerivative);
    const isConfirmedPeak = this.confirmPeak(isPeak, normalizedValue, confidence);
    
    // Procesar picos confirmados
    if (isConfirmedPeak) {
      const now = Date.now();
      const timeSinceLastPeak = this.lastPeakTime
        ? now - this.lastPeakTime
        : Number.MAX_VALUE;
      
      if (timeSinceLastPeak >= this.MIN_PEAK_TIME_MS) {
        this.previousPeakTime = this.lastPeakTime;
        this.lastPeakTime = now;
        
        // Reproducir tono para latido - incluso durante el periodo de calentamiento
        this.playBeep(Math.min(1.0, confidence * 1.3));
        
        // Actualizar BPM y verificar arritmias
        this.updateBPM();
        this.checkForArrhythmia();
      }
    }
    
    // Logging para depuración
    if (this.DEBUG_MODE && this.signalBuffer.length % 30 === 0) {
      console.log("HeartBeatProcessor - Estado actual:", {
        bpm: Math.round(this.getSmoothBPM()),
        confianza: Math.min(1, confidence * 1.2),
        historialBPM: this.bpmHistory.slice(-3),
        umbralAdaptativo: this.adaptiveThreshold,
        calidadSeñal: this.signalQuality,
        ultimoPico: this.lastPeakTime ? new Date(this.lastPeakTime).toISOString() : 'ninguno'
      });
    }
    
    return {
      bpm: Math.round(this.getSmoothBPM()),
      confidence: Math.min(1, confidence * 1.2),
      isPeak: isConfirmedPeak,
      filteredValue: smoothed,
      arrhythmiaCount: this.arrhythmiaDetected ? this.consecutiveIrregularBeats : 0,
      rrData: {
        intervals: [...this.rrIntervals],
        lastPeakTime: this.lastPeakTime,
        arrhythmiaDetected: this.arrhythmiaDetected,
        arrhythmiaScore: this.arrythmiaRiskScore,
        arrhythmiaType: this.arrhythmiaType
      }
    };
  }
  
  /**
   * Calcular calidad de señal actual basada en múltiples factores
   */
  private updateSignalQuality(): void {
    if (this.signalBuffer.length < 30) {
      this.signalQuality = 0;
      return;
    }
    
    // Calcular varianza de señal como medida de actividad
    const mean = this.signalBuffer.reduce((sum, val) => sum + val, 0) / this.signalBuffer.length;
    const variance = this.signalBuffer.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / this.signalBuffer.length;
    
    // Calcular relación señal-ruido
    const recentValues = this.signalBuffer.slice(-30);
    const recentMean = recentValues.reduce((sum, val) => sum + val, 0) / recentValues.length;
    const signalPower = recentValues.reduce((sum, val) => sum + Math.pow(val - recentMean, 2), 0) / recentValues.length;
    
    // Calcular ruido muestra a muestra
    const diffSum = recentValues.slice(1).reduce((sum, val, i) => {
      return sum + Math.pow(val - recentValues[i], 2);
    }, 0);
    const noisePower = diffSum / (recentValues.length - 1);
    
    let snr = 0;
    if (noisePower > 0) {
      snr = 10 * Math.log10(signalPower / noisePower);
    }
    
    // Métrica de calidad de señal normalizada (0-1)
    const varianceQuality = Math.min(1, Math.max(0, (variance * 10000) / 2));
    const snrQuality = Math.min(1, Math.max(0, (snr + 10) / 30));
    
    // Estabilidad de BPM reciente
    let bpmStability = 0;
    if (this.bpmHistory.length >= 5) {
      const recent = this.bpmHistory.slice(-5);
      const bpmMean = recent.reduce((sum, val) => sum + val, 0) / recent.length;
      const bpmVariance = recent.reduce((sum, val) => sum + Math.pow(val - bpmMean, 2), 0) / recent.length;
      bpmStability = Math.min(1, Math.max(0, 1 - (bpmVariance / 100)));
    }
    
    // Puntuación de calidad combinada
    this.signalQuality = (varianceQuality * 0.3) + (snrQuality * 0.5) + (bpmStability * 0.2);
  }
  
  /**
   * Actualizar umbral adaptativo para detección de picos
   */
  private updateAdaptiveThreshold(): void {
    if (this.signalBuffer.length < 10) return;
    
    // Obtener valores de señal recientes
    const recentValues = this.signalBuffer.slice(-30);
    
    // Calcular la amplitud pico-a-pico
    const min = Math.min(...recentValues);
    const max = Math.max(...recentValues);
    const peakToPeak = max - min;
    
    // Ajustar umbral basado en valor pico-a-pico
    this.adaptiveThreshold = this.SIGNAL_THRESHOLD * (0.5 + (peakToPeak * 0.5));
    
    // Mantener umbral en límites razonables
    this.adaptiveThreshold = Math.max(0.05, Math.min(0.5, this.adaptiveThreshold));
  }
  
  /**
   * Auto-reset si la calidad de señal es muy baja por periodo extendido
   */
  private autoResetIfSignalIsLow(amplitude: number): void {
    if (amplitude < this.LOW_SIGNAL_THRESHOLD) {
      this.lowSignalCount++;
      if (this.lowSignalCount >= this.LOW_SIGNAL_FRAMES) {
        this.resetDetectionStates();
      }
    } else {
      this.lowSignalCount = Math.max(0, this.lowSignalCount - 1);
    }
    
    // También verificar datos obsoletos
    const now = Date.now();
    if (this.lastPeakTime && (now - this.lastPeakTime > this.MAX_SIGNAL_AGE_MS)) {
      console.log("HeartBeatProcessor: Señal muy antigua, reseteando");
      this.resetDetectionStates();
    }
  }
  
  /**
   * Resetear estado interno de detección
   */
  private resetDetectionStates(): void {
    this.lastPeakTime = null;
    this.previousPeakTime = null;
    this.lastConfirmedPeak = false;
    this.peakCandidateIndex = null;
    this.peakCandidateValue = 0;
    this.peakConfirmationBuffer = [];
    this.values = [];
    this.lowSignalCount = 0;
    
    console.log("HeartBeatProcessor: Reset estados de detección (problema de calidad de señal)");
  }
  
  /**
   * Detectar picos usando umbral adaptativo
   */
  private detectPeak(normalizedValue: number, derivative: number): {
    isPeak: boolean;
    confidence: number;
  } {
    const now = Date.now();
    const timeSinceLastPeak = this.lastPeakTime
      ? now - this.lastPeakTime
      : Number.MAX_VALUE;
    
    // Imponer tiempo mínimo entre picos
    if (timeSinceLastPeak < this.MIN_PEAK_TIME_MS) {
      return { isPeak: false, confidence: 0 };
    }
    
    // Criterios simplificados para facilitar detección
    const isOverThreshold =
      derivative < this.DERIVATIVE_THRESHOLD &&
      normalizedValue > this.adaptiveThreshold * 0.5; // Reducido aún más para mejor detección
    
    // Calcular confianza basada en múltiples factores
    const amplitudeConfidence = Math.min(
      Math.max(Math.abs(normalizedValue) / (this.adaptiveThreshold * 0.9), 0),
      1
    );
    
    const derivativeConfidence = Math.min(
      Math.max(Math.abs(derivative) / Math.abs(this.DERIVATIVE_THRESHOLD * 0.4), 0),
      1
    );
    
    // Calcular confianza de temporización
    let timingConfidence = 0;
    if (this.bpmHistory.length > 0) {
      const avgBPM = this.calculateCurrentBPM();
      if (avgBPM > 0) {
        const expectedInterval = 60000 / avgBPM;
        const intervalDifference = Math.abs(timeSinceLastPeak - expectedInterval);
        timingConfidence = Math.max(0, 1 - (intervalDifference / expectedInterval));
      }
    }
    
    // Puntuación de confianza ponderada
    const confidence = 
      (amplitudeConfidence * 0.7) + 
      (derivativeConfidence * 0.2) + 
      (timingConfidence * 0.1);
    
    // Log para depuración
    if (isOverThreshold || confidence > 0.3) {
      console.log("HeartBeatProcessor: Posible pico detectado", {
        normalizedValue,
        derivative,
        threshold: this.adaptiveThreshold * 0.5,
        derivativeThreshold: this.DERIVATIVE_THRESHOLD,
        confidence,
        timeSinceLastPeak
      });
    }
    
    return { isPeak: isOverThreshold, confidence };
  }
  
  /**
   * Confirmar pico con reconocimiento de patrones para reducir falsos positivos
   */
  private confirmPeak(
    isPeak: boolean,
    normalizedValue: number,
    confidence: number
  ): boolean {
    // Añadir al buffer de confirmación
    this.peakConfirmationBuffer.push(normalizedValue);
    if (this.peakConfirmationBuffer.length > 5) {
      this.peakConfirmationBuffer.shift();
    }
    
    // Criterios simplificados de confirmación
    if (isPeak && !this.lastConfirmedPeak && confidence >= this.MIN_CONFIDENCE) {
      if (this.peakConfirmationBuffer.length >= 2) { // Reducido a 2 para mejor detección
        const len = this.peakConfirmationBuffer.length;
        
        // Verificar que el valor actual sea mayor que valores anteriores
        const isHighestRecent = normalizedValue > this.peakConfirmationBuffer[len-2];
        
        console.log("HeartBeatProcessor: Evaluando confirmación de pico", {
          normalizedValue,
          confidence,
          bufferLength: this.peakConfirmationBuffer.length,
          isHighestRecent,
          minConfidence: this.MIN_CONFIDENCE,
          buffer: [...this.peakConfirmationBuffer]
        });
        
        if (isHighestRecent || confidence > 0.5) { // Añadido OR para permitir picos con alta confianza
          this.lastConfirmedPeak = true;
          console.log("HeartBeatProcessor: PICO CONFIRMADO");
          return true;
        }
      }
    } else if (!isPeak) {
      this.lastConfirmedPeak = false;
    }
    
    return false;
  }
  
  /**
   * Actualizar cálculo de BPM con nuevo intervalo de pico
   */
  private updateBPM(): void {
    if (!this.lastPeakTime || !this.previousPeakTime) return;
    
    const interval = this.lastPeakTime - this.previousPeakTime;
    if (interval <= 0) return;
    
    const instantBPM = 60000 / interval;
    
    console.log("HeartBeatProcessor: Nuevo intervalo RR detectado", {
      interval,
      instantBPM,
      lastPeakTime: this.lastPeakTime,
      previousPeakTime: this.previousPeakTime
    });
    
    // Solo aceptar frecuencias cardíacas fisiológicamente plausibles
    if (instantBPM >= this.MIN_BPM && instantBPM <= this.MAX_BPM) {
      this.bpmHistory.push(instantBPM);
      
      // Almacenar intervalo RR para análisis de arritmia
      this.rrIntervals.push(interval);
      
      // Mantener tamaños de buffer razonables
      if (this.bpmHistory.length > this.RR_BUFFER_SIZE) {
        this.bpmHistory.shift();
      }
      
      if (this.rrIntervals.length > this.RR_BUFFER_SIZE) {
        this.rrIntervals.shift();
      }
      
      console.log("HeartBeatProcessor: BPM actualizado", {
        instantBPM,
        bpmHistory: [...this.bpmHistory],
        smoothBPM: this.getSmoothBPM()
      });
    } else {
      console.log("HeartBeatProcessor: BPM fuera de rango fisiológico", {
        instantBPM,
        minBPM: this.MIN_BPM,
        maxBPM: this.MAX_BPM
      });
    }
  }
  
  /**
   * Verificar arritmia basada en variabilidad de intervalo RR
   */
  private checkForArrhythmia(): void {
    if (this.rrIntervals.length < 6) return;
    
    // Obtener intervalos RR recientes
    const recentRR = this.rrIntervals.slice(-6);
    
    // Calcular promedio
    const avgRR = recentRR.reduce((sum, val) => sum + val, 0) / recentRR.length;
    
    // Calcular RMSSD (Root Mean Square of Successive Differences)
    let sumSquaredDiff = 0;
    for (let i = 1; i < recentRR.length; i++) {
      const diff = recentRR[i] - recentRR[i-1];
      sumSquaredDiff += diff * diff;
    }
    const rmssd = Math.sqrt(sumSquaredDiff / (recentRR.length - 1));
    
    // Calcular irregularidad RR
    const rrVariability = (rmssd / avgRR) * 100;
    
    // Verificar si el intervalo más reciente es significativamente más corto (latido prematuro)
    const latestRR = recentRR[recentRR.length - 1];
    const prematureBeat = latestRR < (avgRR * this.PREMATURE_BEAT_THRESHOLD);
    
    // Verificar condiciones de arritmia
    const isIrregular = rrVariability > this.HR_VAR_THRESHOLD || prematureBeat;
    
    // Determinar tipo de arritmia
    if (isIrregular) {
      this.irregularBeatCount++;
      this.consecutiveIrregularBeats++;
      
      if (this.consecutiveIrregularBeats >= this.CONSECUTIVE_IRREGULAR_BEATS) {
        this.arrhythmiaDetected = true;
        this.arrythmiaRiskScore = Math.min(100, this.arrythmiaRiskScore + 25);
        
        // Determinar tipo de arritmia
        const currentBPM = 60000 / avgRR;
        if (currentBPM < 50) {
          this.arrhythmiaType = 'BRADICARDIA';
        } else if (currentBPM > 100) {
          this.arrhythmiaType = 'TAQUICARDIA';
        } else if (prematureBeat) {
          this.arrhythmiaType = 'LATIDO PREMATURO';
        } else {
          this.arrhythmiaType = 'IRREGULARIDAD';
        }
        
        if (this.DEBUG_MODE) {
          console.log("HeartBeatProcessor - Arritmia detectada:", {
            tipo: this.arrhythmiaType,
            variabilidad: rrVariability.toFixed(1) + '%',
            rmssd,
            avgRR,
            latidosPrematuros: prematureBeat
          });
        }
      }
    } else {
      this.consecutiveIrregularBeats = 0;
      this.arrythmiaRiskScore = Math.max(0, this.arrythmiaRiskScore - 5);
      
      if (this.arrythmiaRiskScore < 30) {
        this.arrhythmiaDetected = false;
        this.arrhythmiaType = '';
      }
    }
  }
  
  /**
   * Obtener valor BPM suavizado
   */
  private getSmoothBPM(): number {
    const rawBPM = this.calculateCurrentBPM();
    if (this.smoothBPM === 0) {
      this.smoothBPM = rawBPM;
      return rawBPM;
    }
    
    // Aplicar suavizado exponencial
    this.smoothBPM = (1 - this.BPM_ALPHA) * this.smoothBPM + this.BPM_ALPHA * rawBPM;
    return this.smoothBPM;
  }
  
  /**
   * Calcular BPM actual desde historial
   */
  private calculateCurrentBPM(): number {
    if (this.bpmHistory.length < 3) {
      return 0;
    }
    
    // Usar toda la historia para más estabilidad
    if (this.bpmHistory.length < 5) {
      const sum = this.bpmHistory.reduce((acc, val) => acc + val, 0);
      return sum / this.bpmHistory.length;
    }
    
    // Usar media recortada para estabilidad (eliminar valores atípicos)
    const sorted = [...this.bpmHistory].sort((a, b) => a - b);
    const trimPercent = 0.2; // Eliminar 20% de cada extremo
    const trimCount = Math.floor(sorted.length * trimPercent);
    
    // Omitir recorte si no tenemos suficientes muestras
    const trimmed = sorted.length > 5 ? 
      sorted.slice(trimCount, sorted.length - trimCount) : 
      sorted;
    
    if (!trimmed.length) return 0;
    
    // Calcular promedio ponderado (valores recientes cuentan más)
    let weightedSum = 0;
    let weightSum = 0;
    
    for (let i = 0; i < trimmed.length; i++) {
      // Ponderación exponencial - valores más recientes tienen mayor peso
      const weight = Math.pow(this.PEAK_AGE_WEIGHT, trimmed.length - 1 - i);
      weightedSum += trimmed[i] * weight;
      weightSum += weight;
    }
    
    return weightedSum / weightSum;
  }
  
  /**
   * Obtener BPM final después de sesión de medición
   */
  public getFinalBPM(): number {
    if (this.bpmHistory.length < 5) {
      return 0;
    }
    
    // Eliminación de valores atípicos para resultado final
    const sorted = [...this.bpmHistory].sort((a, b) => a - b);
    const cut = Math.max(1, Math.round(sorted.length * 0.15));
    const finalSet = sorted.slice(cut, sorted.length - cut);
    
    if (!finalSet.length) return 0;
    
    const sum = finalSet.reduce((acc, val) => acc + val, 0);
    return Math.round(sum / finalSet.length);
  }
  
  /**
   * Reset completo del estado del procesador
   */
  public reset(): void {
    this.signalBuffer = [];
    this.medianBuffer = [];
    this.movingAverageBuffer = [];
    this.lowPassBuffer = [];
    this.highPassBuffer = [];
    this.peakConfirmationBuffer = [];
    this.bpmHistory = [];
    this.rrIntervals = [];
    this.values = [];
    this.smoothBPM = 0;
    this.lastPeakTime = null;
    this.previousPeakTime = null;
    this.lastConfirmedPeak = false;
    this.lastBeepTime = 0;
    this.baseline = 0;
    this.lastValue = 0;
    this.smoothedValue = 0;
    this.peakCandidateIndex = null;
    this.peakCandidateValue = 0;
    this.lowSignalCount = 0;
    this.adaptiveThreshold = this.SIGNAL_THRESHOLD;
    this.irregularBeatCount = 0;
    this.consecutiveIrregularBeats = 0;
    this.arrhythmiaDetected = false;
    this.arrythmiaRiskScore = 0;
    this.arrhythmiaType = '';
    this.startTime = Date.now();
    this.lastSignalTime = this.startTime;
    this.signalQuality = 0;
    
    console.log("HeartBeatProcessor: Reseteo completo del sistema");
  }
  
  /**
   * Obtener calidad de señal
   */
  public getSignalQuality(): number {
    return Math.round(this.signalQuality * 100);
  }
  
  /**
   * Método para obtener valores actuales (debugging)
   */
  public getDebugState(): any {
    return {
      bpm: Math.round(this.getSmoothBPM()),
      signalQuality: this.getSignalQuality(),
      adaptiveThreshold: this.adaptiveThreshold,
      arrhythmiaDetected: this.arrhythmiaDetected,
      arrhythmiaType: this.arrhythmiaType,
      lastPeakTime: this.lastPeakTime,
      audioContextState: this.audioContext?.state || 'no inicializado'
    };
  }
} 