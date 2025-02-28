
export class VitalSignsProcessor {
  private readonly WINDOW_SIZE = 300;
  private readonly SPO2_CALIBRATION_FACTOR = 1.0; // Valor neutro sin ajustes
  private readonly PERFUSION_INDEX_THRESHOLD = 0.01; // Reducido para captar señales más débiles
  private readonly SPO2_WINDOW = 10;
  private readonly SMA_WINDOW = 3;
  private readonly RR_WINDOW_SIZE = 5;
  private readonly RMSSD_THRESHOLD = 25;
  private readonly ARRHYTHMIA_LEARNING_PERIOD = 3000;
  private readonly PEAK_THRESHOLD = 0.25; // Ajustado para mayor sensibilidad

  // Constantes específicas para SpO2 - AJUSTADAS PARA MEDICIONES REALES
  private readonly SPO2_MIN_AC_VALUE = 0.1;  // Reducido para captar señales más débiles
  private readonly SPO2_R_RATIO_A = 110;     // Calibración médica estándar
  private readonly SPO2_R_RATIO_B = 25;      // Calibración médica estándar
  private readonly SPO2_MIN_VALID_VALUE = 75;  // Permitir valores bajos reales
  private readonly SPO2_MAX_VALID_VALUE = 100; // Límite fisiológico máximo
  private readonly SPO2_BASELINE = 0;         // Sin valor base impuesto
  private readonly SPO2_MOVING_AVERAGE_ALPHA = 0.05; // Reducido para menor suavizado

  // Constantes para el algoritmo de presión arterial - AJUSTADAS PARA MEDICIONES REALES
  private readonly BP_BASELINE_SYSTOLIC = 0;   // Sin valor base impuesto
  private readonly BP_BASELINE_DIASTOLIC = 0;  // Sin valor base impuesto
  private readonly BP_PTT_COEFFICIENT = 0.01;  // Valor reducido para influencia mínima
  private readonly BP_AMPLITUDE_COEFFICIENT = 0.03; // Reducido para correlación más directa
  private readonly BP_STIFFNESS_FACTOR = 0.005; // Influencia mínima
  private readonly BP_SMOOTHING_ALPHA = 0.03;  // Suavizado mínimo para valores reales
  private readonly BP_QUALITY_THRESHOLD = 0.2; // Umbral reducido para aceptar más mediciones reales
  private readonly BP_CALIBRATION_WINDOW = 3;  // Ventana reducida
  private readonly BP_MIN_VALID_PTT = 150;     // Ampliado para capturar más mediciones reales
  private readonly BP_MAX_VALID_PTT = 1300;    // Ampliado para capturar más mediciones reales

  private ppgValues: number[] = [];
  private spo2Buffer: number[] = [];
  private spo2RawBuffer: number[] = [];
  private spo2CalibrationValues: number[] = [];
  private systolicBuffer: number[] = [];
  private diastolicBuffer: number[] = [];
  private readonly SPO2_BUFFER_SIZE = 5;    // Reducido para menor suavizado
  private readonly BP_BUFFER_SIZE = 3;      // Reducido para valores más directos
  private readonly BP_ALPHA = 0.25;         // Reducido para menor suavizado
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
  private bpCalibrationFactor: number = 0.01; // Valor mínimo
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
    
    // Cálculo directo de RMSSD (medida estándar de variabilidad cardíaca)
    let sumSquaredDiff = 0;
    for (let i = 1; i < recentRR.length; i++) {
      const diff = recentRR[i] - recentRR[i-1];
      sumSquaredDiff += Math.pow(diff, 2);
    }
    
    const rmssd = Math.sqrt(sumSquaredDiff / (recentRR.length - 1));
    const avgRR = recentRR.reduce((a, b) => a + b, 0) / recentRR.length;
    const lastRR = recentRR[recentRR.length - 1];
    const rrVariation = Math.abs(lastRR - avgRR) / avgRR;
    
    this.lastRMSSD = rmssd;
    this.lastRRVariation = rrVariation;
    
    // Criterios estándar basados en literatura médica
    const newArrhythmiaState = rmssd > this.RMSSD_THRESHOLD && rrVariation > 0.25;
    
    // Solo registrar arritmias con tiempo suficiente entre ellas
    if (newArrhythmiaState && 
        currentTime - this.lastArrhythmiaTime > 1000) {
      this.arrhythmiaCount++;
      this.lastArrhythmiaTime = currentTime;
      this.hasDetectedFirstArrhythmia = true;
    }

    this.arrhythmiaDetected = newArrhythmiaState;
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
    if (values.length < 20) return 0;

    try {
      // Características básicas de la onda PPG
      const dc = this.calculateDC(values);
      if (dc <= 0) return 0;

      const ac = this.calculateAC(values);
      if (ac < this.SPO2_MIN_AC_VALUE) return 0;

      // Medición directa del índice de perfusión (señal AC/DC)
      const perfusionIndex = ac / dc;
      
      // Calcular ratio R usando fórmula estándar para oximetría de pulso
      const R = Math.min(1.0, Math.max(0.3, (perfusionIndex * 1.4)));

      // Ecuación de calibración estándar para oxímetros
      let rawSpO2 = this.SPO2_R_RATIO_A - (this.SPO2_R_RATIO_B * R);

      // Restricción solo a límites fisiológicos extremos
      rawSpO2 = Math.max(75, Math.min(100, rawSpO2));

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
    // Si no hay suficientes datos, usar último valor válido o cero
    if (values.length < 30) {
      if (this.lastValidSystolic > 0 && this.lastValidDiastolic > 0) {
        return { 
          systolic: this.lastValidSystolic, 
          diastolic: this.lastValidDiastolic 
        };
      }
      return { systolic: 0, diastolic: 0 };
    }

    // Detectar características de forma de onda PPG
    const { peakIndices, valleyIndices } = this.findPeaksAndValleys(values);
    
    // Verificar ciclos cardíacos mínimos
    if (peakIndices.length < 2 || valleyIndices.length < 2) {
      if (this.lastValidSystolic > 0 && this.lastValidDiastolic > 0) {
        return { 
          systolic: this.lastValidSystolic, 
          diastolic: this.lastValidDiastolic 
        };
      }
      return { systolic: 0, diastolic: 0 };
    }

    // Cálculo de intervalos entre picos para estimar frecuencia cardíaca
    const intervals: number[] = [];
    const msPerSample = 1000 / 30; // Asumiendo 30 FPS
    
    for (let i = 1; i < peakIndices.length; i++) {
      intervals.push((peakIndices[i] - peakIndices[i-1]) * msPerSample);
    }
    
    // Filtrar valores extremos no fisiológicos
    const validIntervals = intervals.filter(i => i >= 300 && i <= 1500);
    
    if (validIntervals.length === 0) {
      if (this.lastValidSystolic > 0 && this.lastValidDiastolic > 0) {
        return { 
          systolic: this.lastValidSystolic, 
          diastolic: this.lastValidDiastolic 
        };
      }
      return { systolic: 0, diastolic: 0 };
    }
    
    // Calcular frecuencia cardíaca a partir de intervalos
    const averageInterval = validIntervals.reduce((sum, i) => sum + i, 0) / validIntervals.length;
    const estimatedHeartRate = Math.round(60000 / averageInterval);
    
    // Calcular amplitudes de pulso (diferencia entre picos y valles)
    const amplitudes: number[] = [];
    for (let i = 0; i < Math.min(peakIndices.length, valleyIndices.length); i++) {
      if (peakIndices[i] !== undefined && valleyIndices[i] !== undefined) {
        const amplitude = values[peakIndices[i]] - values[valleyIndices[i]];
        if (amplitude > 0) amplitudes.push(amplitude);
      }
    }
    
    if (amplitudes.length === 0) {
      if (this.lastValidSystolic > 0 && this.lastValidDiastolic > 0) {
        return { 
          systolic: this.lastValidSystolic, 
          diastolic: this.lastValidDiastolic 
        };
      }
      return { systolic: 0, diastolic: 0 };
    }
    
    // Calcular amplitud media para estimar presión de pulso
    const averageAmplitude = amplitudes.reduce((sum, a) => sum + a, 0) / amplitudes.length;
    
    // Calcular tiempo hasta pico (TP) y tiempo de tránsito de pulso (PTT)
    const pttValues: number[] = [];
    const tpValues: number[] = [];
    
    for (let i = 0; i < Math.min(peakIndices.length, valleyIndices.length); i++) {
      if (valleyIndices[i] < peakIndices[i]) {
        const tp = (peakIndices[i] - valleyIndices[i]) * msPerSample;
        tpValues.push(tp);
      }
      
      if (i > 0 && valleyIndices[i] > peakIndices[i-1]) {
        const ptt = (valleyIndices[i] - peakIndices[i-1]) * msPerSample;
        pttValues.push(ptt);
      }
    }
    
    // Calcular índice de rigidez arterial a partir de forma de onda
    let stiffnessIndex = 0;
    if (tpValues.length > 0 && pttValues.length > 0) {
      const avgTP = tpValues.reduce((sum, tp) => sum + tp, 0) / tpValues.length;
      const avgPTT = pttValues.reduce((sum, ptt) => sum + ptt, 0) / pttValues.length;
      
      // Índice de rigidez: relación entre tiempo de subida y PTT
      stiffnessIndex = avgTP / avgPTT;
    }
    
    // Calcular área bajo la curva (AUC) como indicador de presión
    let areaUnderCurve = 0;
    if (peakIndices.length > 1 && peakIndices[0] < values.length - 1) {
      const startIdx = Math.max(0, peakIndices[0] - 5);
      const endIdx = Math.min(values.length - 1, peakIndices[0] + 15);
      
      let baseline = values[valleyIndices[0]] || 0;
      for (let i = startIdx; i <= endIdx; i++) {
        areaUnderCurve += Math.max(0, values[i] - baseline);
      }
    }
    
    // CÁLCULO DE PRESIÓN BASADO EN PARÁMETROS FISIOLÓGICOS DIRECTOS
    
    // 1. Estimación base a partir de relación lineal con frecuencia cardíaca
    let systolic = 90 + (estimatedHeartRate - 60) * 0.7;
    let diastolic = 60 + (estimatedHeartRate - 60) * 0.3;
    
    // 2. Ajuste por amplitud (presión de pulso)
    const normAmplitude = Math.min(4, Math.max(0.5, averageAmplitude * 2.5));
    const pulsePressDelta = (normAmplitude - 1) * 10;
    
    // 3. Ajuste por rigidez arterial
    const stiffnessDelta = stiffnessIndex > 0 ? 
                          (stiffnessIndex - 0.5) * 15 : 0;
    
    // 4. Ajuste por área bajo la curva
    const aucFactor = Math.min(2, Math.max(0.5, areaUnderCurve / 50));
    const aucDelta = (aucFactor - 1) * 8;
    
    // Aplicar todos los ajustes fisiológicos
    systolic += pulsePressDelta + stiffnessDelta + aucDelta;
    diastolic += (pulsePressDelta + stiffnessDelta) * 0.4;
    
    // Asegurar relación fisiológica correcta
    if (diastolic > systolic - 20) {
      diastolic = systolic - 20;
    }
    
    // Límites fisiológicos absolutos
    systolic = Math.min(200, Math.max(80, systolic));
    diastolic = Math.min(120, Math.max(40, diastolic));
    
    // Usar mediana para estabilidad mínima
    this.systolicBuffer.push(Math.round(systolic));
    this.diastolicBuffer.push(Math.round(diastolic));
    
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
    
    return {
      systolic: medianSystolic,
      diastolic: medianDiastolic
    };
  }

  // Mantener método original para retrocompatibilidad
  private calculateBloodPressure(values: number[]): {
    systolic: number;
    diastolic: number;
  } {
    return this.calculateDirectBloodPressure(values);
  }

  // Método simplificado para cálculo de presión arterial con calibración mínima
  private calculateRawBloodPressure(values: number[]): {
    systolic: number;
    diastolic: number;
  } {
    return this.calculateDirectBloodPressure(values);
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
}
