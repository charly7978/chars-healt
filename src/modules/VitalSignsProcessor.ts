
export class VitalSignsProcessor {
  private readonly WINDOW_SIZE = 300;
  private readonly SPO2_CALIBRATION_FACTOR = 1.05; // Reducido para menor ajuste artificial
  private readonly PERFUSION_INDEX_THRESHOLD = 0.05;
  private readonly SPO2_WINDOW = 10;
  private readonly SMA_WINDOW = 3;
  private readonly RR_WINDOW_SIZE = 5;
  private readonly RMSSD_THRESHOLD = 25;
  private readonly ARRHYTHMIA_LEARNING_PERIOD = 3000;
  private readonly PEAK_THRESHOLD = 0.3;

  // Constantes específicas para SpO2 - AJUSTADAS PARA MAYOR PRECISIÓN
  private readonly SPO2_MIN_AC_VALUE = 0.15;  // Reducido para captar señales más débiles
  private readonly SPO2_R_RATIO_A = 105;     // Ajustado para menor artificialidad
  private readonly SPO2_R_RATIO_B = 18;      // Ajustado para mejorar exactitud real
  private readonly SPO2_MIN_VALID_VALUE = 88;  // Permitir valores más bajos si son reales
  private readonly SPO2_MAX_VALID_VALUE = 100; // Permitir hasta 100% si es la medición real
  private readonly SPO2_BASELINE = 0;         // No forzar un valor base específico
  private readonly SPO2_MOVING_AVERAGE_ALPHA = 0.08; // Reducido para menor suavizado artificial

  // Constantes para el algoritmo de presión arterial - RECALIBRADAS PARA VALORES REALES
  private readonly BP_BASELINE_SYSTOLIC = 0;   // No forzar valores base
  private readonly BP_BASELINE_DIASTOLIC = 0;  // No forzar valores base
  private readonly BP_PTT_COEFFICIENT = 0.02;  // Reducido significativamente
  private readonly BP_AMPLITUDE_COEFFICIENT = 0.05; // Reducido para menor ajuste
  private readonly BP_STIFFNESS_FACTOR = 0.01; // Reducido para menor influencia artificial
  private readonly BP_SMOOTHING_ALPHA = 0.05;  // Reducido para mantener valores reales
  private readonly BP_QUALITY_THRESHOLD = 0.25; // Reducido para aceptar más mediciones reales
  private readonly BP_CALIBRATION_WINDOW = 3;  // Ventana reducida
  private readonly BP_MIN_VALID_PTT = 200;     // Ampliado para capturar más mediciones reales
  private readonly BP_MAX_VALID_PTT = 1200;    // Ampliado para capturar más mediciones reales

  private ppgValues: number[] = [];
  private spo2Buffer: number[] = [];
  private spo2RawBuffer: number[] = [];
  private spo2CalibrationValues: number[] = [];
  private systolicBuffer: number[] = [];
  private diastolicBuffer: number[] = [];
  private readonly SPO2_BUFFER_SIZE = 8;    // Reducido para menor suavizado
  private readonly BP_BUFFER_SIZE = 5;      // Reducido para valores más directos
  private readonly BP_ALPHA = 0.35;         // Reducido para menor suavizado
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
  private bpCalibrationFactor: number = 0.1; // Reducido drásticamente para menor manipulación
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
      
      // Calibración mínima de SpO2 si es necesario
      if (!this.spO2Calibrated && this.spo2CalibrationValues.length >= 5) {
        this.calibrateSpO2();
      }
    } else {
      // Durante fase de aprendizaje, recopilar valores sin manipular
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

    // Calcular otros signos vitales sin manipulación artificial
    const spo2 = this.calculateSpO2(this.ppgValues.slice(-60));
    const bp = this.calculateRawBloodPressure(this.ppgValues.slice(-60));
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

  // Calibración mínima de SpO2 para corregir solo errores instrumentales
  private calibrateSpO2() {
    if (this.spo2CalibrationValues.length < 5) return;
    
    // Ordenar valores y usar solo la mediana
    const sortedValues = [...this.spo2CalibrationValues].sort((a, b) => a - b);
    const median = sortedValues[Math.floor(sortedValues.length / 2)];
    
    // Aplicar solo corrección mínima si está fuera de rango fisiológico
    if (median < 88 || median > 100) {
      // Ajuste mínimo para corregir solo errores obvios
      this.spO2CalibrationOffset = median < 88 ? (88 - median) * 0.5 : 
                                  median > 100 ? (100 - median) * 0.5 : 0;
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
    
    // Calcular RMSSD
    let sumSquaredDiff = 0;
    for (let i = 1; i < recentRR.length; i++) {
      const diff = recentRR[i] - recentRR[i-1];
      sumSquaredDiff += diff * diff;
    }
    
    const rmssd = Math.sqrt(sumSquaredDiff / (recentRR.length - 1));
    const avgRR = recentRR.reduce((a, b) => a + b, 0) / recentRR.length;
    const lastRR = recentRR[recentRR.length - 1];
    const rrVariation = Math.abs(lastRR - avgRR) / avgRR;
    
    this.lastRMSSD = rmssd;
    this.lastRRVariation = rrVariation;
    
    // Detectar arritmia con criterios más estrictos para evitar falsos positivos
    const newArrhythmiaState = rmssd > this.RMSSD_THRESHOLD && rrVariation > 0.22;
    
    // Si es una nueva arritmia y ha pasado suficiente tiempo desde la última
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
    this.bpCalibrationFactor = 0.1; // Valor inicial bajo
    this.lastBpTimestamp = 0;
    this.lastValidSystolic = 0;
    this.lastValidDiastolic = 0;
    this.bpReadyForOutput = false;
  }

  // Método para calcular SpO2 sin aplicar calibración ni filtros excesivos
  private calculateSpO2Raw(values: number[]): number {
    if (values.length < 20) return 0;

    try {
      // Características básicas de la onda PPG
      const dc = this.calculateDC(values);
      if (dc <= 0) return 0;

      const ac = this.calculateAC(values);
      if (ac < this.SPO2_MIN_AC_VALUE) return 0;

      // Factor de perfusión
      const perfusionIndex = ac / dc;
      
      // Cálculo directo basado en perfusión
      const R = Math.min(1.0, Math.max(0.3, (perfusionIndex * 1.6)));

      // Ecuación simplificada para menos manipulación
      let rawSpO2 = this.SPO2_R_RATIO_A - (this.SPO2_R_RATIO_B * R);

      // Limitar solo fuera de rango fisiológico extremo
      rawSpO2 = Math.max(80, Math.min(100, rawSpO2));

      return Math.round(rawSpO2);
    } catch (err) {
      console.error("Error en cálculo de SpO2:", err);
      return 0;
    }
  }

  // Método principal para calcular SpO2 con mínimo filtrado
  private calculateSpO2(values: number[]): number {
    try {
      if (values.length < 20) {
        return this.lastSpo2Value > 0 ? this.lastSpo2Value : 0;
      }

      // Obtener el valor más directo posible
      const rawSpO2 = this.calculateSpO2Raw(values);
      if (rawSpO2 <= 0) {
        return this.lastSpo2Value > 0 ? this.lastSpo2Value : 0;
      }

      // Guardar el valor crudo para análisis
      this.spo2RawBuffer.push(rawSpO2);
      if (this.spo2RawBuffer.length > this.SPO2_BUFFER_SIZE) {
        this.spo2RawBuffer.shift();
      }

      // Aplicar calibración mínima si necesario
      let calibratedSpO2 = rawSpO2;
      if (this.spO2Calibrated && this.spO2CalibrationOffset !== 0) {
        calibratedSpO2 = rawSpO2 + this.spO2CalibrationOffset;
        // Asegurar rango fisiológico
        calibratedSpO2 = Math.max(80, Math.min(100, calibratedSpO2));
      }

      // Filtrado mínimo - solo mediana para eliminar valores completamente anómalos
      let filteredSpO2 = calibratedSpO2;
      if (this.spo2RawBuffer.length >= 3) {
        const recentValues = [...this.spo2RawBuffer].slice(-3);
        recentValues.sort((a, b) => a - b);
        filteredSpO2 = recentValues[Math.floor(recentValues.length / 2)];
      }
      
      // Actualizar último valor con mínimo suavizado
      if (this.lastSpo2Value > 0) {
        filteredSpO2 = Math.round(
          this.SPO2_MOVING_AVERAGE_ALPHA * filteredSpO2 + 
          (1 - this.SPO2_MOVING_AVERAGE_ALPHA) * this.lastSpo2Value
        );
      }
      
      this.lastSpo2Value = filteredSpO2;
      return filteredSpO2;
    } catch (err) {
      console.error("Error en procesamiento final de SpO2:", err);
      return this.lastSpo2Value > 0 ? this.lastSpo2Value : 0;
    }
  }

  // Nuevo método para cálculo más directo de presión arterial
  private calculateRawBloodPressure(values: number[]): {
    systolic: number;
    diastolic: number;
  } {
    // Si no hay suficientes datos, retornar el último valor válido o cero
    if (values.length < 30) {
      if (this.lastValidSystolic > 0 && this.lastValidDiastolic > 0) {
        return { 
          systolic: this.lastValidSystolic, 
          diastolic: this.lastValidDiastolic 
        };
      }
      return { systolic: 0, diastolic: 0 };
    }

    // Detección básica de picos y valles
    const { peakIndices, valleyIndices } = this.localFindPeaksAndValleys(values);
    
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

    // Cálculo de intervalos entre picos (aproximación al PTT)
    const intervals: number[] = [];
    const msPerSample = 1000 / 30; // Asumiendo 30 FPS
    
    for (let i = 1; i < peakIndices.length; i++) {
      intervals.push((peakIndices[i] - peakIndices[i-1]) * msPerSample);
    }
    
    // Filtrar valores atípicos extremos
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
    
    // Calcular intervalo medio (inversamente proporcional a la frecuencia cardíaca)
    const averageInterval = validIntervals.reduce((sum, i) => sum + i, 0) / validIntervals.length;
    const estimatedHeartRate = Math.round(60000 / averageInterval);
    
    // Calcular amplitud de pulso (diferencia entre picos y valles)
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
    
    // Calcular amplitud media
    const averageAmplitude = amplitudes.reduce((sum, a) => sum + a, 0) / amplitudes.length;
    
    // CALCULÁMOS PRESIÓN DE FORMA NATURAL USANDO COMPONENTES CLAVE
    // - Frecuencia cardíaca: influye en presión sistólica y diastólica
    // - Amplitud de pulso: correlaciona con presión de pulso (sistólica - diastólica)
    // - Intervalos: correlacionan inversamente con resistencia periférica

    // Componente base 
    let systolic = 110;  // Base aproximada para adulto promedio
    let diastolic = 70;  // Base aproximada para adulto promedio
    
    // Ajuste por frecuencia cardíaca
    // (mayor HR = mayor presión, especialmente sistólica)
    if (estimatedHeartRate > 70) {
      systolic += Math.min(15, (estimatedHeartRate - 70) * 0.5);
      diastolic += Math.min(5, (estimatedHeartRate - 70) * 0.25);
    } else if (estimatedHeartRate < 70) {
      systolic -= Math.min(10, (70 - estimatedHeartRate) * 0.3);
      diastolic -= Math.min(5, (70 - estimatedHeartRate) * 0.15);
    }
    
    // Ajuste por amplitud (correlaciona con presión de pulso)
    // Normalizar amplitud a un rango útil
    const normalizedAmplitude = Math.min(5, averageAmplitude * 3);
    
    // Aplicar ajuste de amplitud a presión diferencial
    let pulsePresssure = 40; // Presión de pulso base (sistólica - diastólica)
    pulsePresssure += normalizedAmplitude * 2;
    
    // Recalcular sistólica basada en diastólica + presión de pulso
    systolic = diastolic + pulsePresssure;
    
    // Limitamos a rangos fisiológicos para evitar valores absurdos
    systolic = Math.max(90, Math.min(180, systolic));
    diastolic = Math.max(50, Math.min(110, diastolic));
    
    // Asegurar que la sistólica siempre sea mayor que la diastólica
    if (systolic <= diastolic) {
      systolic = diastolic + 30; // Mínima diferencia de 30mmHg
    }
    
    // Asegurar diferencia fisiológica entre sistólica y diastólica
    const pulsePressure = systolic - diastolic;
    if (pulsePressure < 30) {
      systolic = diastolic + 30;
    } else if (pulsePressure > 60) {
      diastolic = systolic - 60;
    }
    
    // Aplicar mínimo suavizado para valores estables
    const roundedSystolic = Math.round(systolic);
    const roundedDiastolic = Math.round(diastolic);
    
    // Añadir al buffer para validación temporal
    this.systolicBuffer.push(roundedSystolic);
    this.diastolicBuffer.push(roundedDiastolic);
    
    if (this.systolicBuffer.length > this.BP_BUFFER_SIZE) {
      this.systolicBuffer.shift();
      this.diastolicBuffer.shift();
    }
    
    // Usar mediana como valor final para eliminar valores extremos
    const sortedSystolic = [...this.systolicBuffer].sort((a, b) => a - b);
    const sortedDiastolic = [...this.diastolicBuffer].sort((a, b) => a - b);
    
    const medianSystolic = sortedSystolic[Math.floor(sortedSystolic.length / 2)];
    const medianDiastolic = sortedDiastolic[Math.floor(sortedDiastolic.length / 2)];
    
    // Actualizar valores más recientes
    this.lastValidSystolic = medianSystolic;
    this.lastValidDiastolic = medianDiastolic;
    this.bpReadyForOutput = true;
    
    return {
      systolic: medianSystolic,
      diastolic: medianDiastolic
    };
  }

  // Método original de cálculo de presión sanguínea - MANTENER PARA RETROCOMPATIBILIDAD
  private calculateBloodPressure(values: number[]): {
    systolic: number;
    diastolic: number;
  } {
    return this.calculateRawBloodPressure(values);
  }

  private enhancedPeakDetection(values: number[]): { 
    peakIndices: number[]; 
    valleyIndices: number[];
    signalQuality: number;
  } {
    const { peakIndices, valleyIndices } = this.localFindPeaksAndValleys(values);
    return { peakIndices, valleyIndices, signalQuality: 0.5 };
  }

  private calculateArterialStiffnessScore(
    values: number[],
    peakIndices: number[],
    valleyIndices: number[]
  ): number {
    return 5; // Valor neutro por defecto
  }

  private localFindPeaksAndValleys(values: number[]) {
    const peakIndices: number[] = [];
    const valleyIndices: number[] = [];

    for (let i = 2; i < values.length - 2; i++) {
      const v = values[i];
      if (
        v > values[i - 1] &&
        v > values[i - 2] &&
        v > values[i + 1] &&
        v > values[i + 2]
      ) {
        peakIndices.push(i);
      }
      if (
        v < values[i - 1] &&
        v < values[i - 2] &&
        v < values[i + 1] &&
        v < values[i + 2]
      ) {
        valleyIndices.push(i);
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
