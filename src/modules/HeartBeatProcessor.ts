
export class HeartBeatProcessor {
  private readonly SAMPLE_RATE = 30;
  private readonly WINDOW_SIZE = 60;
  private readonly MIN_PEAK_DISTANCE = 15;
  private readonly MAX_BPM = 200;
  private readonly MIN_BPM = 40;
  private readonly BEEP_FREQUENCY = 1000;
  private readonly BEEP_DURATION = 50;
  private readonly SIGNAL_THRESHOLD = 0.15;
  private readonly MIN_CONFIDENCE = 0.32;
  private readonly DERIVATIVE_THRESHOLD = -0.001;
  private readonly MIN_PEAK_TIME_MS = 400;  // Único cambio: aumentado de 250ms a 400ms para filtrar falsos positivos muy cercanos

  private signalBuffer: number[] = [];
  private lastPeakTime: number | null = null;
  private previousPeakTime: number | null = null;
  private audioContext: AudioContext | null = null;
  private bpmHistory: number[] = [];
  private lastBeepTime: number = 0;
  private baseline: number = 0;
  private lastValue: number = 0;
  private values: number[] = [];

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
    this.signalBuffer.push(value);
    if (this.signalBuffer.length > this.WINDOW_SIZE) {
      this.signalBuffer.shift();
    }

    if (this.signalBuffer.length < 30) {
      return { bpm: 0, confidence: 0, isPeak: false };
    }

    this.baseline = this.baseline * 0.98 + value * 0.02;
    const normalizedValue = value - this.baseline;

    this.values.push(value);
    if (this.values.length > 3) this.values.shift();

    const smoothDerivative = this.values.length > 2 ? 
      (this.values[2] - this.values[0]) / 2 : 
      value - this.lastValue;

    const { isPeak, confidence } = this.detectPeak(normalizedValue, smoothDerivative);
    this.lastValue = value;

    if (isPeak && confidence > this.MIN_CONFIDENCE) {
      const currentTime = Date.now();
      const timeSinceLastPeak = this.lastPeakTime ? currentTime - this.lastPeakTime : Infinity;
      
      if (timeSinceLastPeak >= this.MIN_PEAK_TIME_MS) {
        this.previousPeakTime = this.lastPeakTime;
        this.lastPeakTime = currentTime;
        this.playBeep(0.1);
        this.updateBPM();
      }
    }

    const bpm = this.calculateCurrentBPM();

    return {
      bpm,
      confidence,
      isPeak
    };
  }

  private detectPeak(normalizedValue: number, derivative: number): { isPeak: boolean; confidence: number } {
    const currentTime = Date.now();
    const timeSinceLastPeak = this.lastPeakTime ? currentTime - this.lastPeakTime : Infinity;
    
    if (timeSinceLastPeak < this.MIN_PEAK_TIME_MS) {
      return { isPeak: false, confidence: 0 };
    }

    const isPeak = derivative < this.DERIVATIVE_THRESHOLD && 
                   normalizedValue > this.SIGNAL_THRESHOLD &&
                   this.lastValue > this.baseline;

    const amplitudeConfidence = Math.min(Math.max(Math.abs(normalizedValue) / (this.SIGNAL_THRESHOLD * 2), 0), 1);
    const derivativeConfidence = Math.min(Math.max(Math.abs(derivative) / Math.abs(this.DERIVATIVE_THRESHOLD), 0), 1);
    const confidence = (amplitudeConfidence + derivativeConfidence) / 2;

    return { isPeak, confidence };
  }

  private updateBPM() {
    if (!this.lastPeakTime || !this.previousPeakTime) {
      return;
    }

    const interval = this.lastPeakTime - this.previousPeakTime;
    
    if (interval <= 0) {
      console.log("[UpdateBPM] Invalid interval", { interval });
      return;
    }

    const instantBPM = 60000 / interval;

    if (instantBPM >= this.MIN_BPM && instantBPM <= this.MAX_BPM) {
      this.bpmHistory.push(instantBPM);
      
      if (this.bpmHistory.length > 5) {
        this.bpmHistory.shift();
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
    this.signalBuffer = [];
    this.lastPeakTime = null;
    this.previousPeakTime = null;
    this.bpmHistory = [];
    this.lastBeepTime = 0;
    this.baseline = 0;
    this.lastValue = 0;
    this.values = [];
  }
}
