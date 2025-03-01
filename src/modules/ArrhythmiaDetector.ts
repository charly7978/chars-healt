/**
 * ArrhythmiaDetector.ts
 * 
 * Detector de arritmias avanzado para la aplicación CharsHealt
 * Especializado en la identificación precisa de latidos prematuros (extrasístoles)
 * que aparecen entre dos latidos normales.
 */

export class ArrhythmiaDetector {
  // Variables de control para la detección
  private intervals: number[] = []; // Intervalos RR (tiempo entre latidos)
  private intervalsDiff: number[] = []; // Diferencias entre intervalos consecutivos
  private learningIntervals: number[] = []; // Intervalos para aprendizaje inicial
  private lastPeakTime: number | null = null;
  private arrhythmiaCount: number = 0;
  private lastArrhythmiaTime: number = 0;
  private baselineAvgInterval: number = 0; // Intervalo promedio base (ritmo normal)
  private arrhythmiaStatus: string = "--";
  
  // Configuración para detección precisa
  private readonly LEARNING_PHASE_COUNT = 10; 
  private readonly ARRHYTHMIA_TIMEOUT_MS = 3000;
  private readonly MIN_PREMATURE_RATIO = 0.85; // Umbral para considerar un latido prematuro
  private readonly ADJACENT_COUNT = 5; // Número de intervalos adyacentes a analizar
  
  // Historia para análisis
  private lastTenIntervals: number[] = [];
  private normalRangeMin: number = 0;
  private normalRangeMax: number = 0;
  
  // Datos de arritmias detectadas
  private arrhythmiaData: {
    rmssd: number;
    rrVariation: number;
    timestamp: number;
  } = {
    rmssd: 0,
    rrVariation: 0,
    timestamp: 0
  };

  constructor() {
    this.reset();
  }

  /**
   * Indica si está en fase de aprendizaje
   */
  isInLearningPhase(): boolean {
    return this.learningIntervals.length < this.LEARNING_PHASE_COUNT;
  }

  /**
   * Actualiza los intervalos RR con nuevos datos
   * @param newIntervals Nuevos intervalos RR medidos
   * @param lastPeakTime Tiempo del último pico detectado
   */
  updateIntervals(newIntervals: number[], lastPeakTime: number | null): void {
    if (!newIntervals.length) return;
    
    // Actualizar último tiempo de pico detectado
    this.lastPeakTime = lastPeakTime;
    
    // Filtrar solo intervalos fisiológicamente válidos (entre 35-180 BPM)
    const validIntervals = this.filterValidIntervals(newIntervals);
    if (validIntervals.length === 0) return;
    
    // En fase de aprendizaje, recolectamos datos para establecer la línea base
    if (this.isInLearningPhase()) {
      this.learningIntervals.push(...validIntervals);
      
      // Si completamos fase de aprendizaje, calcular línea base
      if (this.learningIntervals.length >= this.LEARNING_PHASE_COUNT) {
        this.calculateBaseline();
      }
      return;
    }
    
    // Actualizar intervalos y últimos 10 para análisis
    this.intervals.push(...validIntervals);
    this.lastTenIntervals.push(...validIntervals);
    
    // Mantener solo los últimos 10 intervalos para análisis de tendencias
    if (this.lastTenIntervals.length > 10) {
      this.lastTenIntervals = this.lastTenIntervals.slice(-10);
    }
    
    // Calcular diferencias entre intervalos consecutivos
    this.calculateIntervalDifferences();
    
    // Actualizar rango normal dinámicamente
    this.updateNormalRange();
  }
  
  /**
   * Filtra intervalos para garantizar que sean fisiológicamente posibles
   */
  private filterValidIntervals(intervals: number[]): number[] {
    // Filtrar intervalos fisiológicamente posibles (entre ~333ms y ~1714ms)
    // Equivalente a ritmos cardíacos entre 35 y 180 BPM
    return intervals.filter(interval => 
      interval >= 333 && interval <= 1714
    );
  }
  
  /**
   * Calcula la línea base de intervalos normales
   */
  private calculateBaseline(): void {
    if (this.learningIntervals.length === 0) return;
    
    // Ordenar para eliminar outliers
    const sorted = [...this.learningIntervals].sort((a, b) => a - b);
    
    // Eliminar el 10% de valores extremos (5% superior y 5% inferior)
    const cutSize = Math.max(1, Math.floor(sorted.length * 0.05));
    const filtered = sorted.slice(cutSize, sorted.length - cutSize);
    
    // Calcular promedio como línea base
    this.baselineAvgInterval = filtered.reduce((sum, val) => sum + val, 0) / filtered.length;
    
    // Establecer rango normal inicial basado en la línea base
    this.normalRangeMin = this.baselineAvgInterval * 0.8;
    this.normalRangeMax = this.baselineAvgInterval * 1.2;
    
    console.log("ArrhythmiaDetector: Baseline establecida", {
      baselineAvgInterval: this.baselineAvgInterval,
      normalRangeMin: this.normalRangeMin,
      normalRangeMax: this.normalRangeMax
    });
  }
  
  /**
   * Calcula diferencias entre intervalos consecutivos
   */
  private calculateIntervalDifferences(): void {
    this.intervalsDiff = [];
    for (let i = 1; i < this.intervals.length; i++) {
      this.intervalsDiff.push(this.intervals[i] - this.intervals[i - 1]);
    }
  }
  
  /**
   * Actualiza el rango normal dinámicamente basado en los últimos intervalos
   */
  private updateNormalRange(): void {
    if (this.lastTenIntervals.length < 5) return;
    
    // Usar solo intervalos que parecen normales para ajustar el rango
    const normalIntervals = this.lastTenIntervals.filter(interval => 
      !this.isArrhythmicInterval(interval)
    );
    
    if (normalIntervals.length >= 3) {
      const avg = normalIntervals.reduce((sum, val) => sum + val, 0) / normalIntervals.length;
      
      // Actualizar línea base con adaptación lenta (25% del nuevo valor)
      this.baselineAvgInterval = this.baselineAvgInterval * 0.75 + avg * 0.25;
      
      // Actualizar rangos normales dinámicamente
      this.normalRangeMin = this.baselineAvgInterval * 0.8;
      this.normalRangeMax = this.baselineAvgInterval * 1.2;
    }
  }
  
  /**
   * Verifica si un intervalo específico es arrítmico basado en el rango normal
   */
  private isArrhythmicInterval(interval: number): boolean {
    // Un intervalo es arrítmico si está fuera del rango normal
    return interval < this.normalRangeMin || interval > this.normalRangeMax;
  }

  /**
   * Detecta patrones de arritmia en los intervalos RR
   * Algoritmo optimizado para detectar latidos prematuros
   * entre dos latidos normales
   */
  detect(): { 
    detected: boolean; 
    status: string; 
    data?: { 
      rmssd: number; 
      rrVariation: number; 
    } 
  } {
    // Si estamos en fase de aprendizaje, no detectamos arritmias aún
    if (this.isInLearningPhase() || this.intervals.length < 3) {
      return { 
        detected: false, 
        status: "--" 
      };
    }
    
    // Obtener los últimos intervalos para análisis
    const recentIntervals = this.intervals.slice(-this.ADJACENT_COUNT);
    if (recentIntervals.length < 3) {
      return { 
        detected: false, 
        status: "SIN ARRITMIA DETECTADA" 
      };
    }
    
    // Detección principal de extrasístoles o latidos prematuros
    const arrhythmiaDetected = this.detectPrematureBeat(recentIntervals);
    
    // Si se detectó una arritmia
    if (arrhythmiaDetected) {
      const now = Date.now();
      
      // Evitar duplicados aplicando un timeout
      if (now - this.lastArrhythmiaTime > this.ARRHYTHMIA_TIMEOUT_MS) {
        this.arrhythmiaCount++;
        this.lastArrhythmiaTime = now;
        
        // Calcular métricas adicionales
        const rmssd = this.calculateRMSSD();
        const rrVariation = this.calculateRRVariation();
        
        // Actualizar datos de arritmia
        this.arrhythmiaData = {
          rmssd,
          rrVariation,
          timestamp: now
        };
        
        // Actualizar estado
        this.arrhythmiaStatus = `ARRITMIA DETECTADA|${this.arrhythmiaCount}`;
        
        return {
          detected: true,
          status: this.arrhythmiaStatus,
          data: {
            rmssd,
            rrVariation
          }
        };
      }
    }
    
    // Si no hay arritmia detectada
    return {
      detected: false,
      status: "SIN ARRITMIA DETECTADA"
    };
  }
  
  /**
   * Algoritmo especializado para detectar latidos prematuros (extrasístoles)
   * que ocurren entre dos latidos normales.
   * 
   * Patrón típico: [Normal] - [Prematuro] - [Normal/Compensatorio]
   * Se traduce en intervalos: [Corto] - [Largo] por el latido prematuro
   */
  private detectPrematureBeat(intervals: number[]): boolean {
    if (intervals.length < 3) return false;
    
    // Para detectar un latido prematuro necesitamos al menos 3 intervalos
    // Centramos la detección en el intervalo del medio
    for (let i = 1; i < intervals.length - 1; i++) {
      const prevInterval = intervals[i - 1];
      const currentInterval = intervals[i];
      const nextInterval = intervals[i + 1];
      
      // Verificar si los intervalos anterior y posterior están en rango normal
      const isPrevNormal = !this.isArrhythmicInterval(prevInterval);
      const isNextNormal = !this.isArrhythmicInterval(nextInterval);
      
      // Patrón clásico de extrasístole: intervalo actual muy corto seguido por uno largo
      // El intervalo actual debe ser significativamente más corto que el promedio
      const isCurrentShort = currentInterval < this.normalRangeMin * this.MIN_PREMATURE_RATIO;
      
      // Si tenemos un intervalo corto entre dos normales, es muy probable que sea un latido prematuro
      if (isPrevNormal && isCurrentShort && isNextNormal) {
        return true;
      }
      
      // Otra forma de detectar: un intervalo corto seguido de uno largo (compensatorio)
      const isNextLong = nextInterval > this.normalRangeMax * 1.15;
      
      if (isCurrentShort && isNextLong) {
        // Verificar que la suma del intervalo corto y largo sea aproximadamente
        // igual a dos intervalos normales (característica del latido compensatorio)
        const sumBoth = currentInterval + nextInterval;
        const twoNormalExpected = this.baselineAvgInterval * 2;
        
        // Si la suma está dentro del 15% de lo esperado para dos latidos normales
        if (Math.abs(sumBoth - twoNormalExpected) < twoNormalExpected * 0.15) {
          return true;
        }
      }
    }
    
    return false;
  }
  
  /**
   * Calcula la raíz cuadrada de la media de las diferencias al cuadrado (RMSSD)
   * Métrica importante para evaluar la variabilidad de la frecuencia cardíaca
   */
  private calculateRMSSD(): number {
    if (this.intervalsDiff.length < 2) return 0;
    
    const squaredDiffs = this.intervalsDiff.map(diff => diff * diff);
    const meanSquared = squaredDiffs.reduce((sum, val) => sum + val, 0) / squaredDiffs.length;
    
    return Math.sqrt(meanSquared);
  }
  
  /**
   * Calcula la variación de intervalos RR como métrica de variabilidad
   */
  private calculateRRVariation(): number {
    if (this.intervals.length < 3) return 0;
    
    const recentIntervals = this.intervals.slice(-5);
    const avg = recentIntervals.reduce((sum, val) => sum + val, 0) / recentIntervals.length;
    
    const variations = recentIntervals.map(interval => 
      Math.abs(interval - avg) / avg
    );
    
    return variations.reduce((sum, val) => sum + val, 0) / variations.length * 100;
  }

  /**
   * Reinicia el detector
   */
  reset(): void {
    this.intervals = [];
    this.intervalsDiff = [];
    this.learningIntervals = [];
    this.lastPeakTime = null;
    this.arrhythmiaCount = 0;
    this.lastArrhythmiaTime = 0;
    this.baselineAvgInterval = 0;
    this.lastTenIntervals = [];
    this.arrhythmiaStatus = "--";
    this.normalRangeMin = 0;
    this.normalRangeMax = 0;
    
    this.arrhythmiaData = {
      rmssd: 0,
      rrVariation: 0,
      timestamp: 0
    };
    
    console.log("ArrhythmiaDetector: Reset completo");
  }

  /**
   * Limpia memoria
   */
  cleanMemory(): void {
    // Limpieza profunda para optimizar memoria
    this.reset();
    
    // Forzar limpieza de referencias para arrays
    if (Array.isArray(this.intervals)) this.intervals = [];
    if (Array.isArray(this.intervalsDiff)) this.intervalsDiff = [];
    if (Array.isArray(this.learningIntervals)) this.learningIntervals = [];
    if (Array.isArray(this.lastTenIntervals)) this.lastTenIntervals = [];
  }
}
