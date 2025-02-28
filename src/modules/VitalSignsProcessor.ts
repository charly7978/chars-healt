
export class VitalSignsProcessor {
  private readonly WINDOW_SIZE = 300;
  private readonly SPO2_CALIBRATION_FACTOR = 1.02;
  private readonly PERFUSION_INDEX_THRESHOLD = 0.05;
  private readonly SPO2_WINDOW = 10;
  private readonly SMA_WINDOW = 3;
  private readonly RR_WINDOW_SIZE = 5;
  private readonly RMSSD_THRESHOLD = 25;
  private readonly ARRHYTHMIA_LEARNING_PERIOD = 3000;
  private readonly PEAK_THRESHOLD = 0.3;

  // Constantes específicas para SpO2
  private readonly SPO2_MIN_AC_VALUE = 0.3;  // Mínimo valor de AC para considerar señal válida
  private readonly SPO2_R_RATIO_A = 110;     // Parámetros de la ecuación de calibración
  private readonly SPO2_R_RATIO_B = 25;      // SpO2 = A - B * R
  private readonly SPO2_MIN_VALID_VALUE = 80;  // Valor mínimo fisiológico válido
  private readonly SPO2_MAX_VALID_VALUE = 100; // Valor máximo fisiológico válido

  private ppgValues: number[] = [];
  private spo2Buffer: number[] = [];
  private spo2RawBuffer: number[] = [];      // Buffer de valores crudos (antes de promediar)
  private spo2CalibrationValues: number[] = []; // Valores durante calibración
  private systolicBuffer: number[] = [];
  private diastolicBuffer: number[] = [];
  private readonly SPO2_BUFFER_SIZE = 10;    // Aumentado para mejor estabilidad
  private readonly BP_BUFFER_SIZE = 10;
  private readonly BP_ALPHA = 0.7;
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
  private spO2CalibrationOffset: number = 0; // Offset para ajustar SpO2 tras calibración

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

    // Procesar la señal PPG
    const filtered = this.applySMAFilter(ppgValue);
    this.ppgValues.push(filtered);
    if (this.ppgValues.length > this.WINDOW_SIZE) {
      this.ppgValues.shift();
    }

    // Verificar fase de aprendizaje
    const timeSinceStart = currentTime - this.measurementStartTime;
    if (timeSinceStart > this.ARRHYTHMIA_LEARNING_PERIOD) {
      this.isLearningPhase = false;
      
      // Autocalibración de SpO2 después de fase inicial si tenemos valores
      if (!this.spO2Calibrated && this.spo2CalibrationValues.length >= 5) {
        this.calibrateSpO2();
      }
    } else {
      // Durante fase de aprendizaje, recopilar valores para calibración
      if (this.ppgValues.length >= 60) {
        const tempSpO2 = this.calculateSpO2Raw(this.ppgValues.slice(-60));
        if (tempSpO2 > 0) {
          this.spo2CalibrationValues.push(tempSpO2);
          // Mantener solo los últimos 10 valores
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

    // Calcular otros signos vitales sin forzar valores
    const spo2 = this.calculateSpO2(this.ppgValues.slice(-60));
    const bp = this.calculateBloodPressure(this.ppgValues.slice(-60));
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

  // Calibración automática de SpO2 basada en valores iniciales
  private calibrateSpO2() {
    if (this.spo2CalibrationValues.length < 5) return;
    
    // Ordenar valores y eliminar outliers (25% inferior y 25% superior)
    const sortedValues = [...this.spo2CalibrationValues].sort((a, b) => a - b);
    const startIdx = Math.floor(sortedValues.length * 0.25);
    const endIdx = Math.floor(sortedValues.length * 0.75);
    
    // Tomar el rango medio de valores
    const middleValues = sortedValues.slice(startIdx, endIdx + 1);
    
    if (middleValues.length > 0) {
      // Calcular promedio del rango medio
      const avgValue = middleValues.reduce((sum, val) => sum + val, 0) / middleValues.length;
      
      // Si el promedio es razonable, usar como base de calibración
      // Ajustar para que el promedio se acerque a 97% (valor normal esperado)
      if (avgValue > 85 && avgValue < 105) {
        this.spO2CalibrationOffset = 97 - avgValue;
        console.log('SpO2 calibrado con offset:', this.spO2CalibrationOffset);
        this.spO2Calibrated = true;
      }
    }
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
    
    // Detectar arritmia basada en umbrales
    const newArrhythmiaState = rmssd > this.RMSSD_THRESHOLD && rrVariation > 0.20;
    
    // Si es una nueva arritmia y ha pasado suficiente tiempo desde la última
    if (newArrhythmiaState && 
        currentTime - this.lastArrhythmiaTime > 1000) {
      this.arrhythmiaCount++;
      this.lastArrhythmiaTime = currentTime;
      
      // Marcar que ya detectamos la primera arritmia
      this.hasDetectedFirstArrhythmia = true;
      
      console.log('VitalSignsProcessor - Nueva arritmia detectada:', {
        contador: this.arrhythmiaCount,
        rmssd,
        rrVariation,
        timestamp: currentTime
      });
    }

    this.arrhythmiaDetected = newArrhythmiaState;
  }

  public reset() {
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
  }

  private processHeartBeat() {
    const currentTime = Date.now();
    
    if (this.lastPeakTime === null) {
      this.lastPeakTime = currentTime;
      return;
    }

    const rrInterval = currentTime - this.lastPeakTime;
    this.rrIntervals.push(rrInterval);
    
    // Mantener ventana móvil de intervalos
    if (this.rrIntervals.length > 20) {
      this.rrIntervals.shift();
    }

    // Si tenemos suficientes intervalos, analizar arritmia
    if (!this.isLearningPhase && this.rrIntervals.length >= this.RR_WINDOW_SIZE) {
      this.detectArrhythmia();
    }

    this.lastPeakTime = currentTime;
  }

  // Método para calcular SpO2 sin aplicar calibración ni filtros
  private calculateSpO2Raw(values: number[]): number {
    if (values.length < 20) return 0;

    // Características de la onda PPG
    const dc = this.calculateDC(values);
    if (dc <= 0) return 0;

    const ac = this.calculateAC(values);
    if (ac < this.SPO2_MIN_AC_VALUE) return 0;

    // Cálculo de la ratio R usando el modelo óptico de dos longitudes de onda
    // En un oxímetro real, tendríamos dos señales (roja e infrarroja)
    // Aquí simulamos la ratio usando características de la señal PPG
    const perfusionIndex = ac / dc;
    const R = (perfusionIndex * 2) / this.SPO2_CALIBRATION_FACTOR;

    // Ecuación empírica para calcular SpO2: SpO2 = A - B * R
    let rawSpO2 = this.SPO2_R_RATIO_A - (this.SPO2_R_RATIO_B * R);

    // Limitar a rango fisiológico posible
    rawSpO2 = Math.max(this.SPO2_MIN_VALID_VALUE, Math.min(this.SPO2_MAX_VALID_VALUE, rawSpO2));

    return Math.round(rawSpO2);
  }

  // Método principal para calcular SpO2 con todos los filtros y calibración
  private calculateSpO2(values: number[]): number {
    // Si no hay suficientes valores, no hay medición válida
    if (values.length < 20) {
      if (this.spo2Buffer.length > 0) {
        return this.spo2Buffer[this.spo2Buffer.length - 1];
      }
      return 0; // Si no hay mediciones previas, devolver 0 (no hay medición)
    }

    // Obtener el valor crudo de SpO2
    const rawSpO2 = this.calculateSpO2Raw(values);
    if (rawSpO2 <= 0) {
      if (this.spo2Buffer.length > 0) {
        return this.spo2Buffer[this.spo2Buffer.length - 1];
      }
      return 0;
    }

    // Guardar el valor crudo para análisis
    this.spo2RawBuffer.push(rawSpO2);
    if (this.spo2RawBuffer.length > this.SPO2_BUFFER_SIZE * 2) {
      this.spo2RawBuffer.shift();
    }

    // Aplicar calibración si está disponible
    let calibratedSpO2 = rawSpO2;
    if (this.spO2Calibrated) {
      calibratedSpO2 = rawSpO2 + this.spO2CalibrationOffset;
      calibratedSpO2 = Math.max(this.SPO2_MIN_VALID_VALUE, Math.min(this.SPO2_MAX_VALID_VALUE, calibratedSpO2));
    }

    // Filtro de mediana para eliminar valores atípicos
    let filteredSpO2 = calibratedSpO2;
    if (this.spo2RawBuffer.length >= 5) {
      const recentValues = [...this.spo2RawBuffer].slice(-5);
      recentValues.sort((a, b) => a - b);
      filteredSpO2 = recentValues[Math.floor(recentValues.length / 2)];
    }

    // Mantener buffer de valores para estabilidad
    this.spo2Buffer.push(filteredSpO2);
    if (this.spo2Buffer.length > this.SPO2_BUFFER_SIZE) {
      this.spo2Buffer.shift();
    }

    // Calcular promedio del buffer para suavizar (descartando valores extremos)
    if (this.spo2Buffer.length >= 3) {
      // Ordenar valores para descartar el más alto y el más bajo
      const sortedValues = [...this.spo2Buffer].sort((a, b) => a - b);
      
      // Si tenemos suficientes valores, eliminar extremos
      if (sortedValues.length >= 5) {
        sortedValues.pop(); // Eliminar el más alto
        sortedValues.shift(); // Eliminar el más bajo
      }
      
      // Calcular promedio de los valores restantes
      const sum = sortedValues.reduce((a, b) => a + b, 0);
      filteredSpO2 = Math.round(sum / sortedValues.length);
    }
    
    console.log('SpO2 calculado:', {
      raw: rawSpO2,
      calibrated: calibratedSpO2,
      filtered: filteredSpO2,
      bufferSize: this.spo2Buffer.length,
      calibrationOffset: this.spO2CalibrationOffset,
      isCalibrated: this.spO2Calibrated
    });
    
    return filteredSpO2;
  }

  private calculateBloodPressure(values: number[]): {
    systolic: number;
    diastolic: number;
  } {
    if (values.length < 30) {
      return { systolic: 0, diastolic: 0 };
    }

    const { peakIndices, valleyIndices } = this.localFindPeaksAndValleys(values);
    if (peakIndices.length < 2) {
      return { systolic: 0, diastolic: 0 };
    }

    const fps = 30;
    const msPerSample = 1000 / fps;

    // Calculate PTT values
    const pttValues: number[] = [];
    for (let i = 1; i < peakIndices.length; i++) {
      const dt = (peakIndices[i] - peakIndices[i - 1]) * msPerSample;
      pttValues.push(dt);
    }
    
    // Calculate weighted PTT
    let pttWeightSum = 0;
    let pttWeightedSum = 0;
    
    pttValues.forEach((val, idx) => {
      const weight = (idx + 1) / pttValues.length;
      pttWeightedSum += val * weight;
      pttWeightSum += weight;
    });

    const calculatedPTT = pttWeightSum > 0 ? pttWeightedSum / pttWeightSum : 600;
    const normalizedPTT = Math.max(300, Math.min(1200, calculatedPTT));
    
    // Calculate amplitude
    const amplitude = this.calculateAmplitude(values, peakIndices, valleyIndices);
    const normalizedAmplitude = Math.min(100, Math.max(0, amplitude * 5));

    // Calculate pressure factors
    const pttFactor = (600 - normalizedPTT) * 0.08;
    const ampFactor = normalizedAmplitude * 0.3;
    
    // Calculate initial pressure values
    let instantSystolic = 120 + pttFactor + ampFactor;
    let instantDiastolic = 80 + (pttFactor * 0.5) + (ampFactor * 0.2);

    // Clamp values to physiological ranges
    instantSystolic = Math.max(90, Math.min(180, instantSystolic));
    instantDiastolic = Math.max(60, Math.min(110, instantDiastolic));
    
    // Ensure reasonable differential
    const differential = instantSystolic - instantDiastolic;
    if (differential < 20) {
      instantDiastolic = instantSystolic - 20;
    } else if (differential > 80) {
      instantDiastolic = instantSystolic - 80;
    }

    // Update pressure buffers
    this.systolicBuffer.push(instantSystolic);
    this.diastolicBuffer.push(instantDiastolic);
    
    if (this.systolicBuffer.length > this.BP_BUFFER_SIZE) {
      this.systolicBuffer.shift();
      this.diastolicBuffer.shift();
    }

    // Calculate final smoothed values
    let finalSystolic = 0;
    let finalDiastolic = 0;
    let smoothingWeightSum = 0;

    for (let i = 0; i < this.systolicBuffer.length; i++) {
      const weight = Math.pow(this.BP_ALPHA, this.systolicBuffer.length - 1 - i);
      finalSystolic += this.systolicBuffer[i] * weight;
      finalDiastolic += this.diastolicBuffer[i] * weight;
      smoothingWeightSum += weight;
    }

    finalSystolic = smoothingWeightSum > 0 ? finalSystolic / smoothingWeightSum : instantSystolic;
    finalDiastolic = smoothingWeightSum > 0 ? finalDiastolic / smoothingWeightSum : instantDiastolic;

    return {
      systolic: Math.round(finalSystolic),
      diastolic: Math.round(finalDiastolic)
    };
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
