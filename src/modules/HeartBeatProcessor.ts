
export class HeartBeatProcessor {
  // Constantes ajustadas según las nuevas recomendaciones
  private readonly SAMPLE_RATE = 30;
  private readonly WINDOW_SIZE = 60;
  private readonly MIN_PEAK_DISTANCE = 9;
  private readonly MAX_BPM = 190;
  private readonly MIN_BPM = 40;
  private readonly BEEP_FREQUENCY = 1000;
  private readonly BEEP_DURATION = 50;
  private readonly SIGNAL_THRESHOLD = 0.5;
  private readonly MIN_CONFIDENCE = 0.85;
  private readonly DERIVATIVE_THRESHOLD = -0.065;
  private readonly MIN_PEAK_TIME_MS = 315;
  private readonly WARMUP_TIME_MS = 5000;
  private readonly MOVING_AVERAGE_WINDOW = 7;
  private readonly MEDIAN_FILTER_WINDOW = 5;
  private readonly EMA_ALPHA = 0.2;
  private readonly INHIBITION_TIME_MS = 300;
  private readonly END_CUTOFF_TIME_MS = 2000;

  private signalBuffer: number[] = [];
  private movingAverageBuffer: number[] = [];
  private medianFilterBuffer: number[] = [];
  private lastPeakTime: number | null = null;
  private previousPeakTime: number | null = null;
  private audioContext: AudioContext | null = null;
  private bpmHistory: number[] = [];
  private lastBeepTime: number = 0;
  private baseline: number = 0;
  private lastValue: number = 0;
  private values: number[] = [];
  private startTime: number = 0;
  private smoothedValue: number = 0;
  private lastConfirmedPeak: boolean = false;
  private peakConfirmationBuffer: number[] = [];

  constructor() {
    this.initAudio();
    this.startTime = Date.now();
  }

  private async initAudio() {
    try {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      await this.audioContext.resume();
      console.log("HeartBeatProcessor: Audio context initialized", {
        state: this.audioContext.state,
        sampleRate: this.audioContext.sampleRate
      });
    } catch (error) {
      console.error("HeartBeatProcessor: Error initializing audio", error);
    }
  }

  private isInWarmup(): boolean {
    return Date.now() - this.startTime < this.WARMUP_TIME_MS;
  }

  private isInEndCutoff(): boolean {
    return Date.now() - this.startTime > (30000 - this.END_CUTOFF_TIME_MS);
  }

  private calculateMedianFilter(value: number): number {
    this.medianFilterBuffer.push(value);
    if (this.medianFilterBuffer.length > this.MEDIAN_FILTER_WINDOW) {
      this.medianFilterBuffer.shift();
    }
    const sorted = [...this.medianFilterBuffer].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  }

  private calculateMovingAverage(value: number): number {
    this.movingAverageBuffer.push(value);
    if (this.movingAverageBuffer.length > this.MOVING_AVERAGE_WINDOW) {
      this.movingAverageBuffer.shift();
    }
    return this.movingAverageBuffer.reduce((a, b) => a + b, 0) / this.movingAverageBuffer.length;
  }

  private calculateEMA(value: number): number {
    this.smoothedValue = this.EMA_ALPHA * value + (1 - this.EMA_ALPHA) * this.smoothedValue;
    return this.smoothedValue;
  }

  private async playBeep(volume: number = 0.1) {
    if (!this.audioContext || this.isInWarmup() || this.isInEndCutoff()) {
      console.log("HeartBeatProcessor: Skipping beep", {
        hasContext: !!this.audioContext,
        isWarmup: this.isInWarmup(),
        isEndCutoff: this.isInEndCutoff()
      });
      return;
    }

    const currentTime = Date.now();
    if (currentTime - this.lastBeepTime < this.INHIBITION_TIME_MS) {
      console.log("HeartBeatProcessor: Too soon for beep");
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
      console.log("HeartBeatProcessor: Beep played successfully");
    } catch (error) {
      console.error("HeartBeatProcessor: Error playing beep", error);
    }
  }

  processSignal(value: number): {
    bpm: number;
    confidence: number;
    isPeak: boolean;
  } {
    const medianFiltered = this.calculateMedianFilter(value);
    const movingAvg = this.calculateMovingAverage(medianFiltered);
    const smoothedValue = this.calculateEMA(movingAvg);

    this.signalBuffer.push(smoothedValue);
    if (this.signalBuffer.length > this.WINDOW_SIZE) {
      this.signalBuffer.shift();
    }

    if (this.signalBuffer.length < 30) {
      return { bpm: 0, confidence: 0, isPeak: false };
    }

    this.baseline = this.baseline * 0.98 + smoothedValue * 0.02;
    const normalizedValue = smoothedValue - this.baseline;

    this.values.push(smoothedValue);
    if (this.values.length > 3) this.values.shift();

    const smoothDerivative = this.values.length > 2 ? 
      (this.values[2] - this.values[0]) / 2 : 
      smoothedValue - this.lastValue;

    const { isPeak, confidence } = this.detectPeak(normalizedValue, smoothDerivative);
    this.lastValue = smoothedValue;

    const isConfirmedPeak = this.confirmPeak(isPeak, normalizedValue, confidence);

    if (isConfirmedPeak && !this.isInWarmup() && !this.isInEndCutoff()) {
      const currentTime = Date.now();
      const timeSinceLastPeak = this.lastPeakTime ? currentTime - this.lastPeakTime : Infinity;
      
      if (timeSinceLastPeak >= this.MIN_PEAK_TIME_MS) {
        this.previousPeakTime = this.lastPeakTime;
        this.lastPeakTime = currentTime;
        
        this.updateBPM();
        void this.playBeep(0.1);

        console.log("HeartBeatProcessor: Peak detected", {
          timeSinceLastPeak,
          currentBPM: this.calculateCurrentBPM()
        });
      }
    }

    const currentBPM = this.calculateCurrentBPM();
    console.log("HeartBeatProcessor: Signal processed", {
      bpm: currentBPM,
      confidence,
      isPeak: isConfirmedPeak
    });

    return {
      bpm: currentBPM,
      confidence,
      isPeak: isConfirmedPeak && !this.isInWarmup() && !this.isInEndCutoff()
    };
  }

  private confirmPeak(isPeak: boolean, normalizedValue: number, confidence: number): boolean {
    this.peakConfirmationBuffer.push(normalizedValue);
    if (this.peakConfirmationBuffer.length > 3) {
      this.peakConfirmationBuffer.shift();
    }

    if (isPeak && !this.lastConfirmedPeak && confidence > this.MIN_CONFIDENCE) {
      const hasDescendingTrend = this.peakConfirmationBuffer.length === 3 &&
        this.peakConfirmationBuffer[2] < this.peakConfirmationBuffer[1] &&
        this.peakConfirmationBuffer[1] > this.peakConfirmationBuffer[0];

      if (hasDescendingTrend) {
        this.lastConfirmedPeak = true;
        return true;
      }
    } else if (!isPeak) {
      this.lastConfirmedPeak = false;
    }

    return false;
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
      console.log("HeartBeatProcessor: Invalid interval", { interval });
      return;
    }

    const instantBPM = 60000 / interval;
    console.log("HeartBeatProcessor: Calculated instant BPM", { instantBPM });

    if (instantBPM >= this.MIN_BPM && instantBPM <= this.MAX_BPM) {
      this.bpmHistory.push(instantBPM);
      if (this.bpmHistory.length > 8) {
        this.bpmHistory.shift();
      }
      console.log("HeartBeatProcessor: BPM history updated", {
        history: this.bpmHistory,
        length: this.bpmHistory.length
      });
    }
  }

  private calculateCurrentBPM(): number {
    if (this.bpmHistory.length < 2) return 0;

    const sorted = [...this.bpmHistory].sort((a, b) => a - b);
    if (sorted.length % 2 === 1) {
      return Math.round(sorted[Math.floor(sorted.length / 2)]);
    } else {
      const mid1 = sorted[(sorted.length/2) - 1];
      const mid2 = sorted[sorted.length/2];
      return Math.round((mid1 + mid2) / 2);
    }
  }

  public getFinalBPM(): number {
    if (this.bpmHistory.length < 5) return 0;

    const sorted = [...this.bpmHistory].sort((a, b) => a - b);
    const cut = Math.round(sorted.length * 0.15);
    const trimmed = sorted.slice(cut, sorted.length - cut);

    if (trimmed.length === 0) return 0;

    const medianIndex = Math.floor(trimmed.length / 2);
    return trimmed.length % 2 === 0
      ? Math.round((trimmed[medianIndex - 1] + trimmed[medianIndex]) / 2)
      : Math.round(trimmed[medianIndex]);
  }

  reset() {
    this.signalBuffer = [];
    this.movingAverageBuffer = [];
    this.medianFilterBuffer = [];
    this.lastPeakTime = null;
    this.previousPeakTime = null;
    this.bpmHistory = [];
    this.lastBeepTime = 0;
    this.baseline = 0;
    this.lastValue = 0;
    this.values = [];
    this.smoothedValue = 0;
    this.lastConfirmedPeak = false;
    this.peakConfirmationBuffer = [];
    this.startTime = Date.now();
  }
}
