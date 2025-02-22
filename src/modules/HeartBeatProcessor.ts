
export class HeartBeatProcessor {
  private readonly SAMPLE_RATE = 30;
  private readonly WINDOW_SIZE = 90;
  private readonly MIN_PEAK_DISTANCE = 12;
  private readonly MAX_BPM = 200;
  private readonly MIN_BPM = 40;
  private readonly BEEP_FREQUENCY = 1000; // 1kHz
  private readonly BEEP_DURATION = 50; // 50ms

  private signalBuffer: number[] = [];
  private lastPeakTime: number = 0;
  private audioContext: AudioContext | null = null;
  private bpmHistory: number[] = [];
  private lastBeepTime: number = 0;

  constructor() {
    this.initAudio();
  }

  private async initAudio() {
    try {
      this.audioContext = new AudioContext();
      // Warm up audio context with silent beep
      await this.playBeep(0.01);
      console.log("HeartBeatProcessor: Audio initialized");
    } catch (error) {
      console.error("HeartBeatProcessor: Error initializing audio", error);
    }
  }

  private async playBeep(volume: number = 0.1) {
    if (!this.audioContext) return;

    const currentTime = Date.now();
    if (currentTime - this.lastBeepTime < 200) return; // Prevent beep spam

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

    const normalizedValue = this.normalizeValue(value);
    const { isPeak, confidence } = this.detectPeak(normalizedValue);
    
    if (isPeak) {
      this.playBeep();
      this.updateBPM();
    }

    const bpm = this.calculateCurrentBPM();
    
    console.log("HeartBeatProcessor: Análisis", {
      value: normalizedValue,
      isPeak,
      bpm,
      confidence
    });

    return {
      bpm,
      confidence,
      isPeak
    };
  }

  private normalizeValue(value: number): number {
    if (this.signalBuffer.length < 2) return value;
    
    const min = Math.min(...this.signalBuffer);
    const max = Math.max(...this.signalBuffer);
    const range = max - min;
    
    return range > 0 ? (value - min) / range : value;
  }

  private detectPeak(normalizedValue: number): { isPeak: boolean; confidence: number } {
    const currentTime = Date.now();
    const timeSinceLastPeak = currentTime - this.lastPeakTime;
    
    if (timeSinceLastPeak < (1000 * this.MIN_PEAK_DISTANCE) / this.SAMPLE_RATE) {
      return { isPeak: false, confidence: 0 };
    }

    const recentValues = this.signalBuffer.slice(-5);
    const threshold = this.calculateThreshold(recentValues);
    const isPeak = this.isPeakValue(normalizedValue, recentValues, threshold);

    if (isPeak) {
      this.lastPeakTime = currentTime;
    }

    const confidence = this.calculateConfidence(normalizedValue, threshold);

    return { isPeak, confidence };
  }

  private calculateThreshold(values: number[]): number {
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / values.length;
    return Math.sqrt(variance) * 0.8;
  }

  private isPeakValue(value: number, recentValues: number[], threshold: number): boolean {
    if (recentValues.length < 3) return false;

    const isLocalMax = value > recentValues[recentValues.length - 2] &&
                      value > recentValues[recentValues.length - 3];
    
    const exceedsThreshold = value > threshold;

    return isLocalMax && exceedsThreshold;
  }

  private calculateConfidence(value: number, threshold: number): number {
    return Math.min(Math.max((value - threshold) / threshold, 0), 1);
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
      }
    }
  }

  private calculateCurrentBPM(): number {
    if (this.bpmHistory.length < 2) return 0;

    const sortedBPMs = [...this.bpmHistory].sort((a, b) => a - b);
    const medianBPM = sortedBPMs[Math.floor(sortedBPMs.length / 2)];
    
    return Math.round(medianBPM);
  }

  reset() {
    this.signalBuffer = [];
    this.lastPeakTime = 0;
    this.bpmHistory = [];
    this.lastBeepTime = 0;
  }
}
