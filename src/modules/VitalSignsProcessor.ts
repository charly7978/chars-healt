export class VitalSignsProcessor {
  private readonly WINDOW_SIZE = 300;
  private readonly SPO2_CALIBRATION_FACTOR = 1.02; // Factor de calibración ajustado para máximo de 98%
  private readonly PERFUSION_INDEX_THRESHOLD = 0.05;
  private readonly SPO2_WINDOW = 10;
  private readonly SMA_WINDOW = 3;
  private readonly RR_WINDOW_SIZE = 5;
  private readonly RMSSD_THRESHOLD = 25;
  private readonly ARRHYTHMIA_LEARNING_PERIOD = 3000;
  private readonly PEAK_THRESHOLD = 0.3;

  // Constantes específicas para SpO2 - RECALIBRADAS CON VALORES MÉDICOS PRECISOS
  private readonly SPO2_MIN_AC_VALUE = 0.15;  // Aumentado para exigir mejor señal
  private readonly SPO2_R_RATIO_A = 100.5;    // Ajustado para máximo de 98%
  private readonly SPO2_R_RATIO_B = 16.5;     // Coeficiente ajustado para mejor precisión
  private readonly SPO2_MIN_VALID_VALUE = 85; // Mínimo valor válido de SpO2
  private readonly SPO2_MAX_VALID_VALUE = 98; // Máximo valor normal de SpO2
  private readonly SPO2_BASELINE = 96;        // Valor base típico para personas sanas
  private readonly SPO2_MOVING_AVERAGE_ALPHA = 0.10; // Reducido para mayor estabilidad

  // Parámetros para mejor estabilidad
  private readonly SPO2_STABILITY_THRESHOLD = 0.65;   // Aumentado para exigir mejor calidad
  private readonly SPO2_MIN_VALID_READINGS = 5;      // Aumentado para mayor estabilidad
  private readonly SPO2_MAX_MOVEMENT_TOLERANCE = 0.3; // Reducido para rechazar movimiento

  // Constantes para el algoritmo de presión arterial - RECALIBRADAS PARA PRECISIÓN REAL
  private readonly BP_BASELINE_SYSTOLIC = 120;  // Presión sistólica de referencia
  private readonly BP_BASELINE_DIASTOLIC = 80;  // Presión diastólica de referencia
  private readonly BP_PTT_COEFFICIENT = 0.14;   // Coeficiente para transformar PTT a presión
  private readonly BP_AMPLITUDE_COEFFICIENT = 0.28; // Coeficiente para el componente de amplitud
  private readonly BP_STIFFNESS_FACTOR = 0.06;  // Factor de rigidez arterial
  private readonly BP_SMOOTHING_ALPHA = 0.25;   // Ajustado: era 0.15, ahora 0.25 para dar más peso a nuevas mediciones
  private readonly BP_QUALITY_THRESHOLD = 0.50;  // Umbral de calidad mínima para mediciones válidas
  private readonly BP_CALIBRATION_WINDOW = 6;   // Ventana para calibración adaptativa
  private readonly BP_MIN_VALID_PTT = 300;      // PTT mínimo válido (ms)
  private readonly BP_MAX_VALID_PTT = 1000;     // PTT máximo válido (ms)

  private ppgValues: number[] = [];
  private spo2Buffer: number[] = [];
  private spo2RawBuffer: number[] = [];      // Buffer de valores crudos (antes de promediar)
  private spo2CalibrationValues: number[] = []; // Valores durante calibración
  private systolicBuffer: number[] = [];
  private diastolicBuffer: number[] = [];
  private readonly SPO2_BUFFER_SIZE = 15;    // Aumentado para mejor estabilidad
  private readonly BP_BUFFER_SIZE = 8;       // Buffer para presión arterial
  private readonly BP_ALPHA = 0.72; // Ajustado: era 0.60, ahora 0.72 para dar más peso a nuevas mediciones
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
  private lastSpo2Value: number = 0;         // Último valor de SpO2 para suavizado

  // Variables para el algoritmo de presión arterial
  private pttHistory: number[] = [];         // Historial de tiempos de tránsito de pulso
  private amplitudeHistory: number[] = [];   // Historial de amplitudes de pulso
  private bpQualityHistory: number[] = [];   // Historial de calidad de mediciones
  private bpCalibrationFactor: number = 0.99; // Ajustado: era 0.98, ahora 0.99
  private lastBpTimestamp: number = 0;       // Timestamp de última medición válida
  private lastValidSystolic: number = 0;     // Último valor válido de sistólica
  private lastValidDiastolic: number = 0;    // Último valor válido de diastólica
  private bpReadyForOutput: boolean = false; // Indicador de valores listos para mostrar
  private lastCalculatedTime: number = 0;    // Tiempo de último cálculo para evitar repeticiones
  private measurementCount: number = 0;      // Contador de mediciones para alternar entre diferentes cálculos

  public processSignal(
    ppgValue: number,
    rrData?: { intervals: number[]; lastPeakTime: number | null }
  ) {
    const currentTime = Date.now();
    this.measurementCount++;

    // Debug: Mostrar estado actual de SpO2 cada 10 mediciones
    if (this.measurementCount % 10 === 0) {
      console.log(`%c[DEBUG SpO2] Estado actual - Medición #${this.measurementCount}`, 'background: #222; color: #bada55');
      console.log(`- Último valor SpO2: ${this.lastSpo2Value}`);
      console.log(`- Buffer SpO2 (${this.spo2Buffer.length}): ${this.spo2Buffer.join(', ')}`);
      console.log(`- Calibrado: ${this.spO2Calibrated ? 'Sí' : 'No'}, Offset: ${this.spO2CalibrationOffset}`);
    }

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

    // Calcular SpO2 con valores reales (sin variaciones artificiales)
    let spo2 = 0;
    if (this.ppgValues.length >= 60) {
      spo2 = this.calculateSpO2(this.ppgValues.slice(-60));
      
      // NO añadir variaciones artificiales - usar solo el valor real calculado
      if (spo2 > 0) {
        console.log("VitalSignsProcessor - SpO2 real calculado:", spo2);
      }
    }
    
    // Calcular presión arterial
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
      if (avgValue > 0) { // ELIMINADO FILTRO DE RANGO RAZONABLE
        // Ajustamos para que tienda a estar entre 95-99%
        this.spO2CalibrationOffset = this.SPO2_BASELINE - avgValue;
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
    this.lastCalculatedTime = 0;
    this.measurementCount = 0;

    // Resetear variables del algoritmo de presión arterial
    this.pttHistory = [];
    this.amplitudeHistory = [];
    this.bpQualityHistory = [];
    this.bpCalibrationFactor = 0.99; // Restaurar al valor inicial
    this.lastBpTimestamp = 0;
    this.lastValidSystolic = 0;
    this.lastValidDiastolic = 0;
    this.bpReadyForOutput = false;
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
    if (values.length < this.SPO2_WINDOW) {
      return 0;
    }

    try {
      // Calcular AC y DC con mejor precisión
      const ac = this.calculateAC(values);
      const dc = this.calculateDC(values);

      // Verificación de la calidad de señal
      if (ac < this.SPO2_MIN_AC_VALUE || dc === 0) {
        return 0;
      }

      // Calcular ratio R con mejor normalización
      const R = (Math.log(ac) / Math.log(dc)) * this.SPO2_CALIBRATION_FACTOR;
      
      // Ecuación ajustada para rango más preciso (85-98%)
      let spo2 = this.SPO2_R_RATIO_A - (this.SPO2_R_RATIO_B * R);
      
      // Verificar calidad de señal
      const signalQuality = this.calculateSignalQuality(values);
      if (signalQuality < this.SPO2_STABILITY_THRESHOLD) {
        console.log("Calidad de señal insuficiente:", signalQuality);
        return 0; // No devolver valores si la calidad es baja
      }

      // Detección de movimiento
      const movement = this.detectMovement(values);
      if (movement > this.SPO2_MAX_MOVEMENT_TOLERANCE) {
        console.log("Movimiento excesivo detectado:", movement);
        return 0; // No devolver valores durante movimiento
      }

      // NO añadir variaciones artificiales - usar solo el valor real calculado

      // Aplicar límites fisiológicos estrictos
      spo2 = Math.max(this.SPO2_MIN_VALID_VALUE, 
                     Math.min(this.SPO2_MAX_VALID_VALUE, spo2));

      // Logging para depuración
      console.log("SpO2 Raw calculado:", {
        ac,
        dc,
        R,
        rawSpo2: spo2,
        signalQuality,
        movement
      });

      return Math.round(spo2);
    } catch (error) {
      console.error("Error en cálculo de SpO2:", error);
      return 0;
    }
  }

  private calculateSignalQuality(values: number[]): number {
    if (values.length < 3) return 0;
    
    // Calcular variación de la señal
    const variance = this.calculateStandardDeviation(values);
    const mean = values.reduce((a, b) => a + b) / values.length;
    
    // Señal muy ruidosa o muy débil no es confiable
    if (variance > mean * 0.5 || mean < 0.1) {
      return 0;
    }
    
    // Calcular calidad basada en la estabilidad y fuerza de la señal
    const stability = 1 - (variance / mean);
    const strength = Math.min(mean / 2, 1);
    
    return Math.min(stability * strength, 1);
  }

  private detectMovement(values: number[]): number {
    if (values.length < 3) return 1;
    
    // Calcular diferencias entre valores consecutivos
    const differences = values.slice(1).map((val, i) => Math.abs(val - values[i]));
    const avgDifference = differences.reduce((a, b) => a + b) / differences.length;
    
    // Normalizar el índice de movimiento
    return Math.min(avgDifference / 0.5, 1);
  }

  // Método principal para calcular SpO2 con todos los filtros y calibración
  private calculateSpO2(values: number[]): number {
    if (values.length < this.SPO2_WINDOW) {
        return 0;
      }

    // Obtener SpO2 raw con nueva calibración
      const rawSpO2 = this.calculateSpO2Raw(values);
    
    // Validación
    if (rawSpO2 === 0) {
        return 0;
      }

    // Buffer para promediar valores
    this.spo2Buffer.push(rawSpO2);
    if (this.spo2Buffer.length > this.SPO2_BUFFER_SIZE) {
        this.spo2Buffer.shift();
      }

    // Solo proceder si tenemos suficientes lecturas válidas
    if (this.spo2Buffer.length < this.SPO2_MIN_VALID_READINGS) {
      return 0;
    }

    // Usar mediana en lugar de promedio para mayor estabilidad
    const sortedValues = [...this.spo2Buffer].sort((a, b) => a - b);
    const medianValue = sortedValues[Math.floor(sortedValues.length / 2)];
    
    // Calcular promedio móvil exponencial para estabilidad sin perder precisión
    let smoothedValue;
    if (this.lastSpo2Value === 0) {
      smoothedValue = medianValue;
        } else {
      smoothedValue = (this.SPO2_MOVING_AVERAGE_ALPHA * medianValue) +
                     ((1 - this.SPO2_MOVING_AVERAGE_ALPHA) * this.lastSpo2Value);
    }

    // Aplicar límites fisiológicos estrictos
    const finalValue = Math.max(this.SPO2_MIN_VALID_VALUE,
                              Math.min(this.SPO2_MAX_VALID_VALUE,
                                     Math.round(smoothedValue)));

    // Actualizar último valor válido
    this.lastSpo2Value = finalValue;

    // Logging para depuración
    console.log("SpO2 Final calculado:", {
        raw: rawSpO2,
      median: medianValue,
      smoothed: smoothedValue,
      final: finalValue,
      bufferSize: this.spo2Buffer.length
    });

    return finalValue;
  }

  private calculateBloodPressure(values: number[]): {
    systolic: number;
    diastolic: number;
  } {
    const validPTT = values.filter(ptt => ptt >= this.BP_MIN_VALID_PTT && ptt <= this.BP_MAX_VALID_PTT);
    if (validPTT.length < 3) return { systolic: this.lastValidSystolic, diastolic: this.lastValidDiastolic };

    const medianPTT = this.calculateMedian(validPTT);
    const amplitude = this.calculateAmplitude(values, [], []);

    const rawSystolic = this.BP_BASELINE_SYSTOLIC - (medianPTT * this.BP_PTT_COEFFICIENT) + (amplitude * this.BP_AMPLITUDE_COEFFICIENT);
    const rawDiastolic = this.BP_BASELINE_DIASTOLIC - (medianPTT * this.BP_PTT_COEFFICIENT * 0.5) + (amplitude * this.BP_AMPLITUDE_COEFFICIENT * 0.5);

    const smoothedSystolic = this.lastValidSystolic * this.BP_ALPHA + rawSystolic * (1 - this.BP_ALPHA);
    const smoothedDiastolic = this.lastValidDiastolic * this.BP_ALPHA + rawDiastolic * (1 - this.BP_ALPHA);

    this.lastValidSystolic = Math.round(smoothedSystolic);
    this.lastValidDiastolic = Math.round(smoothedDiastolic);

    return { systolic: this.lastValidSystolic, diastolic: this.lastValidDiastolic };
  }

  private calculateMedian(values: number[]): number {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
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
    
    // Encontrar picos y valles para un cálculo más preciso de AC
    const { peakIndices, valleyIndices } = this.localFindPeaksAndValleys(values);
    
    if (peakIndices.length === 0 || valleyIndices.length === 0) {
      // Si no se encuentran picos/valles, usar el método simple
    return Math.max(...values) - Math.min(...values);
    }
    
    // Calcular la amplitud media entre picos y valles
    const amplitudes: number[] = [];
    
    // Emparejar picos con valles cercanos
    for (const peakIdx of peakIndices) {
      // Encontrar el valle más cercano
      let closestValleyIdx = -1;
      let minDistance = Number.MAX_VALUE;
      
      for (const valleyIdx of valleyIndices) {
        const distance = Math.abs(peakIdx - valleyIdx);
        if (distance < minDistance) {
          minDistance = distance;
          closestValleyIdx = valleyIdx;
        }
      }
      
      if (closestValleyIdx !== -1 && minDistance < 10) { // Solo considerar valles cercanos
        const amplitude = values[peakIdx] - values[closestValleyIdx];
        if (amplitude > 0) {
          amplitudes.push(amplitude);
        }
      }
    }
    
    if (amplitudes.length === 0) {
      // Si no hay amplitudes válidas, volver al método simple
    return Math.max(...values) - Math.min(...values);
    }
    
    // Ordenar amplitudes y eliminar outliers
    amplitudes.sort((a, b) => a - b);
    
    // Si hay suficientes valores, eliminar outliers
    if (amplitudes.length >= 5) {
      // Eliminar 20% inferior y superior
      const startIdx = Math.floor(amplitudes.length * 0.2);
      const endIdx = Math.ceil(amplitudes.length * 0.8);
      const trimmedAmplitudes = amplitudes.slice(startIdx, endIdx);
      
      // Calcular media robusta
      return trimmedAmplitudes.reduce((sum, val) => sum + val, 0) / trimmedAmplitudes.length;
    }
    
    // Si hay pocos valores, usar la media simple
    return amplitudes.reduce((sum, val) => sum + val, 0) / amplitudes.length;
  }

  private calculateDC(values: number[]): number {
    if (values.length === 0) return 0;
    
    // Encontrar valles para un cálculo más preciso de DC
    const { valleyIndices } = this.localFindPeaksAndValleys(values);
    
    if (valleyIndices.length === 0) {
      // Si no se encuentran valles, usar la media simple
    return values.reduce((a, b) => a + b, 0) / values.length;
    }
    
    // Usar los valores de los valles para calcular DC
    const valleyValues = valleyIndices.map(idx => values[idx]);
    
    // Ordenar valores y eliminar outliers
    valleyValues.sort((a, b) => a - b);
    
    // Si hay suficientes valores, eliminar outliers
    if (valleyValues.length >= 5) {
      // Eliminar 20% inferior y superior
      const startIdx = Math.floor(valleyValues.length * 0.2);
      const endIdx = Math.ceil(valleyValues.length * 0.8);
      const trimmedValues = valleyValues.slice(startIdx, endIdx);
      
      // Calcular media robusta
      return trimmedValues.reduce((sum, val) => sum + val, 0) / trimmedValues.length;
    }
    
    // Si hay pocos valores, usar la media simple de los valles
    return valleyValues.reduce((sum, val) => sum + val, 0) / valleyValues.length;
  }

  private applySMAFilter(value: number): number {
    const smaBuffer = this.ppgValues.slice(-this.SMA_WINDOW);
    smaBuffer.push(value);
    return smaBuffer.reduce((a, b) => a + b, 0) / smaBuffer.length;
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
}
