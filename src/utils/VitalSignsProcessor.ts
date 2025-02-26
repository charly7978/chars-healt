export class VitalSignsProcessor {
  // ─────────── PARÁMETROS DE CONFIGURACIÓN ───────────
  // Parámetros generales de procesamiento
  private readonly WINDOW_SIZE = 300; // 10 segundos a 30fps
  private readonly SMA_WINDOW = 5; // Suavizado de señal
  private readonly HR_BASELINE_TIME = 10000; // 10 segundos para establecer línea base
  
  // Parámetros de cálculo de SpO2
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
  
  // Debug mode para diagnóstico
  private readonly DEBUG_MODE = true;
  
  // ─────────── VARIABLES DE ESTADO ───────────
  // Buffers de señal
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
  
  // Constructor
  constructor() {
    this.reset();
  }
  
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
      arrhythmiaType?: string;
    }
  ): {
    spo2: number;
    pressure: string;
    arrhythmiaStatus: string;
    lastArrhythmiaData: {
      timestamp: number;
      rmssd: number;
      rrVariation: number;
      type?: string;
    } | null;
  } {
    // Verificar valores inválidos
    if (ppgValue === undefined || ppgValue === null || isNaN(ppgValue)) {
      if (this.DEBUG_MODE) {
        console.warn("VitalSignsProcessor: Valor PPG inválido", { ppgValue });
      }
      ppgValue = 0;
    }
    
    // Registrar cada 30ª muestra para depuración
    if (this.DEBUG_MODE && this.ppgValues.length % 90 === 0) {
      console.log("VitalSignsProcessor: Procesamiento de señal", {
        isLearning: this.isLearningPhase,
        rrIntervals: this.rrIntervals.length,
        arrhythmiaDetected: this.arrhythmiaDetected,
        arrhythmiaScore: this.arrhythmiaScore,
        perfusionIndex: this.perfusionIndex,
        receivedRRData: !!rrData
      });
    }
    
    // Aplicar filtrado de primer nivel
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
        
        // Usar tipo de arritmia del procesador de latidos
        if (rrData.arrhythmiaType) {
          this.arrhythmiaType = rrData.arrhythmiaType;
        }
        
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
        const arrCount = this.arrhythmiaScore > 50 ? Math.ceil(this.arrhythmiaScore / 20) : 1;
        arrhythmiaStatus = this.arrhythmiaType 
          ? `ARRITMIA DETECTADA: ${this.arrhythmiaType}|${arrCount}` 
          : `ARRITMIA DETECTADA|${arrCount}`;
        this.lastArrhythmiaTime = currentTime;
      } else {
        arrhythmiaStatus = "SIN ARRITMIAS|0";
      }
    } else {
      arrhythmiaStatus = "CALIBRANDO...|0";
    }
    
    // Preparar datos de arritmia brutos para visualización
    const lastArrhythmiaData = this.arrhythmiaDetected && this.currentRmssd > 0 ? {
      timestamp: currentTime,
      rmssd: this.currentRmssd,
      rrVariation: this.beatVariability,
      type: this.arrhythmiaType
    } : null;
    
    return {
      spo2,
      pressure: pressureString,
      arrhythmiaStatus,
      lastArrhythmiaData
    };
  }
  
  /**
   * Aplicar filtro de promedio móvil simple
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
   * Calcular componente DC (línea base) de una señal
   */
  private calculateDC(values: number[]): number {
    if (!values.length) return 0;
    return values.reduce((sum, val) => sum + val, 0) / values.length;
  }
  
  /**
   * Calcular componente AC (variación pulsátil) de una señal
   */
  private calculateAC(values: number[]): number {
    if (values.length < 3) return 0;
    
    const dc = this.calculateDC(values);
    let sumSquared = 0;
    
    for (const val of values) {
      sumSquared += Math.pow(val - dc, 2);
    }
    
    return Math.sqrt(sumSquared / values.length);
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
      if (this.DEBUG_MODE) {
        console.log("VitalSignsProcessor: Intervalos RR insuficientes para análisis de arritmia", {
          disponibles: this.rrIntervals.length,
          requeridos: this.RR_WINDOW_SIZE
        });
      }
      return;
    }
    
    // Obtener intervalos más recientes para análisis
    const recentRR = this.rrIntervals.slice(-this.RR_WINDOW_SIZE);
    
    // Calcular intervalo RR promedio y convertir a BPM
    const avgRR = recentRR.reduce((a, b) => a + b, 0) / recentRR.length;
    const currentBPM = 60000 / avgRR;
    
    // Calcular RMSSD - Root Mean Square of Successive Differences
    let sumSquaredDiff = 0;
    for (let i = 1; i < recentRR.length; i++) {
      const diff = recentRR[i] - recentRR[i - 1];
      sumSquaredDiff += diff * diff;
    }
    this.currentRmssd = Math.sqrt(sumSquaredDiff / (recentRR.length - 1));
    
    // Calcular SDNN - Desviación Estándar de intervalos NN
    const sumSquaredDeviation = recentRR.reduce((sum, interval) => {
      return sum + Math.pow(interval - avgRR, 2);
    }, 0);
    this.currentSdnn = Math.sqrt(sumSquaredDeviation / recentRR.length);
    
    // Calcular variación de latido como porcentaje
    this.beatVariability = (this.currentRmssd / avgRR) * 100;
    
    // Verificar latidos prematuros
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
      
      if (this.DEBUG_MODE) {
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
  }
  
  /**
   * Calcular SpO2 (saturación de oxígeno en sangre) a partir de señal PPG
   */
  private calculateSpO2(values: number[]): { spo2: number; confidence: number } {
    // Asegurar que tenemos suficientes datos
    if (values.length < this.SPO2_MINIMUM_SAMPLES) {
      return { 
        spo2: Math.max(93, this.lastValidSpO2 - 1), 
        confidence: 0.2 
      };
    }
    
    // Calcular componente DC (línea base)
    const dc = this.calculateDC(values);
    if (dc === 0) {
      return { 
        spo2: Math.max(93, this.lastValidSpO2 - 1), 
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
        spo2: Math.max(93, this.lastValidSpO2 - 1), 
        confidence: this.perfusionIndex / this.PERFUSION_INDEX_THRESHOLD * 0.5
      };
    }
    
    // Calcular relación R (AC/DC)
    const R = (ac / dc) / this.SPO2_CALIBRATION_FACTOR;
    
    // Curva de calibración basada en datos empíricos
    let spo2 = Math.round(110 - (25 * Math.pow(R, 1.0)));
    
    // Aplicar corrección basada en perfusión
    if (this.perfusionIndex > 0.15) {
      spo2 = Math.min(100, spo2 + 1);
    } else if (this.perfusionIndex < 0.08) {
      spo2 = Math.max(93, spo2 - 1);
    }
    
    // Limitar a rango fisiológico
    spo2 = Math.min(100, Math.max(93, spo2));
    
    // Calcular confianza basada en perfusión y calidad de señal
    let confidence = Math.min(1.0, this.perfusionIndex / (this.PERFUSION_INDEX_THRESHOLD * 2));
    
    // Aplicar smoothing para prevenir saltos
    this.spo2Buffer.push(spo2);
    if (this.spo2Buffer.length > this.SPO2_WINDOW) {
      this.spo2Buffer.shift();
    }
    
    // Promedio simple para estabilizar lectura
    const sum = this.spo2Buffer.reduce((a, b) => a + b, 0);
    const smoothedSpO2 = Math.round(sum / this.spo2Buffer.length);
    
    // Solo actualizar valor válido si tenemos suficiente confianza
    if (confidence > 0.4) {
      this.lastValidSpO2 = smoothedSpO2;
    }
    
    return { 
      spo2: this.lastValidSpO2, 
      confidence 
    };
  }
  
  /**
   * Calcular presión arterial basada en morfología de la onda PPG
   */
  private calculateBloodPressure(values: number[]): { 
    systolic: number; 
    diastolic: number; 
    confidence: number 
  } {
    // Si no hay datos recientes o suficientes, devolver valores predeterminados
    if (values.length < 30 || !this.lastPeakTime) {
      return {
        systolic: this.lastValidBP.systolic,
        diastolic: this.lastValidBP.diastolic,
        confidence: 0.1
      };
    }
    
    // Análisis de la morfología de la onda PPG (simplificado)
    // En un sistema real, esto requeriría calibración previa y algoritmos avanzados
    
    // Encontrar amplitud máxima de la señal
    const min = Math.min(...values);
    const max = Math.max(...values);
    const amplitude = max - min;
    
    // Calcular la presión en base a intervalos RR y amplitud
    let systolic = 0;
    let diastolic = 0;
    
    if (this.rrIntervals.length >= 5) {
      // Usar los últimos intervalos RR para estimar
      const recentRR = this.rrIntervals.slice(-5);
      const avgRR = recentRR.reduce((a, b) => a + b, 0) / recentRR.length;
      
      // Calcular valores de tiempo de tránsito de pulso (PTT) de intervalos
      const pttValues: number[] = [];
      for (let i = 1; i < recentRR.length; i++) {
        pttValues.push(recentRR[i]);
      }
      
      // Calcular promedio ponderado de valores PTT
      let weightedPTT = 0;
      let weightSumPTT = 0;
      
      for (let i = 0; i < pttValues.length; i++) {
        const weight = i + 1; // Ponderación lineal
        weightedPTT += pttValues[i] * weight;
        weightSumPTT += weight;
      }
      
      if (weightSumPTT > 0) {
        weightedPTT = weightedPTT / weightSumPTT;
      }
      
      // Restringir PTT a rango fisiológico
      const normalizedPTT = Math.max(this.PTT_MIN, Math.min(this.PTT_MAX, weightedPTT || 0));
      
      // Factor de escala basado en amplitud - mayor amplitud = presión menor
      const scaleFactor = Math.max(0.8, 1.0 - (amplitude * this.AMPLITUDE_SCALING));
      
      // Mayor HR típicamente = presión mayor (sistólica)
      // Menor HR típicamente = presión menor (diastólica)
      systolic = Math.round(this.SBP_BASELINE + ((1 - (avgRR / 1000)) * 60 * this.SBP_FACTOR * scaleFactor));
      diastolic = Math.round(this.DBP_BASELINE + ((1 - (avgRR / 1000)) * 35 * this.DBP_FACTOR * scaleFactor));
    } else {
      // Si no hay suficientes intervalos, usar valores estándar
      systolic = this.SBP_BASELINE;
      diastolic = this.DBP_BASELINE;
    }
    
    // Aplicar restricciones fisiológicas
    systolic = Math.max(90, Math.min(180, systolic));
    diastolic = Math.max(50, Math.min(110, diastolic));
    
    // Asegurar que sistólica > diastólica
    if (systolic <= diastolic) {
      diastolic = Math.max(50, systolic - 30);
    }
    
    // Suavizado exponencial para evitar cambios bruscos
    this.systolicBuffer.push(systolic);
    this.diastolicBuffer.push(diastolic);
    
    if (this.systolicBuffer.length > this.BP_BUFFER_SIZE) {
      this.systolicBuffer.shift();
    }
    
    if (this.diastolicBuffer.length > this.BP_BUFFER_SIZE) {
      this.diastolicBuffer.shift();
    }
    
    // Añadir variables para cálculo ponderado
    let finalSystolic = 0;
    let finalDiastolic = 0;
    let weightSumBuffer = 0;
    
    for (let i = 0; i < this.systolicBuffer.length; i++) {
      const weight = Math.pow(this.BP_ALPHA, this.systolicBuffer.length - 1 - i);
      finalSystolic += this.systolicBuffer[i] * weight;
      finalDiastolic += this.diastolicBuffer[i] * weight;
      weightSumBuffer += weight;
    }
    
    finalSystolic = finalSystolic / weightSumBuffer;
    finalDiastolic = finalDiastolic / weightSumBuffer;
    
    // Promedios suavizados (usando finalSystolic y finalDiastolic)
    const systolicSum = this.systolicBuffer.reduce((a, b) => a + b, 0);
    const diastolicSum = this.diastolicBuffer.reduce((a, b) => a + b, 0);
    
    const avgSystolic = Math.round(systolicSum / this.systolicBuffer.length);
    const avgDiastolic = Math.round(diastolicSum / this.diastolicBuffer.length);
    
    // Actualizar valores suavizados
    this.smoothedSystolic = Math.round(this.smoothedSystolic * (1 - this.BP_ALPHA) + avgSystolic * this.BP_ALPHA);
    this.smoothedDiastolic = Math.round(this.smoothedDiastolic * (1 - this.BP_ALPHA) + avgDiastolic * this.BP_ALPHA);
    
    // Calcular confianza basada en cantidad de datos y estabilidad
    const confidence = Math.min(
      1.0,
      (this.rrIntervals.length / 20) * 
      (this.perfusionIndex / (this.PERFUSION_INDEX_THRESHOLD * 2))
    );
    
    // Actualizar valores válidos solo si confianza es suficiente
    if (confidence > 0.5) {
      this.lastValidBP = {
        systolic: this.smoothedSystolic,
        diastolic: this.smoothedDiastolic
      };
    }
    
    return {
      systolic: this.smoothedSystolic,
      diastolic: this.smoothedDiastolic,
      confidence
    };
  }
  
  /**
   * Reset completo del procesador
   */
  public reset(): void {
    this.ppgValues = [];
    this.smaBuffer = [];
    this.spo2Buffer = [];
    this.systolicBuffer = [];
    this.diastolicBuffer = [];
    this.rrIntervals = [];
    this.lastPeakTime = null;
    this.baselineRhythm = 0;
    this.isLearningPhase = true;
    this.arrhythmiaDetected = false;
    this.arrhythmiaType = '';
    this.measurementStartTime = Date.now();
    this.lastValidSpO2 = 98;
    this.spO2Confidence = 0;
    this.perfusionIndex = 0;
    this.smoothedSystolic = this.SBP_BASELINE;
    this.smoothedDiastolic = this.DBP_BASELINE;
    this.lastValidBP = { 
      systolic: this.SBP_BASELINE, 
      diastolic: this.DBP_BASELINE 
    };
    this.bpConfidence = 0;
    this.lastArrhythmiaCheckTime = 0;
    this.lastArrhythmiaTime = 0;
    this.arrhythmiaScore = 0;
    this.currentRmssd = 0;
    this.currentSdnn = 0;
    this.beatVariability = 0;
    
    console.log("VitalSignsProcessor: Sistema reseteado completamente");
  }
} 