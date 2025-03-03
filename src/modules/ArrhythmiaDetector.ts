import { ArrhythmiaResult, ArrhythmiaType } from '../types/signal';

export class ArrhythmiaDetector {
  private rrIntervals: number[] = [];
  private amplitudes: number[] = [];
  private lastPeakTimes: number[] = [];
  private learningPhase: boolean = true;
  private learningPhaseCount: number = 0;
  private readonly LEARNING_PHASE_THRESHOLD = 3; // Reduced for faster baseline establishment
  private readonly MAX_INTERVALS = 50;
  private lastAnalysisTime: number = 0;
  private lastPeakTime: number | null = null;
  private readonly ANALYSIS_COOLDOWN_MS = 100; // Further reduced for higher sensitivity
  private lastArrhythmiaResult: ArrhythmiaResult | null = null;
  private statusText: string = "LATIDO NORMAL|0";
  private prematureBeatsCount: number = 0;
  
  // Baseline RR intervals for rhythm comparison
  private baselineRRIntervals: number[] = [];
  private baselineRRMean: number = 0;
  private baselineRRStdDev: number = 0;
  
  constructor() {
    console.log("ArrhythmiaDetector: Inicializado - Versión mejorada");
  }
  
  public addRRInterval(interval: number, amplitude?: number): void {
    // More permissive physiological interval range for higher sensitivity
    const minInterval = 200; // Even less restrictive minimum for mobile devices
    const maxInterval = 2500; // More permissive maximum for increased sensitivity
    
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
    // Si estamos en fase de aprendizaje, actualizar línea base
    if (this.learningPhase) {
      if (intervals.length > 0) {
        this.learningPhaseCount++;
        
        // Agregar a la línea base
        this.baselineRRIntervals = this.baselineRRIntervals.concat(intervals);
        
        if (this.learningPhaseCount >= this.LEARNING_PHASE_THRESHOLD) {
          this.learningPhase = false;
          this.calculateBaselineStatistics();
          console.log("ArrhythmiaDetector: Fase de aprendizaje completada. Estadísticas base:", {
            mean: this.baselineRRMean,
            stdDev: this.baselineRRStdDev
          });
        }
      }
      
      // Durante fase de aprendizaje, no detectamos arritmias
      return {
        detected: false,
        severity: 0,
        confidence: 0,
        type: "NONE" as ArrhythmiaType,
        timestamp: Date.now()
      };
    }
    
    // Añadir intervalos al buffer
    intervals.forEach(interval => {
      // Solo añadir intervalos fisiológicamente posibles (entre 300ms y 1500ms)
      if (interval >= 300 && interval <= 1500) {
        this.rrIntervals.push(interval);
      }
    });
    
    // Guardar amplitudes si están disponibles
    if (amplitudes && amplitudes.length > 0) {
      // Asegurar mismo número de elementos
      const numToAdd = Math.min(intervals.length, amplitudes.length);
      this.amplitudes = this.amplitudes.concat(amplitudes.slice(0, numToAdd));
    }
    
    // Limitar tamaño del buffer
    if (this.rrIntervals.length > this.MAX_INTERVALS) {
      this.rrIntervals = this.rrIntervals.slice(-this.MAX_INTERVALS);
      this.amplitudes = this.amplitudes.slice(-this.MAX_INTERVALS);
    }
    
    // Analizar ritmo con los datos acumulados
    // MEJORA: Reducimos el tiempo mínimo entre análisis para aumentar sensibilidad
    const currentTime = Date.now();
    if (currentTime - this.lastAnalysisTime >= this.ANALYSIS_COOLDOWN_MS / 2) {
      this.lastAnalysisTime = currentTime;
      
      // Analizar con datos acumulados
      const result = this.analyzeRhythm();
      
      if (result.detected) {
        this.lastArrhythmiaResult = result;
        this.prematureBeatsCount += result.type.includes("PREMATURA") ? 1 : 0;
        
        // MEJORA: Log para depuración
        console.log("ArrhythmiaDetector: ¡ARRITMIA DETECTADA!", {
          type: result.type,
          severity: result.severity,
          confidence: result.confidence,
          rmssd: result.rmssd,
          rrVariation: result.rrVariation
        });
        
        // MEJORA: Actualizar status inmediatamente para mejor visualización
        this.statusText = `ARRITMIA DETECTADA: ${result.type}|${this.prematureBeatsCount}`;
      }
      
      return result;
    }
    
    // Si no es tiempo de analizar, devolver último resultado o normal
    return this.lastArrhythmiaResult || {
      detected: false,
      severity: 0,
      confidence: 0,
      type: "NONE" as ArrhythmiaType,
      timestamp: Date.now()
    };
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
    // Necesitamos al menos 3 intervalos para análisis básico
    if (this.rrIntervals.length < 3) {
      return {
        detected: false,
        severity: 0,
        confidence: 20,
        type: "NONE" as ArrhythmiaType,
        timestamp: Date.now()
      };
    }
    
    // Calcular métricas de variabilidad
    const rmssd = this.calculateRMSSD();
    const rrVariation = this.calculateRRVariation();
    
    // Detectar latido prematuro (extrasístole)
    const prematureBeatResult = this.detectPrematureBeat();
    
    // MEJORA: Reducimos los umbrales para aumentar sensibilidad
    
    // Detectar arritmias específicas basadas en métricas
    let detected = false;
    let severity = 0;
    let confidence = 0;
    let type: string = "NORMAL";
    
    // Detectar Fibrilación Auricular basada en alta variabilidad RR sin patrón
    if (rmssd > 30 && rrVariation > 0.18) { // Umbrales reducidos
      detected = true;
      severity = Math.min(10, Math.max(1, Math.round(rmssd / 12)));
      confidence = Math.min(95, Math.max(70, 70 + (rrVariation * 100)));
      type = "FIBRILACIÓN AURICULAR";
    }
    // Detectar Bradicardia significativa
    else if (this.rrIntervals.length >= 5) {
      const avg = this.rrIntervals.reduce((a, b) => a + b, 0) / this.rrIntervals.length;
      const bpm = 60000 / avg;
      
      if (bpm < 55) { // Umbral aumentado de 50 a 55
        detected = true;
        severity = Math.min(10, Math.max(1, Math.round((55 - bpm) / 3)));
        confidence = Math.min(95, Math.max(70, 70 + ((55 - bpm) * 3)));
        type = "BRADICARDIA";
      }
      // Detectar Taquicardia significativa
      else if (bpm > 100) { // Umbral reducido de 110 a 100
        detected = true;
        severity = Math.min(10, Math.max(1, Math.round((bpm - 100) / 5)));
        confidence = Math.min(95, Math.max(70, 70 + ((bpm - 100) / 2)));
        type = "TAQUICARDIA";
      }
    }
    
    // Detectar latidos prematuros (mayor prioridad)
    if (prematureBeatResult.detected) {
      detected = true;
      severity = prematureBeatResult.severity;
      confidence = prematureBeatResult.confidence;
      type = "CONTRACCIÓN PREMATURA";
    }
    
    // Realizar análisis más detallado si tenemos al menos 8 intervalos
    if (this.rrIntervals.length >= 8) {
      // Calcular métricas adicionales para análisis avanzado
      
      // Analizar patrones para arritmia sinusal respiratoria (normal)
      const patternLength = Math.min(8, this.rrIntervals.length);
      const recentIntervals = this.rrIntervals.slice(-patternLength);
      
      // Detectar patrón cíclico (podría ser arritmia sinusal respiratoria - normal)
      let increasing = 0;
      let decreasing = 0;
      
      for (let i = 1; i < recentIntervals.length; i++) {
        if (recentIntervals[i] > recentIntervals[i-1]) increasing++;
        else if (recentIntervals[i] < recentIntervals[i-1]) decreasing++;
      }
      
      // Si hay un patrón claro de aumento y disminución, podría ser arritmia sinusal
      const hasCyclicPattern = increasing >= 2 && decreasing >= 2;
      
      // MEJORA: Si detectamos un patrón cíclico, solo reportamos arritmia si es significativa
      if (hasCyclicPattern && detected && type !== "CONTRACCIÓN PREMATURA") {
        if (severity < 3 || confidence < 80) {
          detected = false;
          type = "VARIABILIDAD SINUSAL";
        }
      }
      
      // MEJORA: Detectar bloqueo AV basado en intervalos extendidos periódicos
      const avgInterval = recentIntervals.reduce((a, b) => a + b, 0) / recentIntervals.length;
      let extendedIntervals = 0;
      
      for (let i = 0; i < recentIntervals.length; i++) {
        if (recentIntervals[i] > avgInterval * 1.5) {
          extendedIntervals++;
        }
      }
      
      // Si hay múltiples intervalos extendidos y no son cíclicos, podría ser bloqueo AV
      if (extendedIntervals >= 2 && !hasCyclicPattern) {
        detected = true;
        severity = Math.min(8, Math.max(3, extendedIntervals));
        confidence = Math.min(90, Math.max(70, 70 + (extendedIntervals * 5)));
        type = "POSIBLE BLOQUEO AV";
      }
    }
    
    // Actualizar el estado del detector
    const currentTime = Date.now();
    
    // MEJORA: Actualizar el texto de estado con información más descriptiva
    if (detected) {
      this.statusText = `ARRITMIA DETECTADA: ${type}|${this.prematureBeatsCount}`;
    } else {
      // Solo actualizar a normal si ha pasado cierto tiempo desde la última arritmia
      const timeSinceLastArrhythmia = this.lastArrhythmiaResult ? 
        currentTime - this.lastArrhythmiaResult.timestamp : 
        Number.MAX_SAFE_INTEGER;
      
      if (timeSinceLastArrhythmia > 3000) {
        this.statusText = `LATIDO NORMAL|${this.prematureBeatsCount}`;
      }
    }
    
    return {
      detected,
      severity,
      confidence,
      type: type as ArrhythmiaType,
      timestamp: currentTime,
      rmssd,
      rrVariation
    };
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
    if (this.rrIntervals.length < 2) return 0; // Reduced from 3 to 2 for more sensitivity
    
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
    // Significantly enhanced sensitivity - can work with just 1 interval if baseline is established
    if (this.rrIntervals.length < 1 || this.baselineRRMean === 0) {
      return { detected: false, severity: 0, confidence: 0 };
    }
    
    // Get the most recent RR interval for analysis
    const latestInterval = this.rrIntervals[this.rrIntervals.length - 1];
    
    // Check if the latest interval is significantly shorter than baseline
    // Much more sensitive threshold - reduced from 0.8 to 0.5 standard deviations
    const prematureThreshold = this.baselineRRMean - (0.5 * this.baselineRRStdDev);
    
    // A premature beat is followed by a compensatory pause (longer interval)
    const isPremature = latestInterval < prematureThreshold;
    
    if (!isPremature) {
      return { detected: false, severity: 0, confidence: 0 };
    }
    
    // Calculate deviation from baseline as percentage
    const deviationPercent = (this.baselineRRMean - latestInterval) / this.baselineRRMean * 100;
    
    // Calculate severity based on how premature the beat is
    // Much more sensitive thresholds for detection
    let severity = 0;
    let confidence = 0;
    
    // Dramatically lower thresholds for detection to maximize sensitivity
    if (deviationPercent > 15) { // Lowered from 20%
      // Very premature
      severity = 9;
      confidence = 0.95;
    } else if (deviationPercent > 8) { // Lowered from 10%
      // Moderately premature
      severity = 7;
      confidence = 0.85;
    } else if (deviationPercent > 4) { // Lowered from 5%
      // Mildly premature
      severity = 6;
      confidence = 0.75;
    } else {
      // Small deviation but still report as premature
      severity = 4;
      confidence = 0.65;
    }
    
    console.log(`ArrhythmiaDetector: Latido prematuro detectado - Intervalo: ${latestInterval}ms vs Línea base: ${this.baselineRRMean.toFixed(0)}ms, Desviación: ${deviationPercent.toFixed(1)}%`);

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
