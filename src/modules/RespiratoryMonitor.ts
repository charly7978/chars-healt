/**
 * RespiratoryMonitor.ts
 * 
 * Monitor respiratorio que analiza la señal PPG existente para detectar ciclos respiratorios
 * y calcular la frecuencia respiratoria.
 * 
 * Este análisis se basa en la modulación de amplitud respiratoria (RAM) y la
 * arritmia sinusal respiratoria (RSA) presentes en la señal PPG.
 * 
 * Funciona de forma independiente sin modificar el procesamiento de señal existente.
 */

// Interfaz para los datos del ciclo respiratorio
export interface BreathingCycle {
  timestamp: number;
  duration: number;  // Duración del ciclo en ms
  amplitude: number; // Amplitud relativa
  confidence: number; // Confianza en la detección (0-1)
}

// Interfaz para los resultados del análisis respiratorio
export interface RespiratoryData {
  respirationRate: number;       // Respiraciones por minuto (RPM)
  confidence: number;            // Confianza en la estimación (0-1)
  breathingPattern: string;      // 'normal', 'rápida', 'lenta', 'irregular'
  lastCycles: BreathingCycle[];  // Últimos ciclos detectados
  estimatedDepth: number;        // Profundidad estimada (0-1)
  timestamp: number;             // Tiempo de la medición
}

export class RespiratoryMonitor {
  // Constantes para análisis respiratorio
  private readonly BUFFER_SIZE = 600;               // 20 segundos a 30fps
  private readonly RESPIRATION_BAND_MIN_HZ = 0.15;  // 9 respiraciones/min
  private readonly RESPIRATION_BAND_MAX_HZ = 0.40;  // 24 respiraciones/min
  private readonly MIN_BREATHING_CYCLE_MS = 2000;   // Mínimo 2s/ciclo (30 RPM máx)
  private readonly MAX_BREATHING_CYCLE_MS = 8000;   // Máximo 8s/ciclo (7.5 RPM mín)
  private readonly QUALITY_THRESHOLD = 0.5;         // Umbral de calidad para detectar respiración
  private readonly AMPLITUDE_THRESHOLD = 0.3;       // Umbral relativo para detectar picos respiratorios
  private readonly MIN_CONSISTENT_CYCLES = 3;       // Ciclos necesarios para estimación confiable

  // Buffers y estado
  private ppgSignalBuffer: number[] = [];           // Señal PPG sin procesar
  private breathingSignalBuffer: number[] = [];     // Señal respiratoria extraída
  private filteredSignalBuffer: number[] = [];      // Señal respiratoria filtrada
  private breathingCycles: BreathingCycle[] = [];   // Ciclos respiratorios detectados
  private lastBreathingPeakTime: number = 0;        // Tiempo del último pico respiratorio
  private lastEstimatedRate: number = 0;            // Última frecuencia respiratoria estimada
  private confidenceLevel: number = 0;              // Nivel de confianza actual (0-1)
  private signalQualityHistory: number[] = [];      // Historial de calidad de señal
  private breathingDepthHistory: number[] = [];     // Historial de profundidad respiratoria
  private samplingRate: number = 30;                // Tasa de muestreo por defecto (30Hz)
  private lastUpdateTime: number = 0;               // Último tiempo de actualización

  // Parámetros de filtrado adaptativo
  private readonly LOWPASS_ALPHA = 0.05;           // Coeficiente para filtro paso bajo
  private readonly TREND_REMOVAL_FACTOR = 0.998;   // Factor para eliminar tendencia
  private readonly ENVELOPE_ALPHA = 0.02;          // Coeficiente para detección de envolvente

  // Estado de detección
  private isFirstBreathDetected: boolean = false;
  private stableBreathingPeriod: number = 0;       // Período respiratorio estable detectado
  private detectionPhase: 'learning' | 'tracking' = 'learning';
  private irregularBreathingCounter: number = 0;   // Contador para respiración irregular

  constructor() {
    this.reset();
  }

  /**
   * Resetear el monitor respiratorio
   */
  reset(): void {
    this.ppgSignalBuffer = [];
    this.breathingSignalBuffer = [];
    this.filteredSignalBuffer = [];
    this.breathingCycles = [];
    this.lastBreathingPeakTime = 0;
    this.lastEstimatedRate = 0;
    this.confidenceLevel = 0;
    this.signalQualityHistory = [];
    this.breathingDepthHistory = [];
    this.isFirstBreathDetected = false;
    this.stableBreathingPeriod = 0;
    this.detectionPhase = 'learning';
    this.irregularBreathingCounter = 0;
    this.lastUpdateTime = Date.now();
  }

  /**
   * Procesar un nuevo valor de señal PPG
   * @param ppgValue - Valor de la señal PPG (puede ser filtrado o sin filtrar)
   * @param quality - Calidad de la señal (0-100)
   * @returns Datos respiratorios procesados o null si no hay suficientes datos
   */
  processSignal(ppgValue: number, quality: number): RespiratoryData | null {
    const currentTime = Date.now();
    
    // No procesar si la calidad es muy baja
    if (quality < 30) {
      // Si la calidad es muy baja durante mucho tiempo, reducir la confianza
      this.confidenceLevel = Math.max(0, this.confidenceLevel - 0.05);
      return this.generateRespData(currentTime);
    }
    
    // Actualizar historial de calidad
    this.signalQualityHistory.push(quality);
    if (this.signalQualityHistory.length > 30) {
      this.signalQualityHistory.shift();
    }

    // Añadir valor a los buffers
    this.ppgSignalBuffer.push(ppgValue);
    if (this.ppgSignalBuffer.length > this.BUFFER_SIZE) {
      this.ppgSignalBuffer.shift();
    }

    // Procesar solo cada 10 muestras para mejorar rendimiento
    const timeSinceLastUpdate = currentTime - this.lastUpdateTime;
    if (timeSinceLastUpdate < 333 && this.ppgSignalBuffer.length < 90) { // ~3Hz actualización o buffer pequeño
      return this.generateRespData(currentTime);
    }
    
    this.lastUpdateTime = currentTime;

    // Necesitamos al menos 3 segundos de datos para comenzar
    if (this.ppgSignalBuffer.length < 90) {
      return null;
    }
    
    // Actualizar la señal respiratoria extraída de la PPG
    this.updateRespiratorySignal();
    
    // Detectar ciclos respiratorios
    this.detectBreathingCycles(currentTime);
    
    // Calcular frecuencia respiratoria y confianza
    return this.generateRespData(currentTime);
  }

  /**
   * Extraer componente respiratorio de la señal PPG
   * La respiración modula la amplitud de la señal PPG y causa variaciones en la línea base
   */
  private updateRespiratorySignal(): void {
    // Si tenemos pocos datos, no podemos procesar correctamente
    if (this.ppgSignalBuffer.length < 60) return;
    
    // Para extracción de componente respiratoria usamos ventanas deslizantes
    const windowSize = Math.min(30, Math.floor(this.ppgSignalBuffer.length / 6));
    if (windowSize < 5) return;
    
    // 1. Detectar envolvente superior e inferior
    let upperEnvelope: number[] = [];
    let lowerEnvelope: number[] = [];
    
    for (let i = 0; i < this.ppgSignalBuffer.length; i++) {
      // Encontrar máximo y mínimo local en ventana deslizante
      let localMax = -Infinity;
      let localMin = Infinity;
      
      const startIdx = Math.max(0, i - windowSize);
      const endIdx = Math.min(this.ppgSignalBuffer.length - 1, i + windowSize);
      
      for (let j = startIdx; j <= endIdx; j++) {
        if (this.ppgSignalBuffer[j] > localMax) localMax = this.ppgSignalBuffer[j];
        if (this.ppgSignalBuffer[j] < localMin) localMin = this.ppgSignalBuffer[j];
      }
      
      upperEnvelope.push(localMax);
      lowerEnvelope.push(localMin);
    }
    
    // 2. Calcular la diferencia entre envolventes (amplitud respiratoria)
    const respiratorySignal = [];
    for (let i = 0; i < upperEnvelope.length; i++) {
      respiratorySignal.push(upperEnvelope[i] - lowerEnvelope[i]);
    }
    
    // 3. Aplicar filtrado paso bajo para enfatizar frecuencias respiratorias
    // Aproximadamente 0.15-0.4 Hz (9-24 respiraciones por minuto)
    let filteredSignal = this.lowPassFilter(respiratorySignal);
    
    // 4. Eliminar tendencia para tener señal centrada en cero
    filteredSignal = this.removeTrend(filteredSignal);
    
    // 5. Normalizar la señal respiratoria
    const normalizedSignal = this.normalizeSignal(filteredSignal);
    
    // Actualizar buffers
    this.breathingSignalBuffer = respiratorySignal;
    this.filteredSignalBuffer = normalizedSignal;
    
    // Actualizar profundidad respiratoria estimada
    if (respiratorySignal.length > 30) {
      const recentSignal = respiratorySignal.slice(-30);
      const maxAmp = Math.max(...recentSignal);
      const minAmp = Math.min(...recentSignal);
      const breathingDepth = maxAmp - minAmp;
      
      this.breathingDepthHistory.push(breathingDepth);
      if (this.breathingDepthHistory.length > 10) {
        this.breathingDepthHistory.shift();
      }
    }
  }

  /**
   * Aplicar filtro paso bajo a la señal
   */
  private lowPassFilter(signal: number[]): number[] {
    if (signal.length === 0) return [];
    
    const filtered = [signal[0]];
    for (let i = 1; i < signal.length; i++) {
      // Filtro IIR simple
      filtered.push(filtered[i-1] * (1 - this.LOWPASS_ALPHA) + signal[i] * this.LOWPASS_ALPHA);
    }
    return filtered;
  }

  /**
   * Eliminar tendencia de la señal
   */
  private removeTrend(signal: number[]): number[] {
    if (signal.length === 0) return [];
    
    const detrended = [0];
    let trend = signal[0];
    
    for (let i = 1; i < signal.length; i++) {
      // Actualizar tendencia suavemente
      trend = trend * this.TREND_REMOVAL_FACTOR + signal[i] * (1 - this.TREND_REMOVAL_FACTOR);
      // Restar tendencia de la señal
      detrended.push(signal[i] - trend);
    }
    
    return detrended;
  }

  /**
   * Normalizar señal a rango -1 a 1
   */
  private normalizeSignal(signal: number[]): number[] {
    if (signal.length === 0) return [];
    
    const max = Math.max(...signal.map(v => Math.abs(v)));
    if (max === 0) return signal.map(() => 0);
    
    return signal.map(v => v / max);
  }

  /**
   * Detectar ciclos respiratorios en la señal filtrada
   */
  private detectBreathingCycles(currentTime: number): void {
    if (this.filteredSignalBuffer.length < 60) return;
    
    // Analizar sólo la parte más reciente de la señal
    const recentSignal = this.filteredSignalBuffer.slice(-90);
    
    // Detectar cruces por cero positivos como inicio de inhalación
    const crossings = [];
    for (let i = 1; i < recentSignal.length; i++) {
      if (recentSignal[i-1] <= 0 && recentSignal[i] > 0) {
        crossings.push(i);
      }
    }
    
    // Necesitamos al menos 2 cruces para calcular un ciclo
    if (crossings.length < 2) return;
    
    // Calcular duración promedio del ciclo
    let totalDuration = 0;
    const cycleDurations = [];
    
    for (let i = 1; i < crossings.length; i++) {
      const cycleFrames = crossings[i] - crossings[i-1];
      const cycleDuration = cycleFrames * (1000 / this.samplingRate);
      
      // Solo considerar ciclos dentro de rango fisiológico
      if (cycleDuration >= this.MIN_BREATHING_CYCLE_MS && 
          cycleDuration <= this.MAX_BREATHING_CYCLE_MS) {
        totalDuration += cycleDuration;
        cycleDurations.push(cycleDuration);
      }
    }
    
    // Si no hay ciclos válidos, no podemos estimar la respiración
    if (cycleDurations.length === 0) {
      // Incrementar contador de irregularidad
      this.irregularBreathingCounter++;
      
      // Si hay muchos ciclos irregulares consecutivos, reducir confianza
      if (this.irregularBreathingCounter > 5) {
        this.confidenceLevel = Math.max(0, this.confidenceLevel - 0.1);
      }
      
      return;
    }
    
    // Resetear contador de irregularidad
    this.irregularBreathingCounter = 0;
    
    // Calcular amplitud máxima en ciclos recientes
    const maxAmplitude = Math.max(...recentSignal.map(v => Math.abs(v)));
    
    // Calcular duración promedio y convertir a frecuencia respiratoria
    const avgDuration = totalDuration / cycleDurations.length;
    const respirationRate = 60000 / avgDuration; // Convertir de ms/ciclo a respiraciones/minuto
    
    // Registrar ciclo respiratorio
    if (currentTime - this.lastBreathingPeakTime > this.MIN_BREATHING_CYCLE_MS) {
      // Calcular confianza basada en consistencia y amplitud
      let cycleConfidence = 0.5;
      
      // Si tenemos ciclos consistentes, aumentar confianza
      if (cycleDurations.length >= this.MIN_CONSISTENT_CYCLES) {
        // Evaluar consistencia: menor variación = mayor confianza
        const avgCycleDuration = cycleDurations.reduce((a, b) => a + b, 0) / cycleDurations.length;
        const durationVariance = cycleDurations.reduce((sum, duration) => 
          sum + Math.pow(duration - avgCycleDuration, 2), 0) / cycleDurations.length;
        const durationCV = Math.sqrt(durationVariance) / avgCycleDuration;
        
        // Penalizar alta variabilidad
        const consistencyFactor = Math.max(0, 1 - durationCV);
        
        // Considerar amplitud de señal (mayor amplitud = mayor confianza)
        const amplitudeFactor = Math.min(1, maxAmplitude / this.AMPLITUDE_THRESHOLD);
        
        // Evaluar calidad de señal PPG
        const signalQualityFactor = this.getAverageSignalQuality() / 100;
        
        // Combinar factores para confianza final
        cycleConfidence = consistencyFactor * 0.5 + amplitudeFactor * 0.3 + signalQualityFactor * 0.2;
      }
      
      // Registrar ciclo
      this.breathingCycles.push({
        timestamp: currentTime,
        duration: avgDuration,
        amplitude: maxAmplitude,
        confidence: cycleConfidence
      });
      
      this.lastBreathingPeakTime = currentTime;
      
      // Limitar número de ciclos almacenados
      if (this.breathingCycles.length > 10) {
        this.breathingCycles.shift();
      }
      
      // Actualizar estimación de frecuencia respiratoria con suavizado
      if (this.lastEstimatedRate === 0) {
        this.lastEstimatedRate = respirationRate;
      } else {
        // Más peso a la última medición si es confiable
        const alpha = Math.max(0.2, cycleConfidence);
        this.lastEstimatedRate = this.lastEstimatedRate * (1 - alpha) + respirationRate * alpha;
      }
      
      // Actualizar nivel de confianza global
      // Aumentar gradualmente si detectamos ciclos consistentes
      this.confidenceLevel = Math.min(1, this.confidenceLevel + 0.1 * cycleConfidence);
      
      // Marcar primera respiración detectada
      if (!this.isFirstBreathDetected && cycleConfidence > 0.6) {
        this.isFirstBreathDetected = true;
      }
      
      // Actualizar fase de detección
      if (this.breathingCycles.length >= this.MIN_CONSISTENT_CYCLES && 
          this.confidenceLevel > 0.7) {
        this.detectionPhase = 'tracking';
      }
    }
  }

  /**
   * Obtener calidad promedio de señal de las últimas muestras
   */
  private getAverageSignalQuality(): number {
    if (this.signalQualityHistory.length === 0) return 0;
    return this.signalQualityHistory.reduce((a, b) => a + b, 0) / this.signalQualityHistory.length;
  }

  /**
   * Obtener profundidad respiratoria promedio normalizada (0-1)
   */
  private getAverageBreathingDepth(): number {
    if (this.breathingDepthHistory.length === 0) return 0;
    
    const avgDepth = this.breathingDepthHistory.reduce((a, b) => a + b, 0) / this.breathingDepthHistory.length;
    
    // Normalizar a 0-1 usando un valor máximo típico
    // Este valor podría ajustarse según calibración específica
    const maxExpectedDepth = 30;
    return Math.min(1, avgDepth / maxExpectedDepth);
  }

  /**
   * Identificar patrón respiratorio basado en frecuencia y variabilidad
   */
  private getBreathingPattern(): string {
    if (this.breathingCycles.length < 3 || this.lastEstimatedRate === 0) {
      return 'desconocido';
    }
    
    // Evaluar variabilidad de ciclos
    const durations = this.breathingCycles.map(cycle => cycle.duration);
    const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
    const variance = durations.reduce((sum, duration) => 
      sum + Math.pow(duration - avgDuration, 2), 0) / durations.length;
    const cv = Math.sqrt(variance) / avgDuration; // Coeficiente de variación
    
    if (cv > 0.25) {
      return 'irregular';
    }
    
    // Clasificar por frecuencia
    if (this.lastEstimatedRate < 12) {
      return 'lenta';
    } else if (this.lastEstimatedRate > 20) {
      return 'rápida';
    } else {
      return 'normal';
    }
  }

  /**
   * Generar datos de respiración para la UI
   */
  private generateRespData(timestamp: number): RespiratoryData | null {
    // Si no tenemos estimación, retornar null
    if (this.lastEstimatedRate === 0 && !this.isFirstBreathDetected) {
      return null;
    }
    
    // Si no tenemos confianza suficiente pero tenemos detección inicial
    if (this.confidenceLevel < 0.3 && this.isFirstBreathDetected) {
      // Usar valor por defecto con baja confianza
      return {
        respirationRate: 16, // Valor normal adulto en reposo
        confidence: this.confidenceLevel,
        breathingPattern: 'desconocido',
        lastCycles: this.breathingCycles,
        estimatedDepth: this.getAverageBreathingDepth(),
        timestamp
      };
    }
    
    // Retornar datos completos
    return {
      respirationRate: Math.round(this.lastEstimatedRate * 10) / 10, // Redondear a 1 decimal
      confidence: this.confidenceLevel,
      breathingPattern: this.getBreathingPattern(),
      lastCycles: this.breathingCycles,
      estimatedDepth: this.getAverageBreathingDepth(),
      timestamp
    };
  }
  
  /**
   * Obtener la última frecuencia respiratoria calculada
   */
  getLastRespirationRate(): number {
    return Math.round(this.lastEstimatedRate * 10) / 10; // Redondear a 1 decimal
  }
  
  /**
   * Obtener el nivel de confianza actual (0-1)
   */
  getConfidence(): number {
    return this.confidenceLevel;
  }
  
  /**
   * Obtener la señal respiratoria filtrada para visualización
   */
  getFilteredSignal(): number[] {
    return [...this.filteredSignalBuffer];
  }
  
  /**
   * Limpiar memoria para gestión de recursos
   */
  cleanMemory(): void {
    if (this.ppgSignalBuffer.length > 300) {
      this.ppgSignalBuffer = this.ppgSignalBuffer.slice(-300);
    }
    if (this.breathingSignalBuffer.length > 300) {
      this.breathingSignalBuffer = this.breathingSignalBuffer.slice(-300);
    }
    if (this.filteredSignalBuffer.length > 300) {
      this.filteredSignalBuffer = this.filteredSignalBuffer.slice(-300);
    }
  }
} 