export class HeartBeatProcessor {
  // ────────── CONFIGURACIONES PRINCIPALES ──────────
  private readonly SAMPLE_RATE = 30;
  private readonly WINDOW_SIZE = 60;
  private readonly MIN_BPM = 40;
  private readonly MAX_BPM = 200; // Se mantiene amplio para no perder picos fuera de rango
  private readonly SIGNAL_THRESHOLD = 0.40; 
  private readonly MIN_CONFIDENCE = 0.60;
  private readonly DERIVATIVE_THRESHOLD = -0.03; // CLAVE: Umbral negativo para detectar caídas, no subidas
  private readonly MIN_PEAK_TIME_MS = 400; 
  private readonly WARMUP_TIME_MS = 3000; 

  // Parámetros de filtrado
  private readonly MEDIAN_FILTER_WINDOW = 3; 
  private readonly MOVING_AVERAGE_WINDOW = 3; 
  private readonly EMA_ALPHA = 0.4; 
  private readonly BASELINE_FACTOR = 1.0; 

  // Parámetros de beep - MODIFICADO para que suene en la caída
  private readonly BEEP_PRIMARY_FREQUENCY = 880; 
  private readonly BEEP_SECONDARY_FREQUENCY = 440; 
  private readonly BEEP_DURATION = 80; 
  private readonly BEEP_VOLUME = 0.9; 
  private readonly MIN_BEEP_INTERVAL_MS = 300;

  // Detección de señal baja
  private readonly LOW_SIGNAL_THRESHOLD = 0.03;
  private readonly LOW_SIGNAL_FRAMES = 10;
  private lowSignalCount = 0;

  // Buffers y variables de estado
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
  
  // NUEVO: Variables para detección de fase dicrótica (caída)
  private readonly DICROTIC_THRESHOLD = -0.15; // Umbral para detectar la fase dicrótica (caída)
  private readonly MIN_DICROTIC_SEPARATION_MS = 150; // Mínima separación entre pico sistólico y punto dicrótico
  private readonly MAX_DICROTIC_SEPARATION_MS = 300; // Máxima separación entre pico sistólico y punto dicrótico
  private lastSystolicPeakTime: number = 0; // Tiempo del último pico sistólico detectado
  private lastDicroticPointTime: number = 0; // Tiempo del último punto dicrótico detectado
  private inSystolicPhase: boolean = false; // Indica si estamos en fase sistólica (subida)
  private peakDetectionInhibited: boolean = false; // Previene detecciones múltiples
  private systolicPeakValue: number = 0; // Valor del último pico sistólico
  
  // NUEVO: Contadores de arrhythmia sin límite
  private arrhythmiaCount: number = 0;
  
  // NUEVO: Amplificación visual para latigazo característico
  private readonly VISUAL_AMPLIFICATION = 1.5;
  private maxObservedAmplitude: number = 0;

  constructor() {
    this.startTime = Date.now();
    this.initAudio();
    console.log("HeartBeatProcessor: Instance created");
  }

  private async initAudio() {
    try {
      // Solo inicializar AudioContext bajo demanda (cuando realmente se necesite)
      if (typeof window !== 'undefined' && window.AudioContext) {
        // Esperar interacción del usuario antes de crear el contexto de audio
        document.addEventListener('click', () => {
          if (!this.audioContext) {
            this.audioContext = new AudioContext();
            console.log("Audio context initialized on user interaction");
          }
        }, { once: true });
      }
    } catch (error) {
      console.error("Failed to initialize audio:", error);
    }
  }

  /**
   * MEJORADO: Beep ahora sincronizado con la fase dicrótica (caída)
   */
  private async playBeep(volume: number = this.BEEP_VOLUME) {
    try {
      const currentTime = Date.now();
      
      // Evitar beeps demasiado cercanos
      if (currentTime - this.lastBeepTime < this.MIN_BEEP_INTERVAL_MS) {
        return;
      }
      
      this.lastBeepTime = currentTime;
      
      if (!this.audioContext) {
        this.audioContext = new AudioContext();
      }
      
      // Crear oscilador para la frecuencia principal
      const oscillator = this.audioContext.createOscillator();
      oscillator.type = 'sine';
      oscillator.frequency.value = this.BEEP_PRIMARY_FREQUENCY;
      
      // Crear nodo de ganancia para controlar volumen
      const gainNode = this.audioContext.createGain();
      gainNode.gain.value = volume;
      
      // Conectar nodos y empezar a reproducir
      oscillator.connect(gainNode);
      gainNode.connect(this.audioContext.destination);
      
      const startTime = this.audioContext.currentTime;
      const duration = this.BEEP_DURATION / 1000; // Convertir a segundos
      
      // Configurar envolvente ADSR natural para un beep más suave
      // Ataque rápido, decaimiento suave
      gainNode.gain.setValueAtTime(0, startTime);
      gainNode.gain.linearRampToValueAtTime(volume, startTime + 0.01);
      gainNode.gain.linearRampToValueAtTime(volume * 0.6, startTime + 0.05);
      gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
      
      oscillator.start(startTime);
      oscillator.stop(startTime + duration);
      
      // Devolver promesa que se resuelve cuando termina el beep
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          resolve();
        }, this.BEEP_DURATION + 10);
      });
    } catch (error) {
      console.error("Error playing beep:", error);
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
    
    return this.movingAverageBuffer.reduce((sum, val) => sum + val, 0) / this.movingAverageBuffer.length;
  }

  private calculateEMA(value: number): number {
    this.smoothedValue = this.EMA_ALPHA * value + (1 - this.EMA_ALPHA) * this.smoothedValue;
    return this.smoothedValue;
  }

  /**
   * REDISEÑADO: Proceso de señal para detectar naturalmente tanto la fase sistólica como la dicrótica
   */
  public processSignal(value: number): {
    bpm: number;
    confidence: number;
    isPeak: boolean;
    filteredValue: number;
    arrhythmiaCount: number;
    // NUEVO: Indicar fase dicrótica (caída) separada de la detección de pico
    isDicroticPoint: boolean;
    visualAmplitude: number; // NUEVO: Valor amplificado para visualización
  } {
    // Aplicar filtros para suavizar la señal
    const medianFiltered = this.medianFilter(value);
    const movingAverage = this.calculateMovingAverage(medianFiltered);
    const filteredValue = this.calculateEMA(movingAverage);
    
    // Actualizar buffer de valores
    this.values.push(filteredValue);
    if (this.values.length > this.WINDOW_SIZE) {
      this.values.shift();
    }
    
    // Calcular derivada de la señal (tasa de cambio)
    const derivative = filteredValue - this.lastValue;
    this.lastValue = filteredValue;
    
    // Actualizar máxima amplitud observada para normalización visual
    if (filteredValue > this.maxObservedAmplitude) {
      this.maxObservedAmplitude = filteredValue;
    }
    
    // Calcular línea base adaptativa
    if (this.values.length > 10) {
      // Usar percentil bajo como línea base para mejorar detección
      const sorted = [...this.values].sort((a, b) => a - b);
      const percentile25Index = Math.floor(sorted.length * 0.25);
      this.baseline = sorted[percentile25Index] * this.BASELINE_FACTOR;
    }
    
    // Normalizar el valor para detección
    const normalizedValue = filteredValue - this.baseline;
    
    // Reiniciar automáticamente si la señal es baja
    this.autoResetIfSignalIsLow(normalizedValue);
    
    // REDISEÑADO: Implementar detección de fases cardíacas naturales
    
    // Variables de resultado
    let isPeak = false;
    let isDicroticPoint = false;
    let confidence = 0;
    
    const currentTime = Date.now();
    
    // FASE 1: Detectar fase sistólica (subida)
    // Buscar un pico cuando la derivada cambia de positiva a negativa (cima de la onda)
    if (!this.peakDetectionInhibited && 
        derivative < 0 && 
        normalizedValue > this.SIGNAL_THRESHOLD && 
        !this.isInWarmup()) {
      
      // Detectamos un pico sistólico potencial
      const { isPeak: confirmedPeak, confidence: peakConfidence } = 
        this.detectPeak(normalizedValue, derivative);
      
      if (confirmedPeak) {
        // Registrar tiempo del pico sistólico
        this.lastSystolicPeakTime = currentTime;
        this.systolicPeakValue = normalizedValue;
        this.inSystolicPhase = true;
        
        // Inhibir nuevas detecciones de picos por un tiempo
        this.peakDetectionInhibited = true;
        setTimeout(() => {
          this.peakDetectionInhibited = false;
        }, this.MIN_PEAK_TIME_MS / 2);
        
        // Marcar como pico normal (sistólico)
        isPeak = true;
        confidence = peakConfidence;
        
        // No reproducir beep aquí - se hará en la fase dicrótica
      }
    }
    
    // FASE 2: Detectar fase dicrótica (caída)
    if (this.inSystolicPhase && 
        currentTime - this.lastSystolicPeakTime >= this.MIN_DICROTIC_SEPARATION_MS &&
        currentTime - this.lastSystolicPeakTime <= this.MAX_DICROTIC_SEPARATION_MS &&
        derivative <= this.DICROTIC_THRESHOLD &&
        currentTime - this.lastDicroticPointTime >= this.MIN_PEAK_TIME_MS) {
      
      // Hemos detectado un punto dicrótico (caída abrupta después del pico)
      isDicroticPoint = true;
      this.lastDicroticPointTime = currentTime;
      this.inSystolicPhase = false;
      
      // AQUÍ es donde reproducimos el beep - en la fase dicrótica
      this.playBeep(this.BEEP_VOLUME);
      
      // Actualizar tiempos para cálculo de BPM
      if (this.lastPeakTime !== null) {
        this.previousPeakTime = this.lastPeakTime;
      }
      this.lastPeakTime = currentTime;
      
      // Actualizar BPM
      this.updateBPM();
    }
    
    // Calcular valor amplificado para visualización
    let visualAmplitude = normalizedValue;
    if (this.maxObservedAmplitude > 0) {
      // Normalizar y amplificar para crear efecto de "latigazo"
      const normalizedVisual = normalizedValue / this.maxObservedAmplitude;
      visualAmplitude = Math.pow(normalizedVisual, 0.7) * this.VISUAL_AMPLIFICATION;
    }
    
    return {
      bpm: this.getSmoothBPM(),
      confidence,
      isPeak,
      filteredValue: normalizedValue,
      arrhythmiaCount: this.arrhythmiaCount,
      isDicroticPoint,
      visualAmplitude
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
    this.peakCandidateIndex = null;
    this.peakCandidateValue = 0;
    this.peakConfirmationBuffer = [];
    this.lastConfirmedPeak = false;
    this.inSystolicPhase = false;
    this.peakDetectionInhibited = false;
    
    // No reiniciar el contador de arritmias
    console.log("HeartBeatProcessor: Detection states reset due to low signal");
  }

  /**
   * Detecta picos sistólicos (no dicróticos)
   */
  private detectPeak(normalizedValue: number, derivative: number): {
    isPeak: boolean;
    confidence: number;
  } {
    // Verificar si tenemos un potencial pico analizando la derivada
    const isPotentialPeak = derivative < this.DERIVATIVE_THRESHOLD;
    
    // Verificar intervalo de tiempo mínimo entre picos
    const currentTime = Date.now();
    const sufficientTimeSinceLastPeak = 
      this.lastPeakTime === null || 
      (currentTime - this.lastPeakTime) > this.MIN_PEAK_TIME_MS;
    
    // Calcular confianza basada en amplitud y derivada
    let confidence = 0;
    
    if (normalizedValue > this.SIGNAL_THRESHOLD) {
      // La confianza aumenta con la amplitud de la señal
      confidence = Math.min(1.0, normalizedValue / (this.SIGNAL_THRESHOLD * 2));
      
      // La derivada negativa fuerte indica un pico más definido
      if (derivative < this.DERIVATIVE_THRESHOLD * 2) {
        confidence += 0.2;
      }
      
      confidence = Math.min(confidence, 1.0);
    }
    
    // Decidir si es un pico basado en los criterios
    const isPeak = 
      isPotentialPeak && 
      sufficientTimeSinceLastPeak && 
      confidence >= this.MIN_CONFIDENCE;
    
    return {
      isPeak,
      confidence
    };
  }

  /**
   * Actualiza el BPM basado en los intervalos entre picos
   */
  private updateBPM() {
    if (this.previousPeakTime !== null && this.lastPeakTime !== null) {
      const interval = this.lastPeakTime - this.previousPeakTime;
      const instantBPM = Math.round(60000 / interval);
      
      // Solo considerar BPM dentro del rango fisiológico
      if (instantBPM >= this.MIN_BPM && instantBPM <= this.MAX_BPM) {
        this.bpmHistory.push(instantBPM);
        
        // Mantener un historial limitado
        if (this.bpmHistory.length > 5) {
          this.bpmHistory.shift();
        }
        
        // Actualizar BPM suavizado
        const currentBPM = this.calculateCurrentBPM();
        this.smoothBPM = this.BPM_ALPHA * currentBPM + (1 - this.BPM_ALPHA) * (this.smoothBPM || currentBPM);
      }
    }
  }

  private getSmoothBPM(): number {
    return Math.round(this.smoothBPM);
  }

  /**
   * Calcula el BPM actual basado en el historial reciente
   */
  private calculateCurrentBPM(): number {
    if (this.bpmHistory.length === 0) return 0;
    
    // Usar mediana para mayor robustez
    const sorted = [...this.bpmHistory].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    
    return median;
  }

  /**
   * Obtiene el BPM final (para mostrar al finalizar la medición)
   */
  public getFinalBPM(): number {
    // Si tenemos suficientes datos, usar el BPM suavizado
    if (this.bpmHistory.length >= 3) {
      return Math.round(this.smoothBPM);
    }
    
    // Si no hay suficientes datos, calcular basado en lo disponible
    if (this.bpmHistory.length > 0) {
      const sum = this.bpmHistory.reduce((acc, val) => acc + val, 0);
      return Math.round(sum / this.bpmHistory.length);
    }
    
    return 0;
  }

  /**
   * Reinicia el procesador
   */
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
    this.lastSystolicPeakTime = 0;
    this.lastDicroticPointTime = 0;
    this.inSystolicPhase = false;
    this.peakDetectionInhibited = false;
    this.systolicPeakValue = 0;
    this.maxObservedAmplitude = 0;
    
    // No reiniciar el contador de arritmias
    // this.arrhythmiaCount = 0;
    
    console.log("HeartBeatProcessor: Reset complete");
  }

  /**
   * Obtiene los intervalos RR para análisis de arritmias
   */
  public getRRIntervals(): { intervals: number[]; lastPeakTime: number | null; amplitudes?: number[] } {
    // Calcular intervalos RR a partir de los tiempos de pico
    const intervals: number[] = [];
    
    if (this.previousPeakTime !== null && this.lastPeakTime !== null) {
      intervals.push(this.lastPeakTime - this.previousPeakTime);
    }
    
    // Incluir información de amplitud como dato adicional para el detector de arritmias
    const amplitudes = this.values.length > 0 ? [this.values[this.values.length - 1]] : undefined;
    
    return {
      intervals,
      lastPeakTime: this.lastPeakTime,
      amplitudes
    };
  }
  
  /**
   * Incrementar contador de arritmias - SIN LÍMITE
   */
  public incrementArrhythmiaCount(): void {
    this.arrhythmiaCount++;
  }
  
  /**
   * Obtener contador de arritmias
   */
  public getArrhythmiaCount(): number {
    return this.arrhythmiaCount;
  }
}
