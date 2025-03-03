
/**
 * RespirationProcessor
 * 
 * Módulo para detección y procesamiento de señales respiratorias a partir
 * de variaciones en amplitud del PPG.
 */

export class RespirationProcessor {
  private readonly WINDOW_SIZE = 60; // Ventana de 30 segundos para análisis
  private amplitudeBuffer: number[] = [];
  private breathRates: number[] = [];
  private lastBreathTime: number | null = null;
  private baselineAmplitude: number = 0;
  private calibrationSamples: number = 0;
  private calibrationSum: number = 0;
  
  /**
   * Procesa una señal PPG para extraer información respiratoria
   * La respiración se detecta por la modulación de la amplitud del PPG
   */
  public processSignal(ppgValue: number, peakAmplitude?: number): { 
    rate: number;         // Respiraciones por minuto 
    depth: number;        // Profundidad relativa (0-100)
    regularity: number;   // Regularidad (0-100)
  } {
    const currentTime = Date.now();
    
    // Añadir a buffer y mantener tamaño limitado
    if (peakAmplitude !== undefined) {
      this.amplitudeBuffer.push(peakAmplitude);
      if (this.amplitudeBuffer.length > this.WINDOW_SIZE) {
        this.amplitudeBuffer.shift();
      }
      
      // Fase de calibración - primeras 10 muestras
      if (this.calibrationSamples < 10) {
        this.calibrationSum += peakAmplitude;
        this.calibrationSamples++;
        this.baselineAmplitude = this.calibrationSum / this.calibrationSamples;
      } else {
        // Actualización continua de la línea base (adaptación lenta)
        this.baselineAmplitude = this.baselineAmplitude * 0.95 + peakAmplitude * 0.05;
      }
      
      // Detectar posible respiración mediante cambios en amplitud
      if (this.amplitudeBuffer.length >= 3) {
        const recentValues = this.amplitudeBuffer.slice(-3);
        const avgRecent = recentValues.reduce((sum, val) => sum + val, 0) / recentValues.length;
        
        // Usamos una función sigmoidal para mapear diferencias en amplitud a probabilidad de respiración
        const diffFromBaseline = Math.abs(avgRecent - this.baselineAmplitude);
        const normalizedDiff = Math.min(1.0, diffFromBaseline / (this.baselineAmplitude * 0.3));
        
        // Detectar respiración cuando hay una variación significativa
        if (normalizedDiff > 0.4 && 
            (this.lastBreathTime === null || currentTime - this.lastBreathTime > 1500)) {
          
          if (this.lastBreathTime !== null) {
            const interval = currentTime - this.lastBreathTime;
            // Convertir intervalo en ms a respiraciones por minuto
            const breathRate = 60000 / interval;
            
            // Solo aceptar tasas fisiológicamente normales (4-60 respiraciones por minuto)
            if (breathRate >= 4 && breathRate <= 60) {
              this.breathRates.push(breathRate);
              if (this.breathRates.length > 10) {
                this.breathRates.shift();
              }
            }
          }
          
          this.lastBreathTime = currentTime;
        }
      }
    }
    
    // Calcular tasa respiratoria promedio
    let respirationRate = 0;
    if (this.breathRates.length > 1) {
      // Eliminar valores extremos
      const sortedRates = [...this.breathRates].sort((a, b) => a - b);
      const filteredRates = sortedRates.slice(1, -1);
      respirationRate = filteredRates.reduce((sum, rate) => sum + rate, 0) / 
                        Math.max(1, filteredRates.length);
    } else if (this.breathRates.length === 1) {
      respirationRate = this.breathRates[0];
    }
    
    // Calcular profundidad respiratoria basada en la variación de amplitud
    let depthEstimate = 0;
    if (this.amplitudeBuffer.length >= 5) {
      const recentAmplitudes = this.amplitudeBuffer.slice(-5);
      const minAmp = Math.min(...recentAmplitudes);
      const maxAmp = Math.max(...recentAmplitudes);
      
      // Normalizar la profundidad relativa entre 0-100
      depthEstimate = Math.min(100, Math.max(0, 
        (maxAmp - minAmp) / (this.baselineAmplitude * 0.5) * 100
      ));
    }
    
    // Calcular regularidad basada en variación de tasas respiratorias
    let regularityEstimate = 0;
    if (this.breathRates.length >= 3) {
      // Desviación estándar normalizada invertida (menos variación = mayor regularidad)
      const mean = this.breathRates.reduce((sum, rate) => sum + rate, 0) / this.breathRates.length;
      const variance = this.breathRates.reduce((sum, rate) => sum + Math.pow(rate - mean, 2), 0) / 
                      this.breathRates.length;
      const stdDev = Math.sqrt(variance);
      
      // Convertir desviación estándar a escala de regularidad (0-100)
      // Menor desviación = mayor regularidad
      regularityEstimate = Math.max(0, Math.min(100, 100 - (stdDev / mean * 100)));
    }
    
    return {
      rate: Math.round(respirationRate * 10) / 10,  // Redondear a 1 decimal
      depth: Math.round(depthEstimate),
      regularity: Math.round(regularityEstimate)
    };
  }
  
  /**
   * Verificar si hay suficientes datos para mostrar información respiratoria
   */
  public hasValidData(): boolean {
    return this.breathRates.length >= 2;
  }
  
  /**
   * Reset all data and start fresh
   */
  public reset(): void {
    this.amplitudeBuffer = [];
    this.breathRates = [];
    this.lastBreathTime = null;
    this.baselineAmplitude = 0;
    this.calibrationSamples = 0;
    this.calibrationSum = 0;
  }
}
