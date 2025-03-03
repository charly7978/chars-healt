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
    // Añadimos más logs para depuración
    console.log("ArrhythmiaDetector: Procesando intervalos RR:", intervals);
    
    // Si estamos en fase de aprendizaje, acelerar la finalización
    if (this.learningPhase) {
      if (intervals.length > 0) {
        // Incrementar más rápido para salir antes de la fase de aprendizaje
        this.learningPhaseCount += 2;
        
        // Agregar a la línea base
        this.baselineRRIntervals = this.baselineRRIntervals.concat(intervals);
        
        if (this.learningPhaseCount >= this.LEARNING_PHASE_THRESHOLD) {
          this.learningPhase = false;
          this.calculateBaselineStatistics();
          console.log("ArrhythmiaDetector: Fase de aprendizaje completada. Estadísticas base:", {
            mean: this.baselineRRMean,
            stdDev: this.baselineRRStdDev
          });
        } else {
          console.log(`ArrhythmiaDetector: En fase de aprendizaje (${this.learningPhaseCount}/${this.LEARNING_PHASE_THRESHOLD})`);
        }
      }
      
      // Durante fase de aprendizaje, no detectamos arritmias pero mantenemos estado
      return {
        detected: false,
        severity: 0,
        confidence: 0,
        type: "NONE" as ArrhythmiaType,
        timestamp: Date.now(),
        rmssd: 0,
        rrVariation: 0
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
    
    // MEJORA: Reducimos aún más el tiempo entre análisis
    const currentTime = Date.now();
    if (currentTime - this.lastAnalysisTime >= this.ANALYSIS_COOLDOWN_MS / 4) {
      this.lastAnalysisTime = currentTime;
      
      // Forzar análisis incluso con pocos datos (3 intervalos mínimo)
      if (this.rrIntervals.length >= 3) {
        console.log(`ArrhythmiaDetector: Analizando ritmo con ${this.rrIntervals.length} intervalos`);
        
        // Analizar con datos acumulados
        const result = this.analyzeRhythm();
        
        // Log del resultado para depuración
        console.log("ArrhythmiaDetector: Resultado del análisis:", {
          detected: result.detected,
          type: result.type,
          severity: result.severity,
          confidence: result.confidence
        });
        
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
      } else {
        console.log("ArrhythmiaDetector: Datos insuficientes para análisis");
      }
    }
    
    // Si no es tiempo de analizar, devolver último resultado o normal
    if (this.lastArrhythmiaResult && (currentTime - this.lastArrhythmiaResult.timestamp) < 3000) {
      // Mantener resultado de arritmia reciente para asegurar visualización
      return this.lastArrhythmiaResult;
    }
    
    return {
      detected: false,
      severity: 0,
      confidence: 0,
      type: "NONE" as ArrhythmiaType,
      timestamp: Date.now(),
      rmssd: 0,
      rrVariation: 0
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
    // MEJORA: Umbrales significativamente reducidos
    if (rmssd > 25 && rrVariation > 0.15) {
      detected = true;
      severity = Math.min(10, Math.max(1, Math.round(rmssd / 10)));
      confidence = Math.min(95, Math.max(70, 70 + (rrVariation * 100)));
      type = "FIBRILACIÓN AURICULAR";
    }
    // Detectar Bradicardia significativa
    else if (this.rrIntervals.length >= 5) {
      const avg = this.rrIntervals.reduce((a, b) => a + b, 0) / this.rrIntervals.length;
      const bpm = 60000 / avg;
      
      // MEJORA: Umbral elevado aún más
      if (bpm < 60) {
        detected = true;
        severity = Math.min(10, Math.max(1, Math.round((60 - bpm) / 3)));
        confidence = Math.min(95, Math.max(70, 70 + ((60 - bpm) * 3)));
        type = "BRADICARDIA";
      }
      // Detectar Taquicardia significativa - umbral reducido más
      else if (bpm > 95) {
        detected = true;
        severity = Math.min(10, Math.max(1, Math.round((bpm - 95) / 5)));
        confidence = Math.min(95, Math.max(70, 70 + ((bpm - 95) / 2)));
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
    
    // MEJORA: Log para depuración
    console.log("ArrhythmiaDetector.analyzeRhythm: Análisis completo:", {
      rmssd,
      rrVariation,
      prematureBeat: prematureBeatResult.detected,
      detected,
      type
    });
    
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
    if (this.rrIntervals.length < 3) {
      return { detected: false, severity: 0, confidence: 0 };
    }
    
    // Tomar últimos 4 intervalos (o los que haya)
    const numIntervals = Math.min(4, this.rrIntervals.length);
    const recentIntervals = this.rrIntervals.slice(-numIntervals);
    
    // MEJORA: Umbral aún más bajo para detección de intervalo prematuro
    const threshold = 0.6; // Reducido para mayor sensibilidad
    
    for (let i = 1; i < recentIntervals.length; i++) {
      const currentInterval = recentIntervals[i];
      const previousInterval = recentIntervals[i-1];
      
      // RR significativamente más corto que el anterior es prematura
      if (currentInterval < previousInterval * threshold) {
        // Solo si no es el último
        if (i < recentIntervals.length - 1) {
          const followingInterval = recentIntervals[i+1];
          
          // Intervalo compensatorio (ligeramente más largo que el normal)
          if (followingInterval > previousInterval * 1.05) {
            // MEJORA: Log para depuración del patrón detectado
            console.log("ArrhythmiaDetector: Patrón de latido prematuro detectado:", {
              prevInterval: previousInterval,
              prematureInterval: currentInterval,
              compensatoryInterval: followingInterval,
              ratio: currentInterval / previousInterval
            });
            
            // Calcular severidad basada en lo corto del intervalo prematuro
            const ratio = currentInterval / previousInterval;
            const severity = Math.min(10, Math.max(1, Math.round((1 - ratio) * 10)));
            
            // Más corto = más confianza en ser prematuro
            const confidence = Math.min(95, Math.max(70, 70 + (1 - ratio) * 100));
            
            return { 
              detected: true, 
              severity, 
              confidence 
            };
          }
        }
      }
    }
    
    return { detected: false, severity: 0, confidence: 0 };
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
