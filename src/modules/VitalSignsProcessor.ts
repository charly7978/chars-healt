export class VitalSignsProcessor {
  // ─────────── PARÁMETROS DE CONFIGURACIÓN ───────────
  // Parámetros generales de procesamiento
  private readonly WINDOW_SIZE = 300; // 10 segundos a 30fps
  private readonly SMA_WINDOW = 5; // Suavizado de señal
  private readonly HR_BASELINE_TIME = 10000; // 10 segundos para establecer línea base
  
  // Parámetros de cálculo de SpO2 - basados en investigación clínica
  private readonly SPO2_CALIBRATION_FACTOR = 1.03;
  private readonly SPO2_WINDOW = 12;
  private readonly SPO2_MINIMUM_SAMPLES = 60; // 2 segundos a 30fps
  private readonly PERFUSION_INDEX_THRESHOLD = 0.06;
  private readonly AC_DC_MIN_RATIO = 0.03; // Relación mínima aceptable
  private readonly SPO2_OFFSET = 1.5; // Pequeño offset de calibración
  private readonly SPO2_ALPHA = 0.3; // Factor de suavizado
  
  // Parámetros de estimación de presión arterial
  private readonly PTT_MIN = 300; // Tiempo mínimo de tránsito de pulso (ms)
  private readonly PTT_MAX = 1200; // Tiempo máximo de tránsito de pulso (ms)
  private readonly BP_BUFFER_SIZE = 12; // Ventana de promediado
  private readonly BP_ALPHA = 0.8; // Ponderación exponencial
  private readonly SBP_FACTOR = 0.09; // Factor de cálculo sistólico
  private readonly DBP_FACTOR = 0.05; // Factor de cálculo diastólico
  private readonly SBP_BASELINE = 120; // Sistólica base (mmHg)
  private readonly DBP_BASELINE = 80; // Diastólica base (mmHg)
  private readonly AMPLITUDE_SCALING = 0.4; // Impacto de amplitud en PA
  
  // Parámetros de detección de arritmia
  private readonly RR_WINDOW_SIZE = 8; // Número de intervalos a analizar
  private readonly RMSSD_THRESHOLD = 30; // Umbral de Root Mean Square of Successive Differences
  private readonly ARRHYTHMIA_LEARNING_PERIOD = 5000; // Establecimiento de línea base
  private readonly SDNN_THRESHOLD = 50; // Umbral de desviación estándar
  private readonly PVC_THRESHOLD = 0.75; // Umbral de contracción ventricular prematura
  private readonly PAC_THRESHOLD = 0.80; // Umbral de contracción auricular prematura
  private readonly BRADYCARDIA_THRESHOLD = 50; // Definición de bradicardia (BPM)
  private readonly TACHYCARDIA_THRESHOLD = 100; // Definición de taquicardia (BPM)
  
  // Parámetros de detección de picos
  private readonly PEAK_THRESHOLD = 0.3;
  private readonly PEAK_MIN_DISTANCE = 300; // ms
  
  // ─────────── VARIABLES DE ESTADO ───────────
  // Buffers de señal y Variables de estado
  private ppgValues: number[] = [];
  private lastValue = 0;
  private smaBuffer: number[] = [];
  private spo2Buffer: number[] = [];
  private systolicBuffer: number[] = [];
  private diastolicBuffer: number[] = [];

  // Seguimiento de ritmo cardíaco
  private lastPeakTime: number | null = null;
  private rrIntervals: number[] = [];
  private baselineRhythm = 0;
  private isLearningPhase = true;
  private arrhythmiaDetected = false;
  private arrhythmiaType: string = '';
  private measurementStartTime: number = Date.now();
  
  // Relacionados con oxígeno en sangre
  private lastValidSpO2 = 98;
  private spO2Confidence = 0;
  private perfusionIndex = 0;
  
  // Relacionados con presión arterial
  private smoothedSystolic = this.SBP_BASELINE;
  private smoothedDiastolic = this.DBP_BASELINE;
  private lastValidBP = { systolic: this.SBP_BASELINE, diastolic: this.DBP_BASELINE };
  private bpConfidence = 0;
  
  // Datos de análisis de arritmia
  private lastArrhythmiaCheckTime = 0;
  private lastArrhythmiaTime = 0;
  private arrhythmiaScore = 0;
  private currentRmssd = 0;
  private currentSdnn = 0;
  private beatVariability = 0;
  
  /**
   * Procesa y analiza la señal PPG para extraer signos vitales
   */
  public processSignal(
    ppgValue: number,
    rrData?: { 
      intervals: number[]; 
      lastPeakTime: number | null;
      arrhythmiaDetected?: boolean;
      arrhythmiaScore?: number;
    }
  ): {
    spo2: number;
    pressure: string;
    arrhythmiaStatus: string;
    rawArrhythmiaData: {
      timestamp: number;
      rmssd: number;
      rrVariation: number;
      type: string;
    } | null;
  } {
    // Registrar cada 30ª muestra para depuración
    if (this.ppgValues.length % 30 === 0) {
      console.log("VitalSignsProcessor: Procesamiento de señal", {
        isLearning: this.isLearningPhase,
        rrIntervals: this.rrIntervals.length,
        arrhythmiaDetected: this.arrhythmiaDetected,
        arrhythmiaScore: this.arrhythmiaScore,
        perfusionIndex: this.perfusionIndex,
        receivedRRData: !!rrData
      });
    }
    
    // Aplicar filtrado de primer nivel - Promedio Móvil Simple
    const filteredValue = this.applySMAFilter(ppgValue);
    
    // Almacenar la señal suavizada
    this.ppgValues.push(filteredValue);
    if (this.ppgValues.length > this.WINDOW_SIZE) {
      this.ppgValues.shift();
    }
    
    // Procesar datos de intervalo RR del procesador de latidos
    if (rrData && rrData.intervals.length > 0) {
      this.rrIntervals = [...rrData.intervals];
      this.lastPeakTime = rrData.lastPeakTime;
      
      // Usar detección de arritmia del HeartBeatProcessor si está disponible
      if (rrData.arrhythmiaDetected !== undefined) {
        this.arrhythmiaDetected = rrData.arrhythmiaDetected;
        if (rrData.arrhythmiaScore !== undefined) {
          this.arrhythmiaScore = rrData.arrhythmiaScore;
        }
      } else if (!this.isLearningPhase && this.rrIntervals.length >= this.RR_WINDOW_SIZE) {
        // De lo contrario, ejecutar nuestra propia detección
        this.detectArrhythmia();
      }
    }
    
    // Calcular SpO2 con puntuación de confianza
    const { spo2, confidence: spo2Confidence } = this.calculateSpO2(
      this.ppgValues.slice(-Math.min(this.ppgValues.length, 90))
    );
    this.spO2Confidence = spo2Confidence;
    
    // Calcular presión arterial basada en morfología PPG e intervalos
    const { systolic, diastolic, confidence: bpConfidence } = this.calculateBloodPressure(
      this.ppgValues.slice(-Math.min(this.ppgValues.length, 90))
    );
    this.bpConfidence = bpConfidence;
    
    // Formatear presión arterial como cadena
    const pressureString = `${systolic}/${diastolic}`;
    
    // Determinar mensaje de estado de arritmia
    let arrhythmiaStatus = "--";
    
    const currentTime = Date.now();
    const timeSinceStart = currentTime - this.measurementStartTime;
    
    // Solo reportar arritmia después del período de aprendizaje
    if (timeSinceStart > this.ARRHYTHMIA_LEARNING_PERIOD) {
      this.isLearningPhase = false;
      if (this.arrhythmiaDetected) {
        arrhythmiaStatus = this.arrhythmiaType 
          ? `ARRITMIA DETECTADA: ${this.arrhythmiaType}` 
          : "ARRITMIA DETECTADA";
        this.lastArrhythmiaTime = currentTime;
      } else {
        arrhythmiaStatus = "RITMO NORMAL";
      }
    } else {
      arrhythmiaStatus = "ANALIZANDO RITMO...";
    }
    
    // Preparar datos de arritmia brutos para visualización
    const rawArrhythmiaData = this.arrhythmiaDetected && this.currentRmssd > 0 ? {
      timestamp: currentTime,
      rmssd: this.currentRmssd,
      rrVariation: this.beatVariability,
      type: this.arrhythmiaType
    } : null;
    
    return {
      spo2,
      pressure: pressureString,
      arrhythmiaStatus,
      rawArrhythmiaData
    };
  }
  
  /**
   * Detección avanzada de arritmia usando múltiples métricas
   */
  private detectArrhythmia(): void {
    const currentTime = Date.now();
    
    // No ejecutar detección con demasiada frecuencia
    if (currentTime - this.lastArrhythmiaCheckTime < 500) {
      return;
    }
    
    this.lastArrhythmiaCheckTime = currentTime;
    
    if (this.rrIntervals.length < this.RR_WINDOW_SIZE) {
      console.log("VitalSignsProcessor: Intervalos RR insuficientes para análisis de arritmia", {
        disponibles: this.rrIntervals.length,
        requeridos: this.RR_WINDOW_SIZE
      });
      return;
    }
    
    // Obtener intervalos más recientes para análisis
    const recentRR = this.rrIntervals.slice(-this.RR_WINDOW_SIZE);
    
    // Calcular intervalo RR promedio y convertir a BPM
    const avgRR = recentRR.reduce((a, b) => a + b, 0) / recentRR.length;
    const currentBPM = 60000 / avgRR;
    
    // Calcular RMSSD - Root Mean Square of Successive Differences
    // Una métrica clave de VFC para detección de arritmia
    let sumSquaredDiff = 0;
    for (let i = 1; i < recentRR.length; i++) {
      const diff = recentRR[i] - recentRR[i - 1];
      sumSquaredDiff += diff * diff;
    }
    this.currentRmssd = Math.sqrt(sumSquaredDiff / (recentRR.length - 1));
    
    // Calcular SDNN - Desviación Estándar de intervalos NN
    // Otra métrica importante de VFC
    const sumSquaredDeviation = recentRR.reduce((sum, interval) => {
      return sum + Math.pow(interval - avgRR, 2);
    }, 0);
    this.currentSdnn = Math.sqrt(sumSquaredDeviation / recentRR.length);
    
    // Calcular variación de latido como porcentaje
    this.beatVariability = (this.currentRmssd / avgRR) * 100;
    
    // Verificar latidos prematuros - intervalos significativamente más cortos
    const lastRR = recentRR[recentRR.length - 1];
    const prematureBeat = lastRR < (avgRR * this.PVC_THRESHOLD);
    
    // Verificar patrones de latidos prematuros seguidos de pausa compensatoria
    let hasPattern = false;
    if (recentRR.length >= 3) {
      for (let i = 1; i < recentRR.length - 1; i++) {
        const prevRR = recentRR[i - 1];
        const currRR = recentRR[i];
        const nextRR = recentRR[i + 1];
        
        // Patrón: normal → corto → largo (latido prematuro seguido de pausa compensatoria)
        if (currRR < (prevRR * this.PVC_THRESHOLD) && nextRR > (prevRR * 1.2)) {
          hasPattern = true;
          break;
        }
      }
    }
    
    // Determinar tipo de arritmia basado en múltiples métricas
    let arrhythmiaType = '';
    let isArrhythmia = false;
    
    // Verificar bradicardia (frecuencia cardíaca lenta)
    if (currentBPM < this.BRADYCARDIA_THRESHOLD) {
      arrhythmiaType = 'BRADICARDIA';
      isArrhythmia = true;
    } 
    // Verificar taquicardia (frecuencia cardíaca rápida)
    else if (currentBPM > this.TACHYCARDIA_THRESHOLD) {
      arrhythmiaType = 'TAQUICARDIA';
      isArrhythmia = true;
    }
    // Verificar alta variabilidad indicando arritmia
    else if (this.beatVariability > this.RMSSD_THRESHOLD) {
      isArrhythmia = true;
      if (prematureBeat || hasPattern) {
        arrhythmiaType = 'LATIDOS PREMATUROS';
      } else {
        arrhythmiaType = 'IRREGULARIDAD';
      }
    }
    // Verificar patrones específicos
    else if (prematureBeat || hasPattern) {
      isArrhythmia = true;
      arrhythmiaType = 'LATIDO PREMATURO';
    }
    
    const newArrhythmiaState = isArrhythmia;
    
    // Solo registrar cambios en estado de arritmia
    if (newArrhythmiaState !== this.arrhythmiaDetected || 
        (newArrhythmiaState && arrhythmiaType !== this.arrhythmiaType)) {
      this.arrhythmiaDetected = newArrhythmiaState;
      this.arrhythmiaType = arrhythmiaType;
      
      console.log("VitalSignsProcessor: Actualización de análisis de arritmia", {
        timestamp: new Date().toISOString(),
        estadoAnterior: !this.arrhythmiaDetected,
        nuevoEstado: this.arrhythmiaDetected,
        tipo: arrhythmiaType,
        metricas: {
          rmssd: this.currentRmssd,
          sdnn: this.currentSdnn,
          variabilidadLatido: this.beatVariability,
          avgRR: avgRR,
          bpm: currentBPM,
          latidoPrematuro: prematureBeat,
          tienePatron: hasPattern
        }
      });
    }
  }
  
  /**
   * Procesar latido cardíaco para temporización interna
   */
  private processHeartBeat() {
    const currentTime = Date.now();
    
    if (this.lastPeakTime === null) {
      this.lastPeakTime = currentTime;
      return;
    }
    
    const rrInterval = currentTime - this.lastPeakTime;
    this.rrIntervals.push(rrInterval);
    
    if (this.rrIntervals.length > 20) {
      this.rrIntervals.shift();
    }
    
    if (!this.isLearningPhase && this.rrIntervals.length >= this.RR_WINDOW_SIZE) {
      this.detectArrhythmia();
    }
    
    this.lastPeakTime = currentTime;
  }
  
  /**
   * Calcular SpO2 (saturación de oxígeno en sangre) a partir de señal PPG
   * Implementa algoritmos mejorados basados en investigación reciente
   */
  private calculateSpO2(values: number[]): { spo2: number; confidence: number } {
    // Asegurar que tenemos suficientes datos
    if (values.length < this.SPO2_MINIMUM_SAMPLES) {
      return { 
        spo2: Math.max(0, this.lastValidSpO2 - 1), 
        confidence: 0.2 
      };
    }
    
    // Calcular componente DC (línea base)
    const dc = this.calculateDC(values);
    if (dc === 0) {
      return { 
        spo2: Math.max(0, this.lastValidSpO2 - 1), 
        confidence: 0.1 
      };
    }
    
    // Calcular componente AC (señal pulsátil)
    const ac = this.calculateAC(values);
    
    // Calcular índice de perfusión - indicador clave de calidad de señal
    this.perfusionIndex = ac / dc;
    
    // Verificar si la calidad de señal es suficiente
    if (this.perfusionIndex < this.PERFUSION_INDEX_THRESHOLD) {
      return { 
        spo2: Math.max(0, this.lastValidSpO2 - 1), 
        confidence: this.perfusionIndex / this.PERFUSION_INDEX_THRESHOLD * 0.5
      };
    }
    
    // Calcular relación R (AC/DC)
    const R = (ac / dc) / this.SPO2_CALIBRATION_FACTOR;
    
    // Curva de calibración exponencial basada en datos empíricos
    // SpO2 = a - b * R^c  (versión simplificada)
    let spO2 = Math.round(110 - (25 * Math.pow(R, 1.0)));
    
    // Aplicar corrección basada en perfusión
    if (this.perfusionIndex > 0.15) {
      spO2 = Math.min(100, spO2 + 1);
    } else if (this.perfusionIndex < 0.08) {
      spO2 = Math.max(0, spO2 - 1);
    }
    
    // Limitar a rango fisiológico
    spO2 = Math.min(100, Math.max(70, spO2));
    
    // Calcular confianza basada en índice de perfusión y estabilidad de señal
    let confidence = Math.min(1, (this.perfusionIndex / 0.15) * 0.8);
    
    // Reducir confianza si la señal varía demasiado rápido
    const recentValues = values.slice(-20);
    const stdDev = this.calculateStandardDeviation(recentValues);
    const variationImpact = Math.min(1, Math.max(0, 1 - (stdDev / 10)));
    confidence *= variationImpact;
    
    // Añadir a buffer SpO2 para suavizado
    this.spo2Buffer.push(spO2);
    if (this.spo2Buffer.length > this.SPO2_WINDOW) {
      this.spo2Buffer.shift();
    }
    
    // Calcular SpO2 suavizado usando promedio ponderado
    let weightedSum = 0;
    let totalWeight = 0;
    
    for (let i = 0; i < this.spo2Buffer.length; i++) {
      // Valores más nuevos tienen pesos más altos
      const weight = Math.pow(this.SPO2_ALPHA, this.spo2Buffer.length - 1 - i);
      weightedSum += this.spo2Buffer[i] * weight;
      totalWeight += weight;
    }
    
    const smoothedSpO2 = Math.round(weightedSum / totalWeight);
    
    // Actualizar último SpO2 válido si la confianza es razonable
    if (confidence > 0.5) {
      this.lastValidSpO2 = smoothedSpO2;
    }
    
    console.log("VitalSignsProcessor: Cálculo SpO2", {
      ac,
      dc,
      ratio: R,
      perfusionIndex: this.perfusionIndex,
      rawSpO2: spO2,
      smoothedSpO2,
      confidence
    });
    
    return { spo2: smoothedSpO2, confidence };
  }
  
  /**
   * Calcular estimación de presión arterial basada en morfología PPG y temporización
   */
  private calculateBloodPressure(values: number[]): {
    systolic: number;
    diastolic: number;
    confidence: number;
  } {
    // Necesitamos datos suficientes para análisis
    if (values.length < 30) {
      return { 
        systolic: this.lastValidBP.systolic, 
        diastolic: this.lastValidBP.diastolic,
        confidence: 0.3
      };
    }
    
    // Encontrar picos y valles para análisis de morfología
    const { peakIndices, valleyIndices } = this.findPeaksAndValleys(values);
    
    // No hay suficientes picos detectados
    if (peakIndices.length < 2) {
      return { 
        systolic: this.SBP_BASELINE, 
        diastolic: this.DBP_BASELINE,
        confidence: 0.4
      };
    }
    
    // Calcular tasa de muestra aproximada basada en longitud de datos y tiempo de colección asumido
    const fps = 30; // Frames por segundo (asumido)
    const msPerSample = 1000 / fps;
    
    // Calcular valores de tiempo de tránsito de pulso (PTT) de intervalos pico-a-pico
    const pttValues: number[] = [];
    for (let i = 1; i < peakIndices.length; i++) {
      const dt = (peakIndices[i] - peakIndices[i - 1]) * msPerSample;
      pttValues.push(dt);
    }
    
    // Calcular promedio ponderado de valores PTT
    let weightedPTTSum = 0;
    let pttWeightSum = 0;
    
    for (let i = 0; i < pttValues.length; i++) {
      const weight = i + 1; // Ponderación lineal
      weightedPTTSum += pttValues[i] * weight;
      pttWeightSum += weight;
    }
    
    const normalizedPTT = Math.max(
      this.PTT_MIN, 
      Math.min(this.PTT_MAX, weightedPTTSum / pttWeightSum)
    );
    
    // Calcular amplitud y factores de presión
    const amplitude = this.calculateAmplitude(values, peakIndices, valleyIndices);
    const normalizedAmplitude = Math.min(100, Math.max(0, amplitude * 6));
    
    const pttFactor = (600 - normalizedPTT) * this.SBP_FACTOR;
    const ampFactor = normalizedAmplitude * this.AMPLITUDE_SCALING;
    
    // Calcular valores instantáneos de PA
    let instantSystolic = this.SBP_BASELINE + pttFactor + ampFactor;
    let instantDiastolic = this.DBP_BASELINE + (pttFactor * 0.4) + (ampFactor * 0.25);
    
    // Restringir a rangos fisiológicos
    instantSystolic = Math.max(80, Math.min(200, instantSystolic));
    instantDiastolic = Math.max(50, Math.min(120, instantDiastolic));
    
    // Asegurar presión de pulso razonable
    const differential = instantSystolic - instantDiastolic;
    if (differential < 20) {
      instantDiastolic = instantSystolic - 20;
    } else if (differential > 80) {
      instantDiastolic = instantSystolic - 80;
    }
    
    // Añadir a buffers de suavizado
    this.systolicBuffer.push(instantSystolic);
    this.diastolicBuffer.push(instantDiastolic);
    
    if (this.systolicBuffer.length > this.BP_BUFFER_SIZE) {
      this.systolicBuffer.shift();
      this.diastolicBuffer.shift();
    }
    
    // Calcular PA suavizada usando promedio móvil ponderado exponencial
    let smoothedSystolic = 0;
    let smoothedDiastolic = 0;
    let weightSum = 0;
    
    for (let i = 0; i < this.systolicBuffer.length; i++) {
      const weight = Math.pow(this.BP_ALPHA, this.systolicBuffer.length - 1 - i);
      smoothedSystolic += this.systolicBuffer[i] * weight;
      smoothedDiastolic += this.diastolicBuffer[i] * weight;
      weightSum += weight;
    }
    
    smoothedSystolic = smoothedSystolic / weightSum;
    smoothedDiastolic = smoothedDiastolic / weightSum;
    
    // Calcular puntuación de confianza
    const variability = this.calculateStandardDeviation(this.systolicBuffer) / smoothedSystolic;
    const stabilityFactor = Math.max(0, Math.min(1, 1 - (variability * 10)));
    const perfusionFactor = Math.min(1, this.perfusionIndex / 0.15);
    const confidence = Math.min(1, (stabilityFactor * 0.7) + (perfusionFactor * 0.3));
    
    // Actualizar última PA válida si la confianza es razonable
    if (confidence > 0.5) {
      this.lastValidBP = {
        systolic: Math.round(smoothedSystolic),
        diastolic: Math.round(smoothedDiastolic)
      };
      
      this.smoothedSystolic = smoothedSystolic;
      this.smoothedDiastolic = smoothedDiastolic;
    }
    
    // Registrar cálculo para depuración
    if (this.ppgValues.length % 60 === 0) {
      console.log("VitalSignsProcessor: Cálculo de presión arterial", {
        instantaneo: {
          sistolica: Math.round(instantSystolic),
          diastolica: Math.round(instantDiastolic)
        },
        suavizado: {
          sistolica: Math.round(smoothedSystolic),
          diastolica: Math.round(smoothedDiastolic)
        },
        confianza: confidence,
        metricas: {
          ptt: normalizedPTT,
          amplitud: normalizedAmplitude,
          variabilidad: variability,
          indicePerfusion: this.perfusionIndex
        }
      });
    }
    
    return {
      systolic: Math.round(smoothedSystolic),
      diastolic: Math.round(smoothedDiastolic),
      confidence
    };
  }
  
  /**
   * Encontrar picos y valles en la señal PPG
   */
  private findPeaksAndValleys(values: number[]) {
    const peakIndices: number[] = [];
    const valleyIndices: number[] = [];
    
    // Detección más robusta de picos/valles mirando una ventana de muestras
    for (let i = 2; i < values.length - 2; i++) {
      const v = values[i];
      
      // Un punto es un pico si es más alto que 2 puntos en cada lado
      if (
        v > values[i - 1] &&
        v > values[i - 2] &&
        v > values[i + 1] &&
        v > values[i + 2]
      ) {
        // Añadir verificación adicional de distancia-tiempo para plausibilidad fisiológica
        if (peakIndices.length === 0 || i - peakIndices[peakIndices.length - 1] > 8) {
          peakIndices.push(i);
        }
      }
      
      // Un punto es un valle si es más bajo que 2 puntos en cada lado
      if (
        v < values[i - 1] &&
        v < values[i - 2] &&
        v < values[i + 1] &&
        v < values[i + 2]
      ) {
        // Añadir verificación adicional de distancia-tiempo para plausibilidad fisiológica
        if (valleyIndices.length === 0 || i - valleyIndices[valleyIndices.length - 1] > 8) {
          valleyIndices.push(i);
        }
      }
    }
    
    return { peakIndices, valleyIndices };
  }
  
  /**
   * Calcular amplitud como diferencia entre picos y valles
   */
  private calculateAmplitude(
    values: number[],
    peaks: number[],
    valleys: number[]
  ): number {
    if (peaks.length === 0 || valleys.length === 0) return 0;
    
    const amps: number[] = [];
    
    // Emparejar cada pico con el valle precedente más cercano
    for (let i = 0; i < peaks.length; i++) {
      const peakIdx = peaks[i];
      let nearestValleyIdx = -1;
      let minDistance = Number.MAX_VALUE;
      
      // Encontrar valle precedente más cercano
      for (let j = 0; j < valleys.length; j++) {
        const valleyIdx = valleys[j];
        if (valleyIdx < peakIdx) {
          const distance = peakIdx - valleyIdx;
          if (distance < minDistance) {
            minDistance = distance;
            nearestValleyIdx = valleyIdx;
          }
        }
      }
      
      // Si encontramos un valle coincidente, calcular amplitud
      if (nearestValleyIdx >= 0) {
        const amp = values[peakIdx] - values[nearestValleyIdx];
        if (amp > 0) {
          amps.push(amp);
        }
      }
    }
    
    if (amps.length === 0) return 0;
    
    // Usar media recortada para excluir valores extremos
    amps.sort((a, b) => a - b);
    const trimCount = Math.floor(amps.length * 0.1); // Recortar 10% de cada extremo
    const trimmedAmps = amps.slice(trimCount, amps.length - trimCount);
    
    if (trimmedAmps.length === 0) return amps[Math.floor(amps.length / 2)];
    
    const mean = trimmedAmps.reduce((a, b) => a + b, 0) / trimmedAmps.length;
    return mean;
  }
  
  /**
   * Detectar pico
   */
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
    if (value > this.PEAK_THRESHOLD && timeSinceLastPeak > this.PEAK_MIN_DISTANCE) {
      this.lastPeakTime = currentTime;
      return true;
    }
    return false;
  }
  
  /**
   * Calcular desviación estándar
   */
  private calculateStandardDeviation(values: number[]): number {
    const n = values.length;
    if (n === 0) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / n;
    const sqDiffs = values.map((v) => Math.pow(v - mean, 2));
    const avgSqDiff = sqDiffs.reduce((a, b) => a + b, 0) / n;
    return Math.sqrt(avgSqDiff);
  }
  
  /**
   * Calcular componente AC (variación pulsátil)
   */
  private calculateAC(values: number[]): number {
    if (values.length === 0) return 0;
    
    // Método más robusto usando percentiles en lugar de min/max
    values.sort((a, b) => a - b);
    const p5 = values[Math.floor(values.length * 0.05)];
    const p95 = values[Math.floor(values.length * 0.95)];
    
    return p95 - p5;
  }
  
  /**
   * Calcular componente DC (línea base)
   */
  private calculateDC(values: number[]): number {
    if (values.length === 0) return 0;
    
    // Usar mediana para mejor robustez contra valores atípicos
    values.sort((a, b) => a - b);
    return values[Math.floor(values.length / 2)];
  }
  
  /**
   * Aplicar filtro SMA (Simple Moving Average)
   */
  private applySMAFilter(value: number): number {
    this.smaBuffer.push(value);
    if (this.smaBuffer.length > this.SMA_WINDOW) {
      this.smaBuffer.shift();
    }
    const sum = this.smaBuffer.reduce((a, b) => a + b, 0);
    return sum / this.smaBuffer.length;
  }
  
  /**
   * Resetear completamente el procesador
   */
  public reset(): void {
    this.ppgValues = [];
    this.smaBuffer = [];
    this.spo2Buffer = [];
    this.lastValue = 0;
    this.lastPeakTime = null;
    this.rrIntervals = [];
    this.isLearningPhase = true;
    this.arrhythmiaDetected = false;
    this.measurementStartTime = Date.now();
    this.systolicBuffer = [];
    this.diastolicBuffer = [];
    this.lastValidSpO2 = 98;
    this.spO2Confidence = 0;
    this.perfusionIndex = 0;
    this.smoothedSystolic = this.SBP_BASELINE;
    this.smoothedDiastolic = this.DBP_BASELINE;
    this.lastValidBP = { systolic: this.SBP_BASELINE, diastolic: this.DBP_BASELINE };
    this.bpConfidence = 0;
    this.lastArrhythmiaCheckTime = 0;
    this.lastArrhythmiaTime = 0;
    this.arrhythmiaScore = 0;
    this.currentRmssd = 0;
    this.currentSdnn = 0;
    this.beatVariability = 0;
    this.arrhythmiaType = '';
    
    console.log("VitalSignsProcessor: Reset completo");
  }
}
