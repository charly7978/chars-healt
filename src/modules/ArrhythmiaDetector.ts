
import { ArrhythmiaResult, ArrhythmiaType } from '../types/signal';

export class ArrhythmiaDetector {
  private rrIntervals: number[] = [];
  private amplitudes: number[] = [];
  private lastPeakTimes: number[] = [];
  private learningPhase: boolean = true;
  private learningPhaseCount: number = 0;
  private readonly LEARNING_PHASE_THRESHOLD = 10; // Reduced from 20 for faster learning
  private readonly MAX_INTERVALS = 50;
  private lastAnalysisTime: number = 0;
  private lastPeakTime: number | null = null;
  private readonly ANALYSIS_COOLDOWN_MS = 500; // Reduced from 1000 for more frequent analysis
  private lastArrhythmiaResult: ArrhythmiaResult | null = null;
  private statusText: string = "LATIDO NORMAL|0";
  
  constructor() {
    console.log("ArrhythmiaDetector: Inicializado");
  }
  
  public addRRInterval(interval: number, amplitude?: number): void {
    // Ampliar el rango de intervalos fisiológicos para mayor sensibilidad
    if (interval < 200 || interval > 2500) {
      // Filtrar intervalos extremadamente no fisiológicos
      return;
    }
    
    this.rrIntervals.push(interval);
    this.amplitudes.push(amplitude || 0);
    
    // Mantener los arrays dentro de un tamaño máximo
    if (this.rrIntervals.length > this.MAX_INTERVALS) {
      this.rrIntervals.shift();
      this.amplitudes.shift();
    }
    
    // Fase de aprendizaje
    if (this.learningPhase) {
      this.learningPhaseCount++;
      if (this.learningPhaseCount >= this.LEARNING_PHASE_THRESHOLD) {
        this.learningPhase = false;
        console.log("ArrhythmiaDetector: Fase de aprendizaje completada");
      }
    }
  }

  public processRRIntervals(intervals: number[], amplitudes?: number[]): ArrhythmiaResult {
    // Procesamiento más eficiente de múltiples intervalos RR
    console.log("ArrhythmiaDetector: Procesando intervalos RR:", intervals.length, "intervalos");
    
    if (intervals && intervals.length > 0) {
      for (let i = 0; i < intervals.length; i++) {
        const amplitude = amplitudes && amplitudes[i] ? amplitudes[i] : undefined;
        this.addRRInterval(intervals[i], amplitude);
      }
    }

    // Analizar ritmo con los datos acumulados
    return this.analyzeRhythm();
  }
  
  public setLastPeakTime(timestamp: number): void {
    this.lastPeakTime = timestamp;
    this.lastPeakTimes.push(timestamp);
    
    // Mantener el historial de tiempos de pico dentro de un límite
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
    
    // Evitar análisis demasiado frecuentes
    if (currentTime - this.lastAnalysisTime < this.ANALYSIS_COOLDOWN_MS) {
      // Si hay un resultado previo, devuelve ese para mantener consistencia
      if (this.lastArrhythmiaResult) {
        return this.lastArrhythmiaResult;
      }
      
      return {
        detected: false,
        severity: 0,
        confidence: 0,
        type: 'NONE',
        timestamp: currentTime
      };
    }
    
    this.lastAnalysisTime = currentTime;
    
    // Si estamos en fase de aprendizaje o no tenemos suficientes datos
    if (this.learningPhase || this.rrIntervals.length < 5) { // Reducido de 8 a 5 para mayor sensibilidad
      return {
        detected: false,
        severity: 0,
        confidence: 0,
        type: 'NONE',
        timestamp: currentTime
      };
    }
    
    try {
      // Análisis de variabilidad RR para detectar fibrilación auricular
      const rmssd = this.calculateRMSSD();
      const rrVariation = this.calculateRRVariation();
      
      console.log(`ArrhythmiaDetector: RMSSD = ${rmssd.toFixed(2)}, RRVariation = ${rrVariation.toFixed(2)}`);
      
      // Detección de PAC (contracciones auriculares prematuras) - Más sensible
      const hasPAC = this.detectPAC();
      
      // Detección de PVC (contracciones ventriculares prematuras) - Más sensible
      const hasPVC = this.detectPVC();
      
      // Detección de AF (fibrilación auricular) - Más sensible
      const hasAF = this.detectAF(rmssd, rrVariation);
      
      // Determinar tipo de arritmia detectada
      let arrhythmiaType: ArrhythmiaType = 'NONE';
      let severity = 0;
      let confidence = 0;
      
      if (hasAF) {
        arrhythmiaType = 'AF';
        severity = Math.min(10, 5 + Math.floor(rmssd / 40)); // Más sensible
        confidence = Math.min(1, rrVariation / 0.15); // Más sensible
      } else if (hasPVC) {
        arrhythmiaType = 'PVC';
        severity = 7;
        confidence = 0.9; // Aumentada
      } else if (hasPAC) {
        arrhythmiaType = 'PAC';
        severity = 6; // Aumentada
        confidence = 0.8; // Aumentada
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
      
      // Actualizar estado y último resultado
      this.lastArrhythmiaResult = result;
      this.statusText = detected ? 
        `ARRITMIA DETECTADA|${Math.round(severity)}` : 
        "LATIDO NORMAL|0";
      
      if (detected) {
        console.log(`ArrhythmiaDetector: Arritmia tipo ${arrhythmiaType} detectada con severidad ${severity} y confianza ${confidence.toFixed(2)}`);
      }
      
      return result;
    } catch (error) {
      console.error("Error en análisis de arritmias:", error);
      return {
        detected: false,
        severity: 0,
        confidence: 0,
        type: 'NONE',
        timestamp: currentTime
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
    
    // Normalizar por el promedio de los intervalos RR
    const avgRR = this.rrIntervals.reduce((a, b) => a + b, 0) / this.rrIntervals.length;
    const variation = diffs.reduce((a, b) => a + b, 0) / diffs.length / avgRR;
    
    return variation;
  }
  
  private detectPAC(): boolean {
    if (this.rrIntervals.length < 4) return false;
    
    // Buscar un patrón corto-largo-normal (característico de PAC) - Más sensible
    for (let i = 2; i < this.rrIntervals.length; i++) {
      const prev2 = this.rrIntervals[i - 2];
      const prev1 = this.rrIntervals[i - 1];
      const current = this.rrIntervals[i];
      
      // Parámetros más sensibles para detectar PAC
      if (prev2 > 500 && prev1 < 0.85 * prev2 && current > 1.05 * prev1) {
        return true;
      }
    }
    
    return false;
  }
  
  private detectPVC(): boolean {
    if (this.rrIntervals.length < 4 || this.amplitudes.length < 4) return false;
    
    // PVC típicamente tienen: 
    // 1. Un latido prematuro (intervalo RR corto)
    // 2. Una pausa compensatoria después (intervalo RR largo)
    // 3. Mayor amplitud en la onda R
    
    // Parámetros más sensibles para detectar PVC
    for (let i = 2; i < this.rrIntervals.length - 1; i++) {
      const prev = this.rrIntervals[i - 1];
      const current = this.rrIntervals[i];
      const next = this.rrIntervals[i + 1];
      
      const avgNormal = (this.rrIntervals.reduce((sum, val) => sum + val, 0) - current) / 
                          (this.rrIntervals.length - 1);
      
      // Criterios más sensibles
      if (current < 0.85 * avgNormal && 
          next > 1.15 * avgNormal &&
          this.amplitudes[i] > 1.2 * (this.getAvgAmplitude())) {
        return true;
      }
    }
    
    return false;
  }
  
  private detectAF(rmssd: number, rrVariation: number): boolean {
    // AF se caracteriza por alta variabilidad en los intervalos RR
    // y ausencia de un patrón regular
    
    // Criterios más sensibles basados en estudios clínicos
    const highRMSSD = rmssd > 80; // Reducido de 100 para mayor sensibilidad
    const highVariation = rrVariation > 0.08; // Reducido de 0.1 para mayor sensibilidad
    
    // Verificar patrones irregulares consecutivos
    let irregularCount = 0;
    for (let i = 1; i < this.rrIntervals.length; i++) {
      const diff = Math.abs(this.rrIntervals[i] - this.rrIntervals[i - 1]);
      if (diff > 80) { // Reducido de 100 para mayor sensibilidad
        irregularCount++;
      }
    }
    
    const highIrregularity = irregularCount >= this.rrIntervals.length * 0.6; // Reducido de 0.7 para mayor sensibilidad
    
    return highRMSSD && highVariation && highIrregularity;
  }
  
  private getAvgAmplitude(): number {
    if (this.amplitudes.length === 0) return 0;
    
    // Filtrar valores de 0 que podrían no ser reales
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
    
    console.log("ArrhythmiaDetector: Reset completo");
  }
}
