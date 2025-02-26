
import { ProcessedSignal, ProcessingError, SignalProcessor } from '../types/signal';

export class HeartBeatProcessor {
  // ────────── CONFIGURACIÓN AVANZADA ──────────
  private readonly SAMPLE_RATE = 30;
  private readonly WINDOW_SIZE = 60; //90
  private readonly MIN_BPM = 40;
  private readonly MAX_BPM = 220;
  private readonly MIN_CONFIDENCE = 0.5;
  private readonly SIGNAL_THRESHOLD = 0.25;
  private readonly NOISE_THRESHOLD = 0.0001; //0.2
  private readonly DERIVATIVE_THRESHOLD = -0.002;
  private readonly MIN_PEAK_TIME_MS = 250;
  private readonly WARMUP_TIME_MS = 1500;
  private readonly PEAK_AGE_WEIGHT = 0.8;
  
  // Variables de estado
  private signalBuffer: number[] = [];
  private medianBuffer: number[] = [];
  private movingAverageBuffer: number[] = [];
  private smoothedValue: number = 0;
  private baseline: number = 0;
  private lastValue: number = 0;
  private lastPeakTime: number | null = null;
  private bpmHistory: number[] = [];
  private adaptiveThreshold: number = 0;
  private audioContext: AudioContext | null = null;
  private lastBeepTime: number = 0;

  constructor() {
    this.initAudio();
    this.reset();
  }

  private async initAudio() {
    try {
      this.audioContext = new window.AudioContext();
      await this.audioContext.resume();
      console.log("Audio Context Inicializado");
    } catch (error) {
      console.error("Error inicializando audio:", error);
    }
  }

  private async playBeep(volume: number = 0.75) {
    if (!this.audioContext) return;
    
    const now = Date.now();
    if (now - this.lastBeepTime < this.MIN_PEAK_TIME_MS) return;
    
    try {
      const oscillator = this.audioContext.createOscillator();
      const gainNode = this.audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(this.audioContext.destination);
      
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(800, this.audioContext.currentTime);
      
      gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
      gainNode.gain.linearRampToValueAtTime(volume, this.audioContext.currentTime + 0.01);
      gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.07);
      
      oscillator.start();
      oscillator.stop(this.audioContext.currentTime + 0.08);
      
      this.lastBeepTime = now;
    } catch (error) {
      console.error("Error reproduciendo beep:", error);
    }
  }

  public processSignal(value: number): {
    bpm: number;
    confidence: number;
    isPeak: boolean;
    filteredValue: number;
    arrhythmiaCount: number;
  } {
    // Aplicar pipeline de procesamiento
    const medianFiltered = this.medianFilter(value);
    const movingAverage = this.calculateMovingAverage(medianFiltered);
    const smoothed = this.calculateEMA(movingAverage);
    
    this.signalBuffer.push(smoothed);
    if (this.signalBuffer.length > this.WINDOW_SIZE) {
      this.signalBuffer.shift();
    }
    
    // Actualizar línea base
    this.baseline = 0.98 * this.baseline + 0.02 * smoothed;
    
    // Calcular primera derivada
    const derivative = smoothed - this.lastValue;
    this.lastValue = smoothed;
    
    // Detectar pico
    const { isPeak, confidence } = this.detectPeak(smoothed - this.baseline, derivative);
    
    if (isPeak) {
      this.playBeep(Math.min(1.0, confidence * 1.2));
      this.updateBPM();
    }
    
    return {
      bpm: Math.round(this.calculateCurrentBPM()),
      confidence,
      isPeak,
      filteredValue: smoothed,
      arrhythmiaCount: 0
    };
  }

  private medianFilter(value: number): number {
    this.medianBuffer.push(value);
    if (this.medianBuffer.length > 5) {
      this.medianBuffer.shift();
    }
    const sorted = [...this.medianBuffer].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  }

  private calculateMovingAverage(value: number): number {
    this.movingAverageBuffer.push(value);
    if (this.movingAverageBuffer.length > 3) {
      this.movingAverageBuffer.shift();
    }
    const sum = this.movingAverageBuffer.reduce((a, b) => a + b, 0);
    return sum / this.movingAverageBuffer.length;
  }

  private calculateEMA(value: number): number {
    this.smoothedValue = 0.3 * value + 0.7 * this.smoothedValue;
    return this.smoothedValue;
  }

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
    
    const isOverThreshold =
      derivative < this.DERIVATIVE_THRESHOLD &&
      normalizedValue > this.SIGNAL_THRESHOLD &&
      this.lastValue > this.baseline;
    
    const confidence = Math.min(
      Math.max(Math.abs(normalizedValue) / (this.SIGNAL_THRESHOLD * 1.2), 0),
      1
    );
    
    if (isOverThreshold && confidence > this.MIN_CONFIDENCE) {
      this.lastPeakTime = now;
      console.log("Pico detectado:", { normalizedValue, derivative, confidence });
    }
    
    return { isPeak: isOverThreshold && confidence > this.MIN_CONFIDENCE, confidence };
  }

  private updateBPM(): void {
    if (!this.lastPeakTime) return;
    
    const now = Date.now();
    const interval = now - (this.lastPeakTime || now);
    if (interval <= 0) return;
    
    const instantBPM = 60000 / interval;
    if (instantBPM >= this.MIN_BPM && instantBPM <= this.MAX_BPM) {
      this.bpmHistory.push(instantBPM);
      if (this.bpmHistory.length > 10) {
        this.bpmHistory.shift();
      }
    }
  }

  private calculateCurrentBPM(): number {
    if (this.bpmHistory.length < 3) return 0;
    
    const recentBPMs = this.bpmHistory.slice(-5);
    return recentBPMs.reduce((a, b) => a + b, 0) / recentBPMs.length;
  }

  public reset(): void {
    this.signalBuffer = [];
    this.medianBuffer = [];
    this.movingAverageBuffer = [];
    this.smoothedValue = 0;
    this.baseline = 0;
    this.lastValue = 0;
    this.lastPeakTime = null;
    this.bpmHistory = [];
    this.adaptiveThreshold = 0;
  }
}
