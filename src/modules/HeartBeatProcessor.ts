
export class HeartBeatProcessor {
  private readonly SAMPLE_RATE = 30;
  private readonly WINDOW_SIZE = 60; // Reducido para mayor sensibilidad
  private readonly MIN_PEAK_DISTANCE = 15; // ~240 BPM máximo
  private readonly MAX_BPM = 200;
  private readonly MIN_BPM = 40;
  private readonly BEEP_FREQUENCY = 1000; // 1kHz
  private readonly BEEP_DURATION = 50; // 50ms
  private readonly SIGNAL_THRESHOLD = 0.3; // Umbral de señal normalizada

  private signalBuffer: number[] = [];
  private lastPeakTime: number = 0;
  private audioContext: AudioContext | null = null;
  private bpmHistory: number[] = [];
  private lastBeepTime: number = 0;
  private baseline: number = 0;
  private lastValue: number = 0;

  constructor() {
    this.initAudio();
  }

  private async initAudio() {
    try {
      this.audioContext = new AudioContext();
      await this.audioContext.resume();
      await this.playBeep(0.01); // Warm up
      console.log("HeartBeatProcessor: Audio initialized successfully", {
        sampleRate: this.audioContext.sampleRate,
        state: this.audioContext.state
      });
    } catch (error) {
      console.error("HeartBeatProcessor: Error initializing audio", error);
    }
  }

  private async playBeep(volume: number = 0.1) {
    if (!this.audioContext) {
      console.warn("HeartBeatProcessor: AudioContext no disponible");
      return;
    }

    const currentTime = Date.now();
    if (currentTime - this.lastBeepTime < 200) {
      console.log("HeartBeatProcessor: Beep ignorado (muy cercano al anterior)");
      return;
    }

    try {
      const oscillator = this.audioContext.createOscillator();
      const gainNode = this.audioContext.createGain();

      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(this.BEEP_FREQUENCY, this.audioContext.currentTime);

      gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
      gainNode.gain.linearRampToValueAtTime(volume, this.audioContext.currentTime + 0.01);
      gainNode.gain.linearRampToValueAtTime(0, this.audioContext.currentTime + 0.05);

      oscillator.connect(gainNode);
      gainNode.connect(this.audioContext.destination);

      oscillator.start();
      oscillator.stop(this.audioContext.currentTime + 0.05);

      this.lastBeepTime = currentTime;
      console.log("HeartBeatProcessor: Beep reproducido", {
        volume,
        frequency: this.BEEP_FREQUENCY,
        time: currentTime
      });
    } catch (error) {
      console.error("HeartBeatProcessor: Error playing beep", error);
    }
  }

  processSignal(value: number): {
    bpm: number;
    confidence: number;
    isPeak: boolean;
  } {
    console.log("HeartBeatProcessor: Procesando señal", {
      inputValue: value,
      bufferSize: this.signalBuffer.length,
      lastValue: this.lastValue,
      baseline: this.baseline
    });

    // Actualizar buffer
    this.signalBuffer.push(value);
    if (this.signalBuffer.length > this.WINDOW_SIZE) {
      this.signalBuffer.shift();
    }

    // Calcular línea base con media móvil
    this.baseline = this.baseline * 0.95 + value * 0.05;
    const normalizedValue = value - this.baseline;

    // Detectar pico
    const derivative = value - this.lastValue;
    const { isPeak, confidence } = this.detectPeak(normalizedValue, derivative);
    this.lastValue = value;

    if (isPeak) {
      console.log("HeartBeatProcessor: Pico detectado", {
        rawValue: value,
        normalizedValue,
        derivative,
        confidence,
        timeSinceLastPeak: Date.now() - this.lastPeakTime
      });
      this.playBeep(0.1);
      this.updateBPM();
    }

    const bpm = this.calculateCurrentBPM();

    console.log("HeartBeatProcessor: Resultado del procesamiento", {
      bpm,
      confidence,
      isPeak,
      historyLength: this.bpmHistory.length
    });

    return {
      bpm,
      confidence,
      isPeak
    };
  }

  private detectPeak(normalizedValue: number, derivative: number): { isPeak: boolean; confidence: number } {
    const currentTime = Date.now();
    const timeSinceLastPeak = currentTime - this.lastPeakTime;
    
    console.log("HeartBeatProcessor: Analizando pico", {
      normalizedValue,
      derivative,
      timeSinceLastPeak,
      threshold: this.SIGNAL_THRESHOLD,
      baseline: this.baseline
    });

    // Verificar tiempo mínimo entre picos
    if (timeSinceLastPeak < (1000 * this.MIN_PEAK_DISTANCE) / this.SAMPLE_RATE) {
      return { isPeak: false, confidence: 0 };
    }

    // Detectar pico usando derivada y valor normalizado
    const isPeak = derivative < -0.1 && // Pendiente negativa
                   this.lastValue > this.baseline + this.SIGNAL_THRESHOLD && // Sobre umbral
                   timeSinceLastPeak > 250; // Al menos 250ms desde último pico

    if (isPeak) {
      this.lastPeakTime = currentTime;
    }

    // Calcular confianza basada en la amplitud de la señal
    const signalStrength = Math.abs(normalizedValue) / this.SIGNAL_THRESHOLD;
    const confidence = Math.min(Math.max(signalStrength - 0.5, 0), 1);

    return { isPeak, confidence };
  }

  private updateBPM() {
    const currentTime = Date.now();
    const timeSinceLastPeak = currentTime - this.lastPeakTime;
    
    if (timeSinceLastPeak > 0) {
      const instantBPM = 60000 / timeSinceLastPeak;
      
      if (instantBPM >= this.MIN_BPM && instantBPM <= this.MAX_BPM) {
        this.bpmHistory.push(instantBPM);
        if (this.bpmHistory.length > 5) {
          this.bpmHistory.shift();
        }
        
        console.log("HeartBeatProcessor: BPM actualizado", {
          instantBPM,
          historyLength: this.bpmHistory.length,
          bpmHistory: this.bpmHistory,
          timeSinceLastPeak
        });
      } else {
        console.log("HeartBeatProcessor: BPM fuera de rango", {
          instantBPM,
          min: this.MIN_BPM,
          max: this.MAX_BPM
        });
      }
    }
  }

  private calculateCurrentBPM(): number {
    if (this.bpmHistory.length < 3) {
      console.log("HeartBeatProcessor: Historia BPM insuficiente", {
        currentLength: this.bpmHistory.length,
        required: 3
      });
      return 0;
    }

    // Usar mediana para estabilidad
    const sortedBPMs = [...this.bpmHistory].sort((a, b) => a - b);
    const medianBPM = sortedBPMs[Math.floor(sortedBPMs.length / 2)];
    
    console.log("HeartBeatProcessor: BPM calculado", {
      medianBPM,
      history: this.bpmHistory,
      sorted: sortedBPMs
    });

    return Math.round(medianBPM);
  }

  reset() {
    console.log("HeartBeatProcessor: Reseteando procesador");
    this.signalBuffer = [];
    this.lastPeakTime = 0;
    this.bpmHistory = [];
    this.lastBeepTime = 0;
    this.baseline = 0;
    this.lastValue = 0;
  }
}
