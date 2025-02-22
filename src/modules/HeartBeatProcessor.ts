export class HeartBeatProcessor {
  private readonly SAMPLE_RATE = 30;
  private readonly WINDOW_SIZE = 60;
  private readonly MIN_PEAK_DISTANCE = 15;
  private readonly MAX_BPM = 200;
  private readonly MIN_BPM = 40;
  private readonly BEEP_FREQUENCY = 1000;
  private readonly BEEP_DURATION = 50;
  private readonly SIGNAL_THRESHOLD = 0.15;
  private readonly MIN_CONFIDENCE = 0.3;

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
      await this.playBeep(0.01);
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

    this.signalBuffer.push(value);
    if (this.signalBuffer.length > this.WINDOW_SIZE) {
      this.signalBuffer.shift();
    }

    if (this.signalBuffer.length < 30) {
      return { bpm: 0, confidence: 0, isPeak: false };
    }

    this.baseline = this.baseline * 0.98 + value * 0.02;
    const normalizedValue = value - this.baseline;

    const derivative = value - this.lastValue;
    const { isPeak, confidence } = this.detectPeak(normalizedValue, derivative);
    this.lastValue = value;

    if (isPeak && confidence > this.MIN_CONFIDENCE) {
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
    
    if (timeSinceLastPeak < 250) {
      return { isPeak: false, confidence: 0 };
    }

    const isPeak = derivative < -0.05 &&
                   normalizedValue > this.SIGNAL_THRESHOLD &&
                   this.lastValue > this.baseline;

    if (isPeak) {
      this.lastPeakTime = currentTime;
    }

    const amplitude = Math.abs(normalizedValue);
    const confidence = Math.min(Math.max(amplitude / (this.SIGNAL_THRESHOLD * 2), 0), 1);

    return { isPeak, confidence };
  }

  private updateBPM() {
    const currentTime = Date.now();
    const timeSinceLastPeak = currentTime - this.lastPeakTime;
    
    if (timeSinceLastPeak > 0) {
      const instantBPM = 60000 / timeSinceLastPeak;
      
      if (instantBPM >= this.MIN_BPM && instantBPM <= this.MAX_BPM) {
        this.bpmHistory.push(instantBPM);
        if (this.bpmHistory.length > 8) {
          this.bpmHistory.shift();
        }
      }
    }
  }

  private calculateCurrentBPM(): number {
    if (this.bpmHistory.length < 2) {
      return 0;
    }

    const sortedBPMs = [...this.bpmHistory].sort((a, b) => a - b);
    const medianBPM = sortedBPMs[Math.floor(sortedBPMs.length / 2)];
    
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
