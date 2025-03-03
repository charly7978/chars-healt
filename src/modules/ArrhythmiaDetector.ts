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
    // Necesitamos al menos 2 intervalos para detectar latidos prematuros
    if (this.rrIntervals.length < 2) {
      return {
        detected: false,
        severity: 0,
        confidence: 20,
        type: "NONE" as ArrhythmiaType,
        timestamp: Date.now()
      };
    }
    
    // ENFOQUE EXCLUSIVO PARA LATIDOS PREMATUROS
    // Ignoramos todos los demás tipos de arritmias (fibrilación, taquicardia, etc.)
    
    // Detectar SOLO latido prematuro (extrasístole)
    const prematureBeatResult = this.detectPrematureBeat();
    
    // Inicializar valores por defecto
    let detected = false;
    let severity = 0;
    let confidence = 0;
    let type: string = "NORMAL";
    
    // Si se detecta latido prematuro, actualizar valores
    if (prematureBeatResult.detected) {
      detected = true;
      severity = prematureBeatResult.severity;
      confidence = prematureBeatResult.confidence;
      type = "CONTRACCIÓN PREMATURA";
      
      console.log("ArrhythmiaDetector: CONTRACCIÓN PREMATURA DETECTADA ✓", {
        severity,
        confidence
      });
    }
    
    // Actualizar el estado del detector
    const currentTime = Date.now();
    
    // Actualizar el texto de estado
    if (detected) {
      this.prematureBeatsCount++; // Incrementar contador de latidos prematuros
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
    
    // Crear objeto de resultado
    const result = {
      detected,
      severity,
      confidence,
      type: type as ArrhythmiaType,
      timestamp: currentTime,
      rmssd: 0,
      rrVariation: 0
    };
    
    // Si se detectó, guardar como último resultado
    if (detected) {
      this.lastArrhythmiaResult = result;
    }
    
    return result;
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
    // Verificar si tenemos suficientes datos
    if (this.rrIntervals.length < 2) {
      return { detected: false, severity: 0, confidence: 0 };
    }
    
    // DETECCIÓN SIMPLIFICADA Y ULTRA-SENSIBLE DE LATIDOS PREMATUROS
    
    // 1. Tomar los últimos intervalos (hasta 10)
    const recentIntervals = this.rrIntervals.slice(-10);
    
    // 2. Calcular la mediana para tener un valor de referencia robusto
    const sorted = [...recentIntervals].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    
    console.log("ArrhythmiaDetector: Analizando latidos prematuros", {
      recentIntervals,
      median
    });
    
    // 3. DETECCIÓN DIRECTA: Cualquier intervalo significativamente más corto
    // Usar umbral muy liberal (0.90 = 10% más corto) para máxima sensibilidad
    const shortIntervals = recentIntervals.filter(interval => interval < median * 0.90);
    
    if (shortIntervals.length > 0) {
      // Tomar el más corto para calcular severidad
      const shortestInterval = Math.min(...shortIntervals);
      const ratio = shortestInterval / median;
      
      // Incluso pequeñas diferencias son consideradas prematuros
      const severity = Math.min(10, Math.max(1, Math.round((1 - ratio) * 20)));
      // Alta confianza incluso con pequeñas diferencias
      const confidence = Math.min(95, Math.max(70, (1 - ratio) * 200));
      
      console.log(`ArrhythmiaDetector: Latido prematuro confirmado - Intervalo ${shortestInterval}ms vs normal ${median}ms`);
      console.log(`  Severidad: ${severity}, Confianza: ${confidence.toFixed(1)}%`);
      
      return {
        detected: true,
        severity,
        confidence
      };
    }
    
    // 4. DETECCIÓN DE PATRONES ESPECÍFICOS
    for (let i = 0; i < recentIntervals.length - 2; i++) {
      const normal = recentIntervals[i];
      const current = recentIntervals[i + 1];
      const following = recentIntervals[i + 2];
      
      // Patrón típico: normal → corto → compensatorio
      // Umbral muy sensible (0.85 = 15% más corto)
      if (current < normal * 0.85 && following > normal) {
        const ratio = current / normal;
        const severity = Math.min(10, Math.max(3, Math.round((1 - ratio) * 15)));
        const confidence = 90;
        
        console.log(`ArrhythmiaDetector: Patrón de latido prematuro clásico detectado`, {
          normal,
          prematuro: current,
          compensatorio: following
        });
        
        return {
          detected: true,
          severity,
          confidence
        };
      }
    }
    
    // No se detectaron latidos prematuros
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
