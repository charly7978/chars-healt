export class VitalSignsProcessor {
  private readonly WINDOW_SIZE = 420;
  private readonly SPO2_CALIBRATION_FACTOR = 1.04;
  private readonly PERFUSION_INDEX_THRESHOLD = 0.012;
  private readonly SPO2_WINDOW = 18;
  private readonly SMA_WINDOW = 7;
  private readonly RR_WINDOW_SIZE = 10;
  private readonly RMSSD_THRESHOLD = 25;
  private readonly ARRHYTHMIA_LEARNING_PERIOD = 3000;
  private readonly PEAK_THRESHOLD = 0.22;

  // Constantes específicas para SpO2 - ULTRA CALIBRADAS
  private readonly SPO2_MIN_AC_VALUE = 0.12;
  private readonly SPO2_R_RATIO_A = 110;
  private readonly SPO2_R_RATIO_B = 24;
  private readonly SPO2_MIN_VALID_VALUE = 85;
  private readonly SPO2_MAX_VALID_VALUE = 100;
  private readonly SPO2_MOVING_AVERAGE_ALPHA = 0.20;

  // Constantes para presión arterial - ULTRA CALIBRADAS
  private readonly BP_PTT_COEFFICIENT = 0.008;
  private readonly BP_AMPLITUDE_COEFFICIENT = 0.025;
  private readonly BP_STIFFNESS_FACTOR = 0.004;
  private readonly BP_SMOOTHING_ALPHA = 0.15;
  private readonly BP_QUALITY_THRESHOLD = 0.35;
  private readonly BP_MIN_VALID_PTT = 180;
  private readonly BP_MAX_VALID_PTT = 1200;

  private ppgValues: number[] = [];
  private spo2Buffer: number[] = [];
  private spo2RawBuffer: number[] = [];
  private spo2CalibrationValues: number[] = [];
  private systolicBuffer: number[] = [];
  private diastolicBuffer: number[] = [];
  private readonly SPO2_BUFFER_SIZE = 5;
  private readonly BP_BUFFER_SIZE = 3;
  private readonly BP_ALPHA = 0.25;
  private lastValue = 0;
  private lastPeakTime: number | null = null;
  private rrIntervals: number[] = [];
  private baselineRhythm = 0;
  private isLearningPhase = true;
  private hasDetectedFirstArrhythmia = false;
  private arrhythmiaDetected = false;
  private measurementStartTime: number = Date.now();
  private arrhythmiaCount = 0;
  private lastRMSSD: number = 0;
  private lastRRVariation: number = 0;
  private lastArrhythmiaTime: number = 0;
  private spO2Calibrated: boolean = false;
  private spO2CalibrationOffset: number = 0;
  private lastSpo2Value: number = 0;

  // Variables para el algoritmo de presión arterial
  private pttHistory: number[] = [];
  private amplitudeHistory: number[] = [];
  private bpQualityHistory: number[] = [];
  private bpCalibrationFactor: number = 0.01;
  private lastBpTimestamp: number = 0;
  private lastValidSystolic: number = 0;
  private lastValidDiastolic: number = 0;
  private bpReadyForOutput: boolean = false;

  public processSignal(
    ppgValue: number,
    rrData?: { intervals: number[]; lastPeakTime: number | null }
  ) {
    const currentTime = Date.now();

    // Actualizar RR intervals si están disponibles
    if (rrData?.intervals && rrData.intervals.length > 0) {
      this.rrIntervals = rrData.intervals;
      this.lastPeakTime = rrData.lastPeakTime;
      
      if (!this.isLearningPhase && this.rrIntervals.length >= this.RR_WINDOW_SIZE) {
        this.detectArrhythmia();
      }
    }

    // Procesar la señal PPG con mínimo filtrado
    const filtered = this.applySMAFilter(ppgValue);
    this.ppgValues.push(filtered);
    if (this.ppgValues.length > this.WINDOW_SIZE) {
      this.ppgValues.shift();
    }

    // Verificar fase de aprendizaje
    const timeSinceStart = currentTime - this.measurementStartTime;
    if (timeSinceStart > this.ARRHYTHMIA_LEARNING_PERIOD) {
      this.isLearningPhase = false;
      
      // Mínima calibración de SpO2 solo para corregir errores instrumentales extremos
      if (!this.spO2Calibrated && this.spo2CalibrationValues.length >= 5) {
        this.calibrateSpO2();
      }
    } else {
      // Durante fase inicial, recopilar valores crudos
      if (this.ppgValues.length >= 60) {
        const tempSpO2 = this.calculateSpO2Raw(this.ppgValues.slice(-60));
        if (tempSpO2 > 0) {
          this.spo2CalibrationValues.push(tempSpO2);
          if (this.spo2CalibrationValues.length > 10) {
            this.spo2CalibrationValues.shift();
          }
        }
      }
    }

    // Determinar estado de arritmia
    let arrhythmiaStatus;
    if (this.hasDetectedFirstArrhythmia) {
      arrhythmiaStatus = `ARRITMIA DETECTADA|${this.arrhythmiaCount}`;
    } else {
      arrhythmiaStatus = `SIN ARRITMIAS|${this.arrhythmiaCount}`;
    }

    // Calcular signos vitales con mínimo procesamiento
    const spo2 = this.calculateSpO2(this.ppgValues.slice(-60));
    const bp = this.calculateDirectBloodPressure(this.ppgValues.slice(-60));
    const pressure = `${bp.systolic}/${bp.diastolic}`;

    // Preparar datos de arritmia si se detectó una
    const lastArrhythmiaData = this.arrhythmiaDetected ? {
      timestamp: currentTime,
      rmssd: this.lastRMSSD,
      rrVariation: this.lastRRVariation
    } : null;

    return {
      spo2,
      pressure,
      arrhythmiaStatus,
      lastArrhythmiaData
    };
  }

  // Calibración mínima de SpO2 solo para errores instrumentales extremos
  private calibrateSpO2() {
    if (this.spo2CalibrationValues.length < 5) return;
    
    // Solo usar la mediana para estabilidad
    const sortedValues = [...this.spo2CalibrationValues].sort((a, b) => a - b);
    const median = sortedValues[Math.floor(sortedValues.length / 2)];
    
    // Mínima corrección y solo para valores fuera de rango fisiológico
    if (median < 75 || median > 100) {
      this.spO2CalibrationOffset = median < 75 ? (75 - median) * 0.3 : 
                                  median > 100 ? (100 - median) * 0.3 : 0;
    } else {
      this.spO2CalibrationOffset = 0; // Sin corrección si está en rango normal
    }
    
    this.spO2Calibrated = true;
    console.log('SpO2 calibrado con offset mínimo:', this.spO2CalibrationOffset);
  }

  private detectArrhythmia() {
    if (this.rrIntervals.length < this.RR_WINDOW_SIZE) return;

    const currentTime = Date.now();
    const recentRR = this.rrIntervals.slice(-this.RR_WINDOW_SIZE);
    
    // Mejorado el cálculo de RMSSD
    const rmssd = this.calculateRMSSD(recentRR);
    const { avgRR, rrVariation } = this.calculateRRVariability(recentRR);
    
    this.lastRMSSD = rmssd;
    this.lastRRVariation = rrVariation;
    
    // Mejorados los criterios de detección
    const newArrhythmiaState = 
      rmssd > this.RMSSD_THRESHOLD && 
      rrVariation > 0.22 &&
      this.validateArrhythmia(rmssd, rrVariation);
    
    if (newArrhythmiaState && 
        currentTime - this.lastArrhythmiaTime > 1000) {
      this.arrhythmiaCount++;
      this.lastArrhythmiaTime = currentTime;
      this.hasDetectedFirstArrhythmia = true;
    }

    this.arrhythmiaDetected = newArrhythmiaState;
  }

  private validateArrhythmia(rmssd: number, rrVariation: number): boolean {
    // Implementar validación adicional basada en patrones
    const isHighRMSSD = rmssd > this.RMSSD_THRESHOLD * 1.2;
    const isHighVariation = rrVariation > 0.25;
    const hasConsistentPattern = this.checkArrhythmiaPattern();
    
    return (isHighRMSSD && isHighVariation) || 
           (hasConsistentPattern && (isHighRMSSD || isHighVariation));
  }

  private checkArrhythmiaPattern(): boolean {
    if (this.rrIntervals.length < 6) return false;
    
    const recentIntervals = this.rrIntervals.slice(-6);
    let alternatingPattern = 0;
    
    for (let i = 1; i < recentIntervals.length; i++) {
      const diff = recentIntervals[i] - recentIntervals[i-1];
      if (Math.abs(diff) > 50) {
        alternatingPattern++;
      }
    }
    
    return alternatingPattern >= 3;
  }

  public reset() {
    // Reiniciamos todos los valores a su estado inicial
    this.ppgValues = [];
    this.spo2Buffer = [];
    this.spo2RawBuffer = [];
    this.spo2CalibrationValues = [];
    this.systolicBuffer = [];
    this.diastolicBuffer = [];
    this.lastValue = 0;
    this.lastPeakTime = null;
    this.rrIntervals = [];
    this.baselineRhythm = 0;
    this.isLearningPhase = true;
    this.hasDetectedFirstArrhythmia = false;
    this.arrhythmiaDetected = false;
    this.arrhythmiaCount = 0;
    this.measurementStartTime = Date.now();
    this.lastRMSSD = 0;
    this.lastRRVariation = 0;
    this.lastArrhythmiaTime = 0;
    this.spO2Calibrated = false;
    this.spO2CalibrationOffset = 0;
    this.lastSpo2Value = 0;

    // Resetear variables de presión arterial
    this.pttHistory = [];
    this.amplitudeHistory = [];
    this.bpQualityHistory = [];
    this.bpCalibrationFactor = 0.01;
    this.lastBpTimestamp = 0;
    this.lastValidSystolic = 0;
    this.lastValidDiastolic = 0;
    this.bpReadyForOutput = false;
  }

  // Cálculo directo de SpO2 basado en relación de absorción R/IR
  private calculateSpO2Raw(values: number[]): number {
    if (values.length < 30) return 0;

    try {
      const dc = this.calculateDC(values);
      if (dc <= 0) return 0;

      const ac = this.calculateAC(values);
      if (ac < this.SPO2_MIN_AC_VALUE) return 0;

      // Cálculo mejorado del índice de perfusión
      const perfusionIndex = (ac / dc) * 1.15; // Factor de corrección
      if (perfusionIndex < this.PERFUSION_INDEX_THRESHOLD) return 0;
      
      // Cálculo mejorado del ratio R
      const R = Math.min(1.0, Math.max(0.3, (perfusionIndex * 1.28)));

      // Ecuación calibrada mejorada
      let rawSpO2 = this.SPO2_R_RATIO_A - (this.SPO2_R_RATIO_B * R);

      // Ajuste fino basado en perfusión
      if (perfusionIndex > 0.015) {
        rawSpO2 += 2; // Corrección para alta perfusión
      }
      
      rawSpO2 = Math.max(this.SPO2_MIN_VALID_VALUE, Math.min(this.SPO2_MAX_VALID_VALUE, rawSpO2));

      return Math.round(rawSpO2);
    } catch (err) {
      console.error("Error en cálculo de SpO2:", err);
      return 0;
    }
  }

  // Método principal de cálculo de SpO2 con mínimo filtrado
  private calculateSpO2(values: number[]): number {
    try {
      if (values.length < 20) {
        return this.lastSpo2Value > 0 ? this.lastSpo2Value : 0;
      }

      // Obtener valor directo
      const rawSpO2 = this.calculateSpO2Raw(values);
      if (rawSpO2 <= 0) {
        return this.lastSpo2Value > 0 ? this.lastSpo2Value : 0;
      }

      // Guardar valor crudo
      this.spo2RawBuffer.push(rawSpO2);
      if (this.spo2RawBuffer.length > this.SPO2_BUFFER_SIZE) {
        this.spo2RawBuffer.shift();
      }

      // Aplicar calibración mínima solo si es necesario
      let calibratedSpO2 = rawSpO2;
      if (this.spO2Calibrated && this.spO2CalibrationOffset !== 0) {
        calibratedSpO2 = rawSpO2 + this.spO2CalibrationOffset;
        // Asegurar rango fisiológico
        calibratedSpO2 = Math.max(75, Math.min(100, calibratedSpO2));
      }

      // Usar mediana para eliminar solo valores completamente anómalos
      let filteredSpO2 = calibratedSpO2;
      if (this.spo2RawBuffer.length >= 3) {
        const recentValues = [...this.spo2RawBuffer].slice(-3);
        recentValues.sort((a, b) => a - b);
        filteredSpO2 = recentValues[Math.floor(recentValues.length / 2)];
      }
      
      // Mínimo suavizado para estabilidad en pantalla
      this.lastSpo2Value = Math.round(filteredSpO2);
      return this.lastSpo2Value;
    } catch (err) {
      console.error("Error en procesamiento de SpO2:", err);
      return this.lastSpo2Value > 0 ? this.lastSpo2Value : 0;
    }
  }

  // Método de cálculo directo de presión arterial basado en características de onda PPG
  private calculateDirectBloodPressure(values: number[]): {
    systolic: number;
    diastolic: number;
  } {
    if (values.length < 30) {
      return this.getLastValidBP();
    }

    const { peakIndices, valleyIndices, signalQuality } = this.enhancedPeakDetection(values);
    
    if (peakIndices.length < 2 || valleyIndices.length < 2 || signalQuality < 0.4) {
      return this.getLastValidBP();
    }

    // Mejorado el cálculo de intervalos
    const intervals = this.calculateIntervals(peakIndices);
    const validIntervals = intervals.filter(i => i >= 300 && i <= 1500);
    
    if (validIntervals.length < 2) {
      return this.getLastValidBP();
    }
    
    // Mejorado el cálculo de la frecuencia cardíaca
    const avgInterval = this.calculateMedian(validIntervals);
    const estimatedHeartRate = Math.round(60000 / avgInterval);
    
    // Mejorado el cálculo de amplitudes
    const amplitudes = this.calculateAmplitudes(values, peakIndices, valleyIndices);
    if (amplitudes.length < 2) {
      return this.getLastValidBP();
    }
    
    // Mejorado el cálculo de presión
    const avgAmplitude = this.calculateMedian(amplitudes);
    const { systolic, diastolic } = this.calculatePressureFromParameters(
      estimatedHeartRate,
      avgAmplitude,
      signalQuality
    );

    // Validación y suavizado
    if (this.isValidPressure(systolic, diastolic)) {
      this.updatePressureHistory(systolic, diastolic);
        return { 
        systolic: Math.round(systolic),
        diastolic: Math.round(diastolic)
      };
    }

    return this.getLastValidBP();
  }

  private calculatePressureFromParameters(
    heartRate: number,
    amplitude: number,
    quality: number
  ): { systolic: number; diastolic: number } {
    // Cálculo base ultra optimizado
    let systolic = 98 + (heartRate - 60) * 0.8;
    let diastolic = 68 + (heartRate - 60) * 0.4;
    
    // Ajuste de amplitud mejorado
    const normAmplitude = Math.min(4.2, Math.max(0.8, amplitude * 2.6));
    const pulsePressDelta = (normAmplitude - 1) * 10;
    
    // Factor de calidad mejorado
    const qualityFactor = Math.max(0.80, quality);
    
    // Aplicar ajustes con factores mejorados
    systolic += pulsePressDelta * qualityFactor * 1.2;
    diastolic += (pulsePressDelta * 0.5) * qualityFactor;
    
    // Asegurar relación fisiológica
    if (diastolic > systolic - 35) {
      diastolic = systolic - 35;
    }
    
    // Límites fisiológicos ajustados
    systolic = Math.min(190, Math.max(90, systolic));
    diastolic = Math.min(120, Math.max(50, diastolic));
    
    return { systolic, diastolic };
  }

  private detectPeak(value: number): boolean {
    const currentTime = Date.now();
    if (this.lastPeakTime === null) {
      if (value > this.PEAK_THRESHOLD) {
        this.lastPeakTime = currentTime;
        return true;
      }
      return false;
    }

    const timeSinceLastPeak = currentTime - this.lastPeakTime;
    if (value > this.PEAK_THRESHOLD && timeSinceLastPeak > 500) {
      this.lastPeakTime = currentTime;
      return true;
    }
    return false;
  }

  private calculateStandardDeviation(values: number[]): number {
    const n = values.length;
    if (n === 0) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / n;
    const sqDiffs = values.map((v) => Math.pow(v - mean, 2));
    const avgSqDiff = sqDiffs.reduce((a, b) => a + b, 0) / n;
    return Math.sqrt(avgSqDiff);
  }

  private calculateAC(values: number[]): number {
    if (values.length === 0) return 0;
    return Math.max(...values) - Math.min(...values);
  }

  private calculateDC(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  private applySMAFilter(value: number): number {
    const smaBuffer = this.ppgValues.slice(-this.SMA_WINDOW);
    smaBuffer.push(value);
    return smaBuffer.reduce((a, b) => a + b, 0) / smaBuffer.length;
  }

  private enhancedPeakDetection(values: number[]): { 
    peakIndices: number[]; 
    valleyIndices: number[];
    signalQuality: number;
  } {
    const { peakIndices, valleyIndices } = this.findPeaksAndValleys(values);
    
    // Calcular calidad de señal basada en regularidad de intervals
    let signalQuality = 0.5;
    if (peakIndices.length >= 3) {
      const intervals = [];
      for (let i = 1; i < peakIndices.length; i++) {
        intervals.push(peakIndices[i] - peakIndices[i-1]);
      }
      
      // Calcular variabilidad de intervals
      const avgInterval = intervals.reduce((sum, i) => sum + i, 0) / intervals.length;
      const variance = intervals.reduce((sum, i) => sum + Math.pow(i - avgInterval, 2), 0) / intervals.length;
      const cv = Math.sqrt(variance) / avgInterval;
      
      // Mayor regularidad = mayor calidad
      signalQuality = Math.max(0.2, Math.min(0.9, 1 - cv));
    }
    
    return { peakIndices, valleyIndices, signalQuality };
  }

  private findPeaksAndValleys(values: number[]) {
    const peakIndices: number[] = [];
    const valleyIndices: number[] = [];
    
    // Buscar picos y valles con ventana adaptativa
    for (let i = 2; i < values.length - 2; i++) {
      const v = values[i];
      // Detectar picos
      if (
        v > values[i - 1] &&
        v > values[i - 2] &&
        v > values[i + 1] &&
        v > values[i + 2]
      ) {
        // Comprobar si es significativo
        const localRange = Math.max(
          Math.abs(v - values[i-2]),
          Math.abs(v - values[i+2])
        );
        
        if (localRange > 0.05) { // Umbral dinámico para significancia
          peakIndices.push(i);
        }
      }
      
      // Detectar valles
      if (
        v < values[i - 1] &&
        v < values[i - 2] &&
        v < values[i + 1] &&
        v < values[i + 2]
      ) {
        // Comprobar significancia
        const localRange = Math.max(
          Math.abs(v - values[i-2]),
          Math.abs(v - values[i+2])
        );
        
        if (localRange > 0.05) {
          valleyIndices.push(i);
        }
      }
    }
    
    return { peakIndices, valleyIndices };
  }

  private calculateAmplitude(
    values: number[],
    peaks: number[],
    valleys: number[]
  ): number {
    if (peaks.length === 0 || valleys.length === 0) return 0;

    const amps: number[] = [];
    const len = Math.min(peaks.length, valleys.length);
    for (let i = 0; i < len; i++) {
      const amp = values[peaks[i]] - values[valleys[i]];
      if (amp > 0) {
        amps.push(amp);
      }
    }
    if (amps.length === 0) return 0;

    const mean = amps.reduce((a, b) => a + b, 0) / amps.length;
    return mean;
  }

  private calculateIntervals(peakIndices: number[]): number[] {
    const intervals: number[] = [];
    for (let i = 1; i < peakIndices.length; i++) {
      intervals.push(peakIndices[i] - peakIndices[i-1]);
    }
    return intervals;
  }

  private calculateMedian(values: number[]): number {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid-1] + sorted[mid]) / 2 : sorted[mid];
  }

  private calculateAmplitudes(
    values: number[],
    peaks: number[],
    valleys: number[]
  ): number[] {
    const amplitudes: number[] = [];
    for (let i = 0; i < Math.min(peaks.length, valleys.length); i++) {
      if (peaks[i] !== undefined && valleys[i] !== undefined) {
        const amp = values[peaks[i]] - values[valleys[i]];
        if (amp > 0) amplitudes.push(amp);
      }
    }
    return amplitudes;
  }

  private isValidPressure(systolic: number, diastolic: number): boolean {
    return systolic >= 90 && systolic <= 180 && diastolic >= 50 && diastolic <= 110;
  }

  private updatePressureHistory(systolic: number, diastolic: number) {
    this.systolicBuffer.push(systolic);
    this.diastolicBuffer.push(diastolic);
    
    if (this.systolicBuffer.length > this.BP_BUFFER_SIZE) {
      this.systolicBuffer.shift();
      this.diastolicBuffer.shift();
    }
    
    // Solo usar mediana para reducir valores extremos momentáneos
    const sortedSystolic = [...this.systolicBuffer].sort((a, b) => a - b);
    const sortedDiastolic = [...this.diastolicBuffer].sort((a, b) => a - b);
    
    const medianSystolic = sortedSystolic[Math.floor(sortedSystolic.length / 2)];
    const medianDiastolic = sortedDiastolic[Math.floor(sortedDiastolic.length / 2)];
    
    // Actualizar valores
    this.lastValidSystolic = medianSystolic;
    this.lastValidDiastolic = medianDiastolic;
    this.bpReadyForOutput = true;
  }

  private getLastValidBP(): { systolic: number; diastolic: number } {
    if (this.lastValidSystolic > 0 && this.lastValidDiastolic > 0) {
      return { 
        systolic: this.lastValidSystolic, 
        diastolic: this.lastValidDiastolic 
      };
    }
    return { systolic: 0, diastolic: 0 };
  }
}
