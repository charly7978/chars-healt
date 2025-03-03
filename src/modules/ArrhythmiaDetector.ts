import { ArrhythmiaResult, ArrhythmiaType } from '../types/signal';

export class ArrhythmiaDetector {
  private rrIntervals: number[] = [];
  private amplitudes: number[] = [];
  private lastPeakTime: number | null = null;
  private lastAnalysisTime: number = 0;
  private readonly ANALYSIS_COOLDOWN_MS = 50; // Tiempo mínimo entre análisis
  private lastArrhythmiaResult: ArrhythmiaResult | null = null;
  private statusText: string = "LATIDO NORMAL|0";
  private prematureBeatsCount: number = 0;
  
  constructor() {
    console.log("ArrhythmiaDetector: Inicializado - Versión simple para latidos prematuros");
  }
  
  public processRRIntervals(intervals: number[], amplitudes?: number[]): ArrhythmiaResult {
    console.log("ArrhythmiaDetector: Procesando intervalos RR:", intervals);
    
    // Añadir intervalos al buffer (con filtrado básico)
    this.rrIntervals = [...this.rrIntervals, ...intervals.filter(interval => interval >= 200 && interval <= 2000)];
    
    // Limitar tamaño del buffer a 20 intervalos
    if (this.rrIntervals.length > 20) {
      this.rrIntervals = this.rrIntervals.slice(-20);
    }
    
    // Guardar amplitudes si están disponibles
    if (amplitudes && amplitudes.length > 0) {
      this.amplitudes = [...this.amplitudes, ...amplitudes];
      
      // Mantener mismo tamaño que los intervalos
      if (this.amplitudes.length > this.rrIntervals.length) {
        this.amplitudes = this.amplitudes.slice(-this.rrIntervals.length);
      }
    }
    
    // Análisis sólo si hay suficientes intervalos y ha pasado el tiempo mínimo
    const currentTime = Date.now();
    if (currentTime - this.lastAnalysisTime >= this.ANALYSIS_COOLDOWN_MS) {
      this.lastAnalysisTime = currentTime;
      
      // Solo necesitamos 2 intervalos para detectar prematuros
      if (this.rrIntervals.length >= 2) {
        console.log(`ArrhythmiaDetector: Analizando ritmo con ${this.rrIntervals.length} intervalos`);
        
        // Analizar para detectar latido prematuro
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
          this.prematureBeatsCount += 1;
          
          console.log("ArrhythmiaDetector: ¡LATIDO PREMATURO DETECTADO!", {
            type: result.type,
            severity: result.severity,
            confidence: result.confidence
          });
          
          // Actualizar status para visualización
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
      timestamp: Date.now()
    };
  }
  
  public setLastPeakTime(timestamp: number): void {
    this.lastPeakTime = timestamp;
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
        confidence: 0,
        type: "NONE" as ArrhythmiaType,
        timestamp: Date.now()
      };
    }
    
    // DETECCIÓN EXCLUSIVA DE LATIDOS PREMATUROS
    // Usamos un enfoque simple basado en la detección de intervalos cortos
    
    // 1. Tomar los últimos intervalos (hasta 8)
    const recentIntervals = this.rrIntervals.slice(-8);
    
    // 2. Calcular la mediana para tener un valor de referencia robusto
    const sorted = [...recentIntervals].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    
    // El último intervalo es el más reciente
    const lastInterval = recentIntervals[recentIntervals.length - 1];
    
    console.log("ArrhythmiaDetector: Analizando latidos prematuros", {
      recentIntervals,
      median,
      lastInterval,
      ratio: lastInterval / median
    });
    
    // 3. DETECCIÓN SENCILLA: El último intervalo es significativamente más corto
    // Un latido prematuro típicamente tiene un intervalo 10-20% más corto
    const threshold = 0.90; // Más sensible: 10% más corto
    
    if (lastInterval < median * threshold) {
      console.log("ArrhythmiaDetector: ¡LATIDO PREMATURO DETECTADO!", {
        lastInterval, 
        median,
        ratio: lastInterval / median,
        threshold
      });
      
      // Incrementar contador
      this.prematureBeatsCount++;
      
      // Calcular severidad basada en cuánto se desvía de la mediana
      const deviationRatio = lastInterval / median;
      const severity = Math.min(100, Math.max(50, Math.round((1 - deviationRatio) * 100)));
      
      // Mayor confianza mientras más corto sea el intervalo
      const confidence = Math.min(100, Math.round((1 - deviationRatio) * 120));
      
      const now = Date.now();
      this.statusText = `CONTRACCIÓN PREMATURA|${this.prematureBeatsCount}`;
      
      this.lastArrhythmiaResult = {
        detected: true,
        severity,
        confidence,
        type: "PVC" as ArrhythmiaType, // PVC (Premature Ventricular Contraction)
        timestamp: now,
        prematureBeat: true // Añadimos explícitamente el flag
      };
      
      return this.lastArrhythmiaResult;
    }
    
    // No se detectaron latidos prematuros
    this.statusText = `LATIDO NORMAL|${this.prematureBeatsCount}`;
    return {
      detected: false,
      severity: 0,
      confidence: 0,
      type: "NONE" as ArrhythmiaType,
      timestamp: Date.now()
    };
  }
  
  public reset(): void {
    this.rrIntervals = [];
    this.amplitudes = [];
    this.lastAnalysisTime = 0;
    this.lastPeakTime = null;
    this.lastArrhythmiaResult = null;
    this.statusText = "LATIDO NORMAL|0";
    this.prematureBeatsCount = 0;
    
    console.log("ArrhythmiaDetector: Reset completo");
  }
}
