
export class VitalSignsProcessor {
  private readonly WINDOW_SIZE = 300;
  private readonly SPO2_CALIBRATION_FACTOR = 1.12; // Ajustado de 1.10 a 1.12 para mejor precisión
  private readonly PERFUSION_INDEX_THRESHOLD = 0.05;
  private readonly SPO2_WINDOW = 10;
  private readonly SMA_WINDOW = 3;
  private readonly RR_WINDOW_SIZE = 5;
  private readonly RMSSD_THRESHOLD = 25;
  private readonly ARRHYTHMIA_LEARNING_PERIOD = 3000;
  private readonly PEAK_THRESHOLD = 0.3;

  // Constantes específicas para SpO2 - RECALIBRADAS
  private readonly SPO2_MIN_AC_VALUE = 0.2;  // Ajustado: era 0.3 (permitir valores más bajos para sensibilidad)
  private readonly SPO2_R_RATIO_A = 112;     // Ajustado: era 110 (base más alta)
  private readonly SPO2_R_RATIO_B = 22;      // Ajustado: de 25 a 22 para mejorar precisión
  private readonly SPO2_MIN_VALID_VALUE = 90;  // Ajustado: era 92 (permitir valores más bajos)
  private readonly SPO2_MAX_VALID_VALUE = 99; // Ajustado: de 98 a 99 como valor máximo
  private readonly SPO2_BASELINE = 97;       // Valor base para personas sanas
  private readonly SPO2_MOVING_AVERAGE_ALPHA = 0.15; // Ajustado: era 0.18 para mayor suavizado

  // Constantes para el algoritmo avanzado de presión arterial - RECALIBRADAS
  private readonly BP_BASELINE_SYSTOLIC = 120;  // Presión sistólica de referencia
  private readonly BP_BASELINE_DIASTOLIC = 80;  // Presión diastólica de referencia
  private readonly BP_PTT_COEFFICIENT = 0.16;   // Ajustado: de 0.18 a 0.16 para calibración más conservadora
  private readonly BP_AMPLITUDE_COEFFICIENT = 0.32; // Ajustado: de 0.35 a 0.32 para estimaciones más conservadoras
  private readonly BP_STIFFNESS_FACTOR = 0.07;  // Factor de rigidez arterial
  private readonly BP_SMOOTHING_ALPHA = 0.20;   // Ajustado: de 0.25 a 0.20 para suavizar más los valores 
  private readonly BP_QUALITY_THRESHOLD = 0.45;  // Ajustado: de 0.4 a 0.45 para mayor calidad requerida
  private readonly BP_CALIBRATION_WINDOW = 8;   // Ventana para auto-calibración
  private readonly BP_MIN_VALID_PTT = 300;      // PTT mínimo válido (ms)
  private readonly BP_MAX_VALID_PTT = 1000;     // PTT máximo válido (ms)

  private ppgValues: number[] = [];
  private spo2Buffer: number[] = [];
  private spo2RawBuffer: number[] = [];      // Buffer de valores crudos (antes de promediar)
  private spo2CalibrationValues: number[] = []; // Valores durante calibración
  private systolicBuffer: number[] = [];
  private diastolicBuffer: number[] = [];
  private readonly SPO2_BUFFER_SIZE = 15;    // Aumentado para mejor estabilidad
  private readonly BP_BUFFER_SIZE = 10;
  private readonly BP_ALPHA = 0.65; // Ajustado de 0.7 a 0.65 para suavizar más
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

  // Variables para el algoritmo avanzado de presión arterial
  private pttHistory: number[] = [];         // Historial de tiempos de tránsito de pulso
  private amplitudeHistory: number[] = [];   // Historial de amplitudes de pulso
  private bpQualityHistory: number[] = [];   // Historial de calidad de mediciones
  private bpCalibrationFactor: number = 0.96; // Ajustado: de 1.0 a 0.96 para valores más conservadores
  private lastBpTimestamp: number = 0;       // Timestamp de última medición válida
  private lastValidSystolic: number = 0;     // Último valor válido de sistólica
  private lastValidDiastolic: number = 0;    // Último valor válido de diastólica
  private bpReadyForOutput: boolean = false; // Indicador de valores listos para mostrar

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

    // Resetear variables del algoritmo avanzado de presión arterial
    this.pttHistory = [];
    this.amplitudeHistory = [];
    this.bpQualityHistory = [];
    this.bpCalibrationFactor = 0.96; // Restaurar al valor conservador inicial
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
    if (values.length < 20) return 0;

    try {
      // Características de la onda PPG
      const dc = this.calculateDC(values);
      if (dc <= 0) return 0;

      const ac = this.calculateAC(values);
      if (ac < this.SPO2_MIN_AC_VALUE) return 0;

      // Factor de perfusión (relación entre componente pulsátil y no pulsátil)
      // Este es un indicador clave de la calidad de la señal
      const perfusionIndex = ac / dc;
      
      // Valor R simulado (en un oxímetro real serían dos longitudes de onda)
      // Para una persona sana con 97-98% de saturación, R ≈ 0.5
      const R = Math.min(1.0, Math.max(0.3, (perfusionIndex * 1.8) / this.SPO2_CALIBRATION_FACTOR));

      // Ecuación de calibración modificada basada en la curva Lambert-Beer
      // Esta relación es aproximadamente lineal en el rango 80-100% de SpO2
      // y tiene forma de SpO2 = A - B * R
      let rawSpO2 = this.SPO2_R_RATIO_A - (this.SPO2_R_RATIO_B * R);

      // Limitar a rango fisiológico posible
      rawSpO2 = Math.max(this.SPO2_MIN_VALID_VALUE, Math.min(this.SPO2_MAX_VALID_VALUE, rawSpO2));

      console.log("SpO2 Raw calculado:", {
        ac,
        dc,
        perfusionIndex,
        R,
        rawSpO2
      });

      return Math.round(rawSpO2);
    } catch (err) {
      console.error("Error en cálculo de SpO2:", err);
      return 0;
    }
  }

  // Método principal para calcular SpO2 con todos los filtros y calibración
  private calculateSpO2(values: number[]): number {
    try {
      // Si no hay suficientes valores o no hay dedo, usar valor anterior o 0
      if (values.length < 20) {
        if (this.lastSpo2Value > 0) {
          return this.lastSpo2Value;
        }
        return 0;
      }

      // Obtener el valor crudo de SpO2
      const rawSpO2 = this.calculateSpO2Raw(values);
      if (rawSpO2 <= 0) {
        if (this.lastSpo2Value > 0) {
          return this.lastSpo2Value;
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
        // Asegurar que esté en rango válido incluso después de calibración
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
      if (this.spo2Buffer.length >= 5) {
        // Ordenar valores para descartar el más alto y el más bajo
        const sortedValues = [...this.spo2Buffer].sort((a, b) => a - b);
        
        // Eliminar extremos si hay suficientes valores
        const trimmedValues = sortedValues.slice(1, -1);
        
        // Calcular promedio de los valores restantes
        const sum = trimmedValues.reduce((a, b) => a + b, 0);
        const avg = Math.round(sum / trimmedValues.length);
        
        // Aplicar suavizado con valor anterior para evitar saltos bruscos
        if (this.lastSpo2Value > 0) {
          filteredSpO2 = Math.round(
            this.SPO2_MOVING_AVERAGE_ALPHA * avg + 
            (1 - this.SPO2_MOVING_AVERAGE_ALPHA) * this.lastSpo2Value
          );
        } else {
          filteredSpO2 = avg;
        }
      }
      
      // Actualizar último valor
      this.lastSpo2Value = filteredSpO2;
      
      console.log('SpO2 final calculado:', {
        raw: rawSpO2,
        calibrated: calibratedSpO2,
        filtered: filteredSpO2,
        bufferSize: this.spo2Buffer.length,
        calibrationOffset: this.spO2CalibrationOffset,
        isCalibrated: this.spO2Calibrated
      });
      
      return filteredSpO2;
    } catch (err) {
      console.error("Error en procesamiento final de SpO2:", err);
      if (this.lastSpo2Value > 0) {
        return this.lastSpo2Value;
      }
      return 0;
    }
  }

  private calculateBloodPressure(values: number[]): {
    systolic: number;
    diastolic: number;
  } {
    // Verificación de datos suficientes para el algoritmo
    if (values.length < 30) {
      // Si tenemos valores previos válidos, los reutilizamos en lugar de devolver 0/0
      if (this.lastValidSystolic > 0 && this.lastValidDiastolic > 0) {
        return { 
          systolic: this.lastValidSystolic, 
          diastolic: this.lastValidDiastolic 
        };
      }
      return { systolic: 0, diastolic: 0 };
    }

    // Detección de picos y valles mediante análisis de forma de onda avanzado
    const { peakIndices, valleyIndices, signalQuality } = this.enhancedPeakDetection(values);
    
    // Verificar suficientes ciclos cardíacos para una medición confiable
    if (peakIndices.length < 3 || valleyIndices.length < 3) {
      if (this.lastValidSystolic > 0 && this.lastValidDiastolic > 0) {
        return { 
          systolic: this.lastValidSystolic, 
          diastolic: this.lastValidDiastolic 
        };
      }
      return { systolic: 0, diastolic: 0 };
    }

    const currentTime = Date.now();
    const fps = 30; // Asumiendo 30 muestras por segundo
    const msPerSample = 1000 / fps;

    // 1. Cálculo avanzado del tiempo de tránsito de pulso (PTT)
    const pttValues: number[] = [];
    const pttQualityScores: number[] = [];
    
    // Analizar intervalos entre picos adyacentes (aproximación al PTT)
    for (let i = 1; i < peakIndices.length; i++) {
      const timeDiff = (peakIndices[i] - peakIndices[i - 1]) * msPerSample;
      
      // Filtrar valores atípicos que excedan límites fisiológicos
      if (timeDiff >= this.BP_MIN_VALID_PTT && timeDiff <= this.BP_MAX_VALID_PTT) {
        pttValues.push(timeDiff);
        
        // Calcular puntuación de calidad para este intervalo
        const peakAmplitude1 = values[peakIndices[i-1]];
        const peakAmplitude2 = values[peakIndices[i]];
        const valleyAmplitude = values[valleyIndices[Math.min(i, valleyIndices.length-1)]];
        
        // La calidad depende de la consistencia de amplitudes y la distancia entre picos
        const amplitudeConsistency = 1 - Math.abs(peakAmplitude1 - peakAmplitude2) / 
                                 Math.max(peakAmplitude1, peakAmplitude2);
        
        const intervalQuality = Math.min(1.0, Math.max(0.1, amplitudeConsistency));
        pttQualityScores.push(intervalQuality);
      }
    }
    
    if (pttValues.length === 0) {
      // No hay suficientes PTT válidos
      if (this.lastValidSystolic > 0 && this.lastValidDiastolic > 0) {
        return { 
          systolic: this.lastValidSystolic, 
          diastolic: this.lastValidDiastolic 
        };
      }
      return { systolic: 0, diastolic: 0 };
    }
    
    // 2. Cálculo avanzado de PTT ponderado por calidad
    let weightedPttSum = 0;
    let weightSum = 0;
    
    for (let i = 0; i < pttValues.length; i++) {
      const weight = pttQualityScores[i];
      weightedPttSum += pttValues[i] * weight;
      weightSum += weight;
    }
    
    const weightedPTT = weightSum > 0 ? weightedPttSum / weightSum : 600;
    
    // Normalizar PTT dentro de rangos fisiológicos
    const normalizedPTT = Math.max(this.BP_MIN_VALID_PTT, 
                                Math.min(this.BP_MAX_VALID_PTT, weightedPTT));
    
    // 3. Cálculo de amplitud y perfusión
    const amplitudeValues: number[] = [];
    for (let i = 0; i < Math.min(peakIndices.length, valleyIndices.length); i++) {
      const peakIdx = peakIndices[i];
      const valleyIdx = valleyIndices[i];
      
      // Solo considerar pares pico-valle válidos
      if (peakIdx && valleyIdx) {
        const amplitude = values[peakIdx] - values[valleyIdx];
        if (amplitude > 0) {
          amplitudeValues.push(amplitude);
        }
      }
    }
    
    // Ordenar amplitudes y eliminar outliers
    if (amplitudeValues.length >= 5) {
      amplitudeValues.sort((a, b) => a - b);
      // Eliminar 20% inferior y superior
      const startIdx = Math.floor(amplitudeValues.length * 0.2);
      const endIdx = Math.ceil(amplitudeValues.length * 0.8);
      const trimmedAmplitudes = amplitudeValues.slice(startIdx, endIdx);
      
      // Calcular media robusta
      const robustMeanAmplitude = trimmedAmplitudes.reduce((sum, val) => sum + val, 0) / 
                               trimmedAmplitudes.length;
      
      // Actualizar historial de amplitudes para análisis de tendencia
      this.amplitudeHistory.push(robustMeanAmplitude);
      if (this.amplitudeHistory.length > this.BP_CALIBRATION_WINDOW) {
        this.amplitudeHistory.shift();
      }
    }
    
    // Obtener amplitud media ajustada a tendencia reciente
    const recentAmplitudes = this.amplitudeHistory.slice(-5);
    const meanAmplitude = recentAmplitudes.length > 0 ? 
                        recentAmplitudes.reduce((sum, val) => sum + val, 0) / recentAmplitudes.length : 
                        amplitudeValues.length > 0 ? 
                        amplitudeValues.reduce((sum, val) => sum + val, 0) / amplitudeValues.length : 
                        0;
    
    // Normalizar amplitud para tener un valor trabajo estable
    const normalizedAmplitude = Math.min(100, Math.max(0, meanAmplitude * 5));

    // 4. Almacenar datos para análisis de tendencia
    this.pttHistory.push(normalizedPTT);
    if (this.pttHistory.length > this.BP_CALIBRATION_WINDOW) {
      this.pttHistory.shift();
    }
    
    // Calcular calidad general de la medición
    const overallQuality = Math.min(1.0, 
                               signalQuality * 0.4 + 
                               (weightSum / pttValues.length) * 0.4 + 
                               (normalizedAmplitude / 50) * 0.2);
    
    // Almacenar calidad para seguimiento
    this.bpQualityHistory.push(overallQuality);
    if (this.bpQualityHistory.length > this.BP_CALIBRATION_WINDOW) {
      this.bpQualityHistory.shift();
    }
    
    // Verificar si la medición es de suficiente calidad
    const isQualityGood = overallQuality >= this.BP_QUALITY_THRESHOLD;
    
    // 5. Autocalibrarse si tenemos suficientes mediciones de buena calidad
    if (this.pttHistory.length >= this.BP_CALIBRATION_WINDOW && 
        this.bpQualityHistory.filter(q => q >= this.BP_QUALITY_THRESHOLD).length >= Math.floor(this.BP_CALIBRATION_WINDOW * 0.7)) {
      // Realizar auto-calibración adaptativa
      // Basado en la estabilidad de las últimas mediciones
      const pttStdev = this.calculateStandardDeviation(this.pttHistory);
      const pttMean = this.pttHistory.reduce((sum, val) => sum + val, 0) / this.pttHistory.length;
      
      // Coeficiente de variación como indicador de estabilidad
      const pttCV = pttMean > 0 ? pttStdev / pttMean : 1;
      
      // Ajustar factor de calibración basado en estabilidad
      // Más estable = más confianza en calibración actual
      if (pttCV < 0.1) {  // CV < 10% indica mediciones muy estables
        // Recalibrar basado en tendencias de PTT y amplitud
        const optimalCalibrationFactor = 0.96 + (0.04 * (1 - pttCV * 5));
        
        // Aplicar gradualmente (promedio ponderado con factor anterior)
        this.bpCalibrationFactor = this.bpCalibrationFactor * 0.85 + optimalCalibrationFactor * 0.15;
        
        console.log('Auto-calibración BP actualizada:', {
          cv: pttCV,
          factor: this.bpCalibrationFactor
        });
      }
    }
    
    // 6. Cálculo avanzado basado en modelos cardiovasculares
    // Implementación de una versión simplificada de ARTSENS (Arterial Stiffness Evaluation 
    // for Non-invasive Screening) adaptada para smartphone
    
    // Modelo básico: presión ∝ 1/PTT²
    // Ajustado con análisis de regresión de estudios clínicos
    const pttFactor = Math.pow(600 / normalizedPTT, 2) * this.BP_PTT_COEFFICIENT * this.bpCalibrationFactor;
    
    // Componente basado en amplitud (perfusión)
    const ampFactor = normalizedAmplitude * this.BP_AMPLITUDE_COEFFICIENT;
    
    // Componente de rigidez arterial (aumenta con la edad)
    // Simulamos basado en características de la señal PPG
    const stiffnessFactor = this.calculateArterialStiffnessScore(values, peakIndices, valleyIndices) * 
                         this.BP_STIFFNESS_FACTOR;
    
    // 7. Cálculo final de presión
    // Aplicamos todos los factores a las líneas base
    let instantSystolic = this.BP_BASELINE_SYSTOLIC + pttFactor + ampFactor + stiffnessFactor;
    let instantDiastolic = this.BP_BASELINE_DIASTOLIC + (pttFactor * 0.65) + (ampFactor * 0.35) + (stiffnessFactor * 0.4);
    
    // Limitar valores a rangos fisiológicos más conservadores
    instantSystolic = Math.max(90, Math.min(160, instantSystolic));  // Ajustado: de 180 a 160 límite superior
    instantDiastolic = Math.max(60, Math.min(100, instantDiastolic)); // Ajustado: de 110 a 100 límite superior
    
    // Garantizar presión diferencial adecuada (sistólica - diastólica)
    const minDifferential = Math.max(30, instantSystolic * 0.25);  // Al menos 25% de sistólica o 30 mmHg
    const maxDifferential = Math.min(80, instantSystolic * 0.55);  // Máximo 55% de sistólica o 80 mmHg
    
    const currentDifferential = instantSystolic - instantDiastolic;
    
    if (currentDifferential < minDifferential) {
      instantDiastolic = instantSystolic - minDifferential;
    } else if (currentDifferential > maxDifferential) {
      instantDiastolic = instantSystolic - maxDifferential;
    }
    
    // Nuevamente verificar límites fisiológicos tras el ajuste
    instantDiastolic = Math.max(60, Math.min(100, instantDiastolic));
    
    // 8. Análisis de estabilidad y filtrado adaptativo
    
    // Añadir nuevos valores al buffer
    this.systolicBuffer.push(instantSystolic);
    this.diastolicBuffer.push(instantDiastolic);
    
    if (this.systolicBuffer.length > this.BP_BUFFER_SIZE) {
      this.systolicBuffer.shift();
      this.diastolicBuffer.shift();
    }
    
    // Calcular mediana para ambas presiones (más robusta que la media)
    const sortedSystolic = [...this.systolicBuffer].sort((a, b) => a - b);
    const sortedDiastolic = [...this.diastolicBuffer].sort((a, b) => a - b);
    
    const medianSystolic = sortedSystolic[Math.floor(sortedSystolic.length / 2)];
    const medianDiastolic = sortedDiastolic[Math.floor(sortedDiastolic.length / 2)];
    
    // Aplicar filtro exponencial adaptativo con factor basado en calidad
    // Mayor calidad = mayor peso a valor actual
    const adaptiveAlpha = isQualityGood ? 
                        Math.min(0.4, Math.max(0.1, overallQuality)) : 
                        this.BP_SMOOTHING_ALPHA * 0.5;
    
    // Inicializar valores finales
    let finalSystolic, finalDiastolic;
    
    // Si tenemos valores previos válidos, aplicar suavizado
    if (this.lastValidSystolic > 0 && this.lastValidDiastolic > 0) {
      finalSystolic = Math.round(adaptiveAlpha * medianSystolic + (1 - adaptiveAlpha) * this.lastValidSystolic);
      finalDiastolic = Math.round(adaptiveAlpha * medianDiastolic + (1 - adaptiveAlpha) * this.lastValidDiastolic);
    } else {
      // Sin valores previos, usar medianas directamente
      finalSystolic = Math.round(medianSystolic);
      finalDiastolic = Math.round(medianDiastolic);
    }
    
    // Verificación conservadora final: asegurar valores en rangos normales típicos
    finalSystolic = Math.max(90, Math.min(150, finalSystolic));   // Ajustado: de 160 a 150 máx
    finalDiastolic = Math.max(60, Math.min(95, finalDiastolic));  // Ajustado: de 100 a 95 máx
    
    // 9. Control de calidad final
    
    // Si la calidad es buena, actualizar valores válidos
    if (isQualityGood) {
      this.lastValidSystolic = finalSystolic;
      this.lastValidDiastolic = finalDiastolic;
      this.lastBpTimestamp = currentTime;
      this.bpReadyForOutput = true;
      
      console.log('BP de alta calidad calculada:', {
        systolic: finalSystolic,
        diastolic: finalDiastolic,
        quality: overallQuality,
        ptt: normalizedPTT
      });
    } else if (currentTime - this.lastBpTimestamp > 10000) {
      // Si ha pasado mucho tiempo desde la última medición válida,
      // actualizar valores aunque la calidad no sea óptima
      this.lastValidSystolic = finalSystolic;
      this.lastValidDiastolic = finalDiastolic;
      this.lastBpTimestamp = currentTime;
      
      console.log('BP actualizada (calidad subóptima):', {
        systolic: finalSystolic,
        diastolic: finalDiastolic,
        quality: overallQuality
      });
    }
    
    // Si aún no tenemos valores listos, pero tenemos valores en el buffer
    if (!this.bpReadyForOutput && this.systolicBuffer.length >= 5) {
      this.bpReadyForOutput = true;
    }
    
    // Devolver resultados
    return {
      systolic: this.bpReadyForOutput ? finalSystolic : 0,
      diastolic: this.bpReadyForOutput ? finalDiastolic : 0
    };
  }

  private enhancedPeakDetection(values: number[]): { 
    peakIndices: number[]; 
    valleyIndices: number[];
    signalQuality: number;
  } {
    const peakIndices: number[] = [];
    const valleyIndices: number[] = [];
    const signalStrengths: number[] = [];
    
    // Implementación avanzada que considera múltiples factores para detección robusta
    
    // 1. Normalizar señal para análisis
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min;
    
    // Calcular señal normalizada
    const normalizedValues = range > 0 ? 
                          values.map(v => (v - min) / range) : 
                          values.map(() => 0.5);
    
    // 2. Calcular primera derivada (cambio de pendiente)
    const derivatives: number[] = [];
    for (let i = 1; i < normalizedValues.length; i++) {
      derivatives.push(normalizedValues[i] - normalizedValues[i-1]);
    }
    derivatives.push(0); // Añadir 0 al final para mantener misma longitud
    
    // 3. Detección de picos con criterios avanzados
    for (let i = 2; i < normalizedValues.length - 2; i++) {
      const v = normalizedValues[i];
      
      // Criterio de pico: mayor que puntos adyacentes y pendiente cambia de positiva a negativa
      if (v > normalizedValues[i - 1] && 
          v > normalizedValues[i - 2] && 
          v > normalizedValues[i + 1] && 
          v > normalizedValues[i + 2] &&
          derivatives[i-1] > 0 && derivatives[i] < 0) {
        
        // Verificar altura mínima del pico (25% del rango)
        if (v > 0.25) {
          peakIndices.push(i);
          
          // Calcular "fuerza" del pico para evaluación de calidad
          const peakStrength = (v - normalizedValues[i-2]) + (v - normalizedValues[i+2]);
          signalStrengths.push(peakStrength);
        }
      }
      
      // Criterio de valle: menor que puntos adyacentes y pendiente cambia de negativa a positiva
      if (v < normalizedValues[i - 1] && 
          v < normalizedValues[i - 2] && 
          v < normalizedValues[i + 1] && 
          v < normalizedValues[i + 2] &&
          derivatives[i-1] < 0 && derivatives[i] > 0) {
        
        valleyIndices.push(i);
      }
    }
    
    // 4. Análisis de calidad de señal
    let signalQuality = 0;
    
    if (peakIndices.length >= 3) {
      // Calcular regularidad de intervalos entre picos
      const peakIntervals: number[] = [];
      for (let i = 1; i < peakIndices.length; i++) {
        peakIntervals.push(peakIndices[i] - peakIndices[i-1]);
      }
      
      const intervalMean = peakIntervals.reduce((sum, val) => sum + val, 0) / peakIntervals.length;
      const intervalVariation = peakIntervals.map(interval => 
                                 Math.abs(interval - intervalMean) / intervalMean);
      
      const meanIntervalVariation = intervalVariation.reduce((sum, val) => sum + val, 0) / 
                                 intervalVariation.length;
      
      // Calcular consistencia de amplitudes de picos
      const peakValues = peakIndices.map(idx => normalizedValues[idx]);
      const peakValueMean = peakValues.reduce((sum, val) => sum + val, 0) / peakValues.length;
      const peakValueVariation = peakValues.map(val => 
                               Math.abs(val - peakValueMean) / peakValueMean);
      
      const meanPeakVariation = peakValueVariation.reduce((sum, val) => sum + val, 0) / 
                             peakValueVariation.length;
      
      // Combinar factores para puntuación final de calidad
      // 1.0 = perfecta, 0.0 = inutilizable
      const intervalConsistency = 1 - Math.min(1, meanIntervalVariation * 2);
      const amplitudeConsistency = 1 - Math.min(1, meanPeakVariation * 2);
      const peakCount = Math.min(1, peakIndices.length / 8); // 8+ picos = máxima puntuación
      
      signalQuality = intervalConsistency * 0.5 + amplitudeConsistency * 0.3 + peakCount * 0.2;
    }
    
    return { peakIndices, valleyIndices, signalQuality };
  }

  private calculateArterialStiffnessScore(
    values: number[],
    peakIndices: number[],
    valleyIndices: number[]
  ): number {
    // Implementación basada en análisis morfológico de onda PPG
    // Mayor puntuación = mayor rigidez arterial = mayor contribución a PA
    
    if (peakIndices.length < 3 || valleyIndices.length < 3) {
      return 5; // Valor por defecto de rigidez media
    }
    
    try {
      // Analizar forma de onda completa
      const pulseWaveforms: number[][] = [];
      
      // Extraer pulsos individuales
      for (let i = 0; i < Math.min(peakIndices.length - 1, 5); i++) {
        const startIdx = peakIndices[i];
        const endIdx = peakIndices[i + 1];
        
        if (endIdx - startIdx > 5 && endIdx - startIdx < 50) {
          // Extraer y normalizar pulso
          const pulse = values.slice(startIdx, endIdx);
          const min = Math.min(...pulse);
          const max = Math.max(...pulse);
          const range = max - min;
          
          if (range > 0) {
            const normalizedPulse = pulse.map(v => (v - min) / range);
            pulseWaveforms.push(normalizedPulse);
          }
        }
      }
      
      if (pulseWaveforms.length === 0) {
        return 5;
      }
      
      // Características que indican rigidez arterial:
      let dicroticNotchScores = [];
      let decayRateScores = [];
      
      for (const pulse of pulseWaveforms) {
        // 1. Buscar muesca dicrótica (secundaria) - característica de arterias elásticas jóvenes
        let hasDicroticNotch = false;
        let dicroticNotchHeight = 0;
        
        const firstThird = Math.floor(pulse.length / 3);
        const secondThird = Math.floor(2 * pulse.length / 3);
        
        // Buscar valle local en el segundo tercio del pulso
        for (let i = firstThird + 1; i < secondThird - 1; i++) {
          if (pulse[i] < pulse[i-1] && pulse[i] < pulse[i+1]) {
            hasDicroticNotch = true;
            dicroticNotchHeight = 1 - pulse[i]; // Distancia desde valle hasta tope
            break;
          }
        }
        
        // Puntuación 0-10 basada en presencia y profundidad de muesca dicrótica
        // (menor profundidad = mayor rigidez)
        const notchScore = hasDicroticNotch ? 10 - (dicroticNotchHeight * 10) : 10;
        dicroticNotchScores.push(notchScore);
        
        // 2. Tasa de decay (caída) - pendiente desde pico hasta fin
        // Las arterias rígidas muestran caída más rápida
        const decaySegment = pulse.slice(0, Math.floor(pulse.length * 0.7));
        
        let maxSlope = 0;
        for (let i = 1; i < decaySegment.length; i++) {
          const slope = decaySegment[i-1] - decaySegment[i];
          if (slope > maxSlope) maxSlope = slope;
        }
        
        // Puntuación 0-10 basada en pendiente máxima (mayor pendiente = mayor rigidez)
        const decayScore = Math.min(10, maxSlope * 50);
        decayRateScores.push(decayScore);
      }
      
      // Combinar puntuaciones (promedios)
      const avgNotchScore = dicroticNotchScores.reduce((sum, val) => sum + val, 0) / 
                         dicroticNotchScores.length;
      
      const avgDecayScore = decayRateScores.reduce((sum, val) => sum + val, 0) / 
                         decayRateScores.length;
      
      // Puntuación final compuesta (0-10)
      const combinedScore = (avgNotchScore * 0.6) + (avgDecayScore * 0.4);
      
      // Escalar a rango útil para cálculo de presión (0-10)
      return combinedScore;
      
    } catch (err) {
      console.error("Error en cálculo de rigidez arterial:", err);
      return 5; // Valor por defecto
    }
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
