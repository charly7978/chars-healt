
import { ArrhythmiaResult, ArrhythmiaType } from '../types/signal';

export class ArrhythmiaDetector {
  private rrIntervals: number[] = [];
  private amplitudes: number[] = [];
  private lastPeakTimes: number[] = [];
  private learningPhase: boolean = true;
  private learningPhaseCount: number = 0;
  private readonly LEARNING_PHASE_THRESHOLD = 4; // 4 seconds worth of heartbeats for baseline
  private readonly MAX_INTERVALS = 50;
  private lastAnalysisTime: number = 0;
  private lastPeakTime: number | null = null;
  private readonly ANALYSIS_COOLDOWN_MS = 250; // Reduced from 500ms to 250ms to be more sensitive
  private lastArrhythmiaResult: ArrhythmiaResult | null = null;
  private statusText: string = "LATIDO NORMAL|0";
  private prematureBeatsCount: number = 0;
  
  // Baseline RR intervals for rhythm comparison
  private baselineRRIntervals: number[] = [];
  private baselineRRMean: number = 0;
  private baselineRRStdDev: number = 0;
  
  constructor() {
    console.log("ArrhythmiaDetector: Inicializado");
  }
  
  public addRRInterval(interval: number, amplitude?: number): void {
    // More permissive physiological interval range to increase sensitivity
    const minInterval = 300; // Less restrictive minimum (was 400)
    const maxInterval = 2000; // Less restrictive maximum (was 1800)
    
    if (interval < minInterval || interval > maxInterval) {
      console.log(`ArrhythmiaDetector: Intervalo fuera de rango fisiológico: ${interval}ms`);
      return;
    }
    
    this.rrIntervals.push(interval);
    this.amplitudes.push(amplitude || 0);
    
    // Maintain array within maximum size
    if (this.rrIntervals.length > this.MAX_INTERVALS) {
      this.rrIntervals.shift();
      this.amplitudes.shift();
    }
    
    // Learning phase - collecting baseline rhythm data
    if (this.learningPhase) {
      this.learningPhaseCount++;
      
      // Add to baseline collection
      this.baselineRRIntervals.push(interval);
      
      if (this.learningPhaseCount >= this.LEARNING_PHASE_THRESHOLD) {
        this.learningPhase = false;
        this.calculateBaselineStatistics();
        console.log(`ArrhythmiaDetector: Fase de aprendizaje completada (${this.learningPhaseCount} muestras)`);
        console.log(`ArrhythmiaDetector: Línea base establecida - Media: ${this.baselineRRMean.toFixed(2)}ms, StdDev: ${this.baselineRRStdDev.toFixed(2)}ms`);
      }
    }
  }
  
  private calculateBaselineStatistics(): void {
    if (this.baselineRRIntervals.length === 0) return;
    
    // Calculate mean of baseline RR intervals
    this.baselineRRMean = this.baselineRRIntervals.reduce((sum, val) => sum + val, 0) / 
                           this.baselineRRIntervals.length;
    
    // Calculate standard deviation
    const sumSquaredDiff = this.baselineRRIntervals.reduce((sum, val) => {
      const diff = val - this.baselineRRMean;
      return sum + (diff * diff);
    }, 0);
    
    this.baselineRRStdDev = Math.sqrt(sumSquaredDiff / this.baselineRRIntervals.length);
  }

  public processRRIntervals(intervals: number[], amplitudes?: number[]): ArrhythmiaResult {
    console.log("ArrhythmiaDetector: Procesando intervalos RR:", 
      intervals.length, "intervalos", 
      amplitudes ? `con ${amplitudes.length} amplitudes` : "sin amplitudes");
    
    // Validation to ensure intervals are valid numbers
    let validIntervals = intervals.filter(i => typeof i === 'number' && !isNaN(i) && i > 0);
    
    if (validIntervals && validIntervals.length > 0) {
      // Ensure amplitudes are valid
      let validAmplitudes = amplitudes;
      
      // If no amplitudes or insufficient, create default values
      if (!validAmplitudes || validAmplitudes.length < validIntervals.length) {
        console.log(`ArrhythmiaDetector: Amplitudes insuficientes (${validAmplitudes?.length || 0}), generando valores por defecto`);
        validAmplitudes = Array(validIntervals.length).fill(100);
      }
      
      for (let i = 0; i < validIntervals.length; i++) {
        const amplitude = validAmplitudes && validAmplitudes[i] ? validAmplitudes[i] : 100;
        this.addRRInterval(validIntervals[i], amplitude);
      }
    }

    // Analyze rhythm with accumulated data
    return this.analyzeRhythm();
  }
  
  public setLastPeakTime(timestamp: number): void {
    this.lastPeakTime = timestamp;
    this.lastPeakTimes.push(timestamp);
    
    // Keep peak times history within limit
    if (this.lastPeakTimes.length > this.MAX_INTERVALS) {
      this.lastPeakTimes.shift();
    }
  }
  
  public isInLearningPhase(): boolean {
    return this.learningPhase;
  }

  public getStatusText(): string {
    return this.statusText;
  }

  public getLastArrhythmia(): ArrhythmiaResult | null {
    return this.lastArrhythmiaResult;
  }
  
  public analyzeRhythm(): ArrhythmiaResult {
    const currentTime = Date.now();
    
    // Reduced cooldown to increase sensitivity
    if (currentTime - this.lastAnalysisTime < this.ANALYSIS_COOLDOWN_MS) {
      // If there's a previous result, return that for consistency
      if (this.lastArrhythmiaResult) {
        return this.lastArrhythmiaResult;
      }
      
      return {
        detected: false,
        severity: 0,
        confidence: 0,
        type: 'NONE',
        timestamp: currentTime,
        rmssd: 0,
        rrVariation: 0
      };
    }
    
    this.lastAnalysisTime = currentTime;
    
    // If we're in learning phase or don't have enough data
    if (this.learningPhase || this.rrIntervals.length < 3) {
      return {
        detected: false,
        severity: 0,
        confidence: 0,
        type: 'NONE',
        timestamp: currentTime,
        rmssd: 0,
        rrVariation: 0
      };
    }
    
    try {
      // Calculate variability metrics for context
      const rmssd = this.calculateRMSSD();
      const rrVariation = this.calculateRRVariation();
      
      // FOCUS ONLY ON PREMATURE BEATS - detect premature contractions with higher sensitivity
      const prematureBeat = this.detectPrematureBeat();
      
      let arrhythmiaType: ArrhythmiaType = 'NONE';
      let severity = 0;
      let confidence = 0;
      
      if (prematureBeat.detected) {
        // Only classify as PAC (Premature Atrial Contraction) for premature beats
        arrhythmiaType = 'PAC';
        severity = prematureBeat.severity;
        confidence = prematureBeat.confidence;
        this.prematureBeatsCount++;
        
        console.log(`ArrhythmiaDetector: Latido prematuro detectado: Severidad ${severity}, Confianza ${confidence.toFixed(2)}`);
      }
      
      const detected = arrhythmiaType !== 'NONE';
      
      const result: ArrhythmiaResult = {
        detected,
        severity,
        confidence,
        type: arrhythmiaType,
        timestamp: currentTime,
        rmssd,
        rrVariation
      };
      
      // Update status and last result
      if (detected) {
        this.lastArrhythmiaResult = result;
        this.statusText = `ARRITMIA DETECTADA|${this.prematureBeatsCount}`;
        
        console.log(`ArrhythmiaDetector: Latido prematuro detectado con severidad ${severity} y confianza ${confidence.toFixed(2)}`);
      } else {
        this.statusText = "LATIDO NORMAL|0";
      }
      
      return result;
    } catch (error) {
      console.error("Error en análisis de arritmias:", error);
      return {
        detected: false,
        severity: 0,
        confidence: 0,
        type: 'NONE',
        timestamp: currentTime,
        rmssd: 0,
        rrVariation: 0
      };
    }
  }
  
  private calculateRMSSD(): number {
    if (this.rrIntervals.length < 2) return 0;
    
    let sum = 0;
    for (let i = 1; i < this.rrIntervals.length; i++) {
      const diff = this.rrIntervals[i] - this.rrIntervals[i - 1];
      sum += diff * diff;
    }
    
    return Math.sqrt(sum / (this.rrIntervals.length - 1));
  }
  
  private calculateRRVariation(): number {
    if (this.rrIntervals.length < 3) return 0;
    
    const diffs = [];
    for (let i = 1; i < this.rrIntervals.length; i++) {
      diffs.push(Math.abs(this.rrIntervals[i] - this.rrIntervals[i - 1]));
    }
    
    // Normalize by the average of RR intervals
    const avgRR = this.rrIntervals.reduce((a, b) => a + b, 0) / this.rrIntervals.length;
    const variation = diffs.reduce((a, b) => a + b, 0) / diffs.length / avgRR;
    
    return variation;
  }
  
  private detectPrematureBeat(): { detected: boolean; severity: number; confidence: number } {
    // Focus only on detecting premature beats based on baseline rhythm
    if (this.rrIntervals.length < 3 || this.baselineRRMean === 0) {
      return { detected: false, severity: 0, confidence: 0 };
    }
    
    // Get the most recent RR intervals for analysis
    const recentIntervals = this.rrIntervals.slice(-3);
    const latestInterval = recentIntervals[recentIntervals.length - 1];
    
    // Check if the latest interval is significantly shorter than baseline
    // A premature beat will have an RR interval shorter than the baseline
    // More sensitive threshold - reduced from 1.5 to 1.2 standard deviations
    const prematureThreshold = this.baselineRRMean - (1.2 * this.baselineRRStdDev);
    
    // A premature beat is followed by a compensatory pause (longer interval)
    const isPremature = latestInterval < prematureThreshold;
    
    if (!isPremature) {
      return { detected: false, severity: 0, confidence: 0 };
    }
    
    // Calculate deviation from baseline as percentage
    const deviationPercent = (this.baselineRRMean - latestInterval) / this.baselineRRMean * 100;
    
    // Calculate severity based on how premature the beat is
    // More premature = higher severity - with more sensitive thresholds
    let severity = 0;
    let confidence = 0;
    
    // Lower thresholds for detection to increase sensitivity
    if (deviationPercent > 25) { // Lowered from 30%
      // Very premature
      severity = 8;
      confidence = 0.9;
    } else if (deviationPercent > 15) { // Lowered from 20%
      // Moderately premature
      severity = 6;
      confidence = 0.8;
    } else if (deviationPercent > 10) { // Lowered from 15%
      // Mildly premature
      severity = 5;
      confidence = 0.7;
    } else {
      // Small deviation but still report as premature
      severity = 3;
      confidence = 0.6;
    }
    
    console.log(`ArrhythmiaDetector: Posible latido prematuro - Intervalo: ${latestInterval}ms vs Línea base: ${this.baselineRRMean.toFixed(0)}ms, Desviación: ${deviationPercent.toFixed(1)}%`);
    
    return { 
      detected: true, 
      severity, 
      confidence 
    };
  }
  
  private getAvgAmplitude(): number {
    if (this.amplitudes.length === 0) return 0;
    
    // Filter out zero values that might not be real
    const validAmplitudes = this.amplitudes.filter(a => a > 0);
    if (validAmplitudes.length === 0) return 0;
    
    return validAmplitudes.reduce((sum, val) => sum + val, 0) / validAmplitudes.length;
  }
  
  public reset(): void {
    this.rrIntervals = [];
    this.amplitudes = [];
    this.lastPeakTimes = [];
    this.learningPhase = true;
    this.learningPhaseCount = 0;
    this.lastAnalysisTime = 0;
    this.lastPeakTime = null;
    this.lastArrhythmiaResult = null;
    this.statusText = "LATIDO NORMAL|0";
    this.baselineRRIntervals = [];
    this.baselineRRMean = 0;
    this.baselineRRStdDev = 0;
    this.prematureBeatsCount = 0;
    
    console.log("ArrhythmiaDetector: Reset completo");
  }
}
