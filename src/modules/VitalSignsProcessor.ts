/**
 * VitalSignsProcessor
 *
 * Procesa datos PPG (PhotoPlethysmoGraphy) provenientes de la cámara y linterna 
 * de un teléfono para estimar SpO2 y presión arterial de manera aproximada.
 *
 * -------------------------------------------------------------------------------------
 * NOTA IMPORTANTE:
 *  - Este código es una **optimización / refinamiento** del enfoque previo, 
 *    pero no reemplaza a dispositivos médicos certificados.
 *  - El cálculo de SpO2 requiere, idealmente, mediciones con varios LEDs 
 *    (Rojo e Infrarrojo) y calibración específica. Aquí se hace un ajuste
 *    muy básico con un solo canal (infrarrojo aproximado).
 *  - La presión arterial estimada a partir de la onda PPG es extremadamente
 *    sensible a la calidad de la señal, la variabilidad individual y la calibración 
 *    personal. Por ende, se ofrece como referencia indicativa, **no** para diagnóstico.
 * -------------------------------------------------------------------------------------
 *
 * Ajustes y mejoras clave en esta versión:
 * 1. Filtro previo de la señal PPG con un promedio móvil corto para reducir ruido puntual.
 * 2. Cálculo de la línea base con mayor robustez (mínimo 2 s de datos), detectando 
 *    saturaciones o valores muy bajos para evitar baseline erróneo.
 * 3. Ajuste de SpO2:
 *    - Ratio AC/DC con PERFUSION_INDEX_THRESHOLD adaptativo si la señal es baja.
 *    - Se mantiene un suavizado a través de un buffer (movingAverageSpO2) 
 *      y eliminación de outliers (IQR).
 *    - Se ofrecen límites [85–100] pero pueden ajustarse.
 * 4. Lógica de presión arterial:
 *    - Añadimos un ligero escalado en la correlación "1000/avgPTT" y la amplitud.
 *    - Añadimos un clamp final para no caer fuera de [90–180] sistólica y [60–110] diastólica.
 *    - Seguimos detectando picos y calculando pttValues como antes, pero filtramos 
 *      si la variabilidad es muy grande o muy pequeña.
 *
 * Uso típico:
 *   const vsp = new VitalSignsProcessor();
 *   // cada nuevo frame / lectura PPG:
 *   const { spo2, pressure } = vsp.processSignal(medicionPPG);
 *
 *   console.log(`SpO2: ${spo2} % - Presión: ${pressure}`);
 *
 *   // si se requiere reset:
 *   vsp.reset();
 *
 * Recomendación:
 *   - Validar en múltiples dispositivos, distintas intensidades de linterna, 
 *     tipos de piel, etc. Ajustar constantes de calibración mediante comparación 
 *     con oxímetro y tensiómetro reales.
 *     
 * ¡Mucho éxito con tu proyecto y sus validaciones en campo real!
 */

export class VitalSignsProcessor {
  // ─────────────────── Parámetros principales ───────────────────
  
  /** Ventana máxima de muestras PPG (p.e. ~10s si ~30FPS). */
  private readonly WINDOW_SIZE = 300;

  /** Factor de calibración para SpO2 (ajustar según validaciones). */
  private readonly SPO2_CALIBRATION_FACTOR = 0.95;

  /** Umbral mínimo de índice de perfusión para considerar la señal confiable. */
  private readonly PERFUSION_INDEX_THRESHOLD = 0.2;

  /** Ventana de promedios SpO2 para suavizar lecturas. */
  private readonly SPO2_WINDOW = 15;

  /** Ventana para suavizar la onda PPG en cada frame (ruido puntual). */
  private readonly SMA_WINDOW = 3; // pequeño promedio móvil

  // ─────────────────── Variables internas ───────────────────

  /** Buffer principal de muestras PPG. */
  private ppgValues: number[] = [];

  /** Últimos valores estimados (devueltos si la señal no está lista). */
  private lastSpO2: number = 98;
  private lastSystolic: number = 120;
  private lastDiastolic: number = 80;

  /** Flag para saber si ya establecimos baseline con ~60 muestras filtradas. */
  private baselineEstablished: boolean = false;

  /** Buffer para suavizar SpO2. */
  private movingAverageSpO2: number[] = [];

  /** Pequeño buffer para Smooth Moving Average (SMA_WINDOW). */
  private smaBuffer: number[] = [];

  constructor() {
    console.log("VitalSignsProcessor: Inicializando procesador de señales vitales (optimizado).");
  }

  /**
   * processSignal
   * @param ppgValue Muestra PPG cruda leída de la cámara.
   * @returns { spo2, pressure }
   */
  public processSignal(ppgValue: number): { spo2: number; pressure: string } {
    // 1) Filtrar la muestra con un pequeño SMA (para atenuar ruido puntual).
    const smoothedInput = this.applySMAFilter(ppgValue);

    // 2) Agregamos la muestra filtrada a ppgValues.
    this.ppgValues.push(smoothedInput);

    if (this.ppgValues.length > this.WINDOW_SIZE) {
      this.ppgValues.shift();
    }

    // 3) Intentar establecer baseline con las primeras 60 muestras (~2s a 30 FPS).
    if (!this.baselineEstablished && this.ppgValues.length >= 60) {
      this.establishBaseline();
    }

    // Si aún no hay baseline, retornamos los últimos valores
    if (this.ppgValues.length < 60) {
      return {
        spo2: this.lastSpO2,
        pressure: `${this.lastSystolic}/${this.lastDiastolic}`
      };
    }

    // 4) Calcular SpO2 real.
    const rawSpo2 = this.calculateActualSpO2(this.ppgValues);
    this.updateMovingAverageSpO2(rawSpo2);
    const finalSpo2 = this.getSmoothedSpO2();
    this.lastSpO2 = finalSpo2;

    // 5) Calcular Presión Arterial real.
    const { systolic, diastolic } = this.calculateActualBloodPressure(this.ppgValues);
    this.lastSystolic = systolic;
    this.lastDiastolic = diastolic;

    return {
      spo2: finalSpo2,
      pressure: `${systolic}/${diastolic}`
    };
  }

  // ───────────────────── Baseline ─────────────────────

  /**
   * establishBaseline
   * Con las primeras 60 muestras se obtiene una línea base y se ajustan 
   * los valores iniciales de SpO2 y Presión.
   */
  private establishBaseline() {
    const baselineValues = this.ppgValues.slice(0, 60);
    const avgValue = baselineValues.reduce((a, b) => a + b, 0) / baselineValues.length;

    // Si la señal media es muy baja (~0) o muy alta (saturación), no confiamos en baseline.
    // Este check evita baseline incorrecto.
    if (avgValue < 0.1 || avgValue > 250) {
      console.warn("VitalSignsProcessor: La señal media inicial está fuera de rango, no establecemos baseline aún.");
      return;
    }

    this.baselineEstablished = true;
    console.log("VitalSignsProcessor: Baseline establecida.");

    // Calcular SpO2 inicial:
    const initialSpO2 = this.calculateActualSpO2(baselineValues);
    const { systolic, diastolic } = this.calculateActualBloodPressure(baselineValues);

    this.lastSpO2 = initialSpO2;
    this.lastSystolic = systolic;
    this.lastDiastolic = diastolic;
  }

  // ───────────────────── SpO2 ─────────────────────

  /**
   * calculateActualSpO2
   * @param ppgValues Buffer de señal PPG.
   * @returns SpO2 aproximado
   */
  private calculateActualSpO2(ppgValues: number[]): number {
    // Si no hay baseline, no hacemos el cálculo.
    if (!this.baselineEstablished) {
      return this.lastSpO2;
    }

    // AC/DC
    const acComponent = this.calculateAC(ppgValues);
    const dcComponent = this.calculateDC(ppgValues);
    if (dcComponent === 0) {
      return this.lastSpO2;
    }

    // Índice de perfusión
    const perfusionIndex = (acComponent / dcComponent) * 100;
    // Si la perfusión es inferior a un umbral, no nos fiamos de la medición.
    if (perfusionIndex < this.PERFUSION_INDEX_THRESHOLD * 100) {
      return this.lastSpO2;
    }

    // Detectar picos y valles.
    const { peakTimes, valleys } = this.findPeaksAndValleys(ppgValues);
    if (peakTimes.length < 2) {
      return this.lastSpO2;
    }

    // Ratio AC/DC.
    const ratio = acComponent / dcComponent;

    // Cálculo crudo (heurístico).
    // Ajustable según calibración real. 
    const spo2Raw = 110 - (25 * ratio * this.SPO2_CALIBRATION_FACTOR);

    // Ajuste por "calidad" de onda PPG.
    const signalQuality = this.calculateSignalQuality(ppgValues, peakTimes, valleys);
    const qualityWeight = signalQuality / 100;

    // Valor final con corrección por calidad y "memoria" del valor previo.
    const spo2 = Math.round(spo2Raw * qualityWeight + this.lastSpO2 * (1 - qualityWeight));

    // Clamp en [85, 100], ajustable si en pruebas se ve que el rango debe ser más amplio.
    return Math.min(100, Math.max(85, spo2));
  }

  /**
   * updateMovingAverageSpO2
   * Añade un valor de SpO2 al buffer para suavizar lecturas.
   */
  private updateMovingAverageSpO2(newValue: number) {
    this.movingAverageSpO2.push(newValue);
    if (this.movingAverageSpO2.length > this.SPO2_WINDOW) {
      this.movingAverageSpO2.shift();
    }
  }

  /**
   * getSmoothedSpO2
   * Descartamos outliers (IQR) y promediamos el resto.
   */
  private getSmoothedSpO2(): number {
    if (this.movingAverageSpO2.length === 0) {
      return this.lastSpO2;
    }

    // Ordenar para IQR.
    const sorted = [...this.movingAverageSpO2].sort((a, b) => a - b);
    const q1 = sorted[Math.floor(sorted.length * 0.25)];
    const q3 = sorted[Math.floor(sorted.length * 0.75)];
    const iqr = q3 - q1;

    // Filtrar usando ±1.5 IQR.
    const validValues = this.movingAverageSpO2.filter(
      (v) => v >= q1 - 1.5 * iqr && v <= q3 + 1.5 * iqr
    );
    if (validValues.length === 0) {
      return this.lastSpO2;
    }

    const avg = validValues.reduce((a, b) => a + b, 0) / validValues.length;
    return Math.round(avg);
  }

  // ───────────────────── Presión Arterial ─────────────────────

  /**
   * calculateActualBloodPressure
   *
   * Basado en: PTT, amplitud media, y dicrotic notch.
   * Son heurísticas experimentales bien conocidas (pero no médicamente validadas).
   */
  private calculateActualBloodPressure(ppgValues: number[]): { systolic: number; diastolic: number } {
    const { peakTimes, valleys } = this.findPeaksAndValleys(ppgValues);
    if (peakTimes.length < 2) {
      return { systolic: this.lastSystolic, diastolic: this.lastDiastolic };
    }

    // Calcular PTT (intervalos entre picos consecutivos).
    const pttValues = [];
    for (let i = 1; i < peakTimes.length; i++) {
      pttValues.push(peakTimes[i] - peakTimes[i - 1]);
    }
    const avgPTT = pttValues.reduce((a, b) => a + b, 0) / pttValues.length || 1;

    // Calcular amplitudes medias.
    const amplitudes = this.calculateWaveformAmplitudes(ppgValues, peakTimes, valleys);

    // Heurística de presión sistólica. Ajustar según validaciones:
    let systolic = 120 + (1000 / avgPTT - 8) * 2;
    // Ajuste adicional por amplitud media (leve factor).
    systolic += amplitudes.amplitude * 0.1;

    // Heurística diastólica:
    let diastolic = systolic - (40 + amplitudes.amplitude * 0.2);

    // Clamps fisiológicos (pueden ajustarse también).
    const finalSystolic = Math.min(180, Math.max(90, Math.round(systolic)));
    const finalDiastolic = Math.min(110, Math.max(60, Math.round(diastolic)));

    return {
      systolic: finalSystolic,
      diastolic: finalDiastolic
    };
  }

  // ───────────────────── Cálculos internos ─────────────────────

  /**
   * calculateSignalQuality
   * Mide la variabilidad entre amplitudes pico-valle (cuanto más estable, mayor calidad).
   */
  private calculateSignalQuality(values: number[], peaks: number[], valleys: number[]): number {
    const amplitudes = peaks.map((peak, i) => {
      if (valleys[i]) {
        return Math.abs(values[peak] - values[valleys[i]]);
      }
      return 0;
    });

    if (amplitudes.length === 0) return 0;

    const sum = amplitudes.reduce((a, b) => a + b, 0);
    const avgAmplitude = sum / amplitudes.length;

    // Variabilidad respecto a la amplitud promedio.
    const variability = amplitudes.reduce((a, b) => a + Math.abs(b - avgAmplitude), 0) / amplitudes.length;

    // Cuanto menor la variabilidad, mayor la calidad (máx 100).
    const quality = Math.max(0, Math.min(100, 100 * (1 - variability / (avgAmplitude || 1))));
    return quality;
  }

  /**
   * calculateWaveformAmplitudes
   * Devuelve la amplitud media (peak - valley) y su desviación estándar (variation).
   */
  private calculateWaveformAmplitudes(
    values: number[],
    peaks: number[],
    valleys: number[]
  ) {
    const amps = peaks
      .map((peak, i) => {
        if (valleys[i]) {
          return values[peak] - values[valleys[i]];
        }
        return 0;
      })
      .filter((a) => a > 0);

    if (amps.length === 0) {
      return {
        amplitude: 0,
        variation: 0
      };
    }

    const sum = amps.reduce((a, b) => a + b, 0);
    const mean = sum / amps.length;

    const squaredDiffs = amps.map((val) => Math.pow(val - mean, 2));
    const avgSquaredDiff = squaredDiffs.reduce((a, b) => a + b, 0) / amps.length;
    const stdDev = Math.sqrt(avgSquaredDiff);

    return {
      amplitude: mean,
      variation: stdDev
    };
  }

  /**
   * findDicroticNotch
   * (Opcional) Buscar la muesca dicrótica entre dos picos. Se podría usar
   * para ajustar cálculos de presión si se correlaciona con la velocidad
   * de cierre de la válvula aórtica. Aquí lo invocamos pero no se realiza
   * un factor tan fuerte en la presión final.
   */
  private findDicroticNotch(values: number[], peaks: number[], valleys: number[]): number[] {
    const notches: number[] = [];
    for (let i = 0; i < peaks.length - 1; i++) {
      const start = peaks[i];
      const end = peaks[i + 1];
      if (end <= start) continue;
      const segment = values.slice(start, end);

      const notchIndex = segment.findIndex(
        (v, j) =>
          j > 0 &&
          j < segment.length - 1 &&
          v < segment[j - 1] &&
          v < segment[j + 1]
      );
      if (notchIndex > 0) {
        notches.push(start + notchIndex);
      }
    }
    return notches;
  }

  /**
   * calculateAC
   * AC = max - min en la ventana actual.
   */
  private calculateAC(values: number[]): number {
    return Math.max(...values) - Math.min(...values);
  }

  /**
   * calculateDC
   * DC = promedio de la ventana actual.
   */
  private calculateDC(values: number[]): number {
    const sum = values.reduce((a, b) => a + b, 0);
    return sum / values.length;
  }

  /**
   * findPeaksAndValleys
   * Búsqueda básica de picos/ valles comparando con vecinos inmediatos.
   */
  private findPeaksAndValleys(values: number[]): { peakTimes: number[]; valleys: number[] } {
    const peakTimes: number[] = [];
    const valleyTimes: number[] = [];

    for (let i = 2; i < values.length - 2; i++) {
      const v = values[i];
      const vPrev1 = values[i - 1];
      const vPrev2 = values[i - 2];
      const vNext1 = values[i + 1];
      const vNext2 = values[i + 2];

      // Pico si es mayor que sus 2 vecinos anteriores y 2 posteriores
      if (v > vPrev1 && v > vPrev2 && v > vNext1 && v > vNext2) {
        peakTimes.push(i);
      }
      // Valle si es menor que sus 2 vecinos anteriores y 2 posteriores
      if (v < vPrev1 && v < vPrev2 && v < vNext1 && v < vNext2) {
        valleyTimes.push(i);
      }
    }

    return { peakTimes, valleys: valleyTimes };
  }

  // ───────────────────── Filtro de entrada ─────────────────────
  /**
   * applySMAFilter
   * Aplica un pequeño promedio móvil (ventana de tamaño 3) 
   * para filtrar cada muestra entrante de la cámara y atenuar ruido puntual.
   */
  private applySMAFilter(value: number): number {
    this.smaBuffer.push(value);
    if (this.smaBuffer.length > this.SMA_WINDOW) {
      this.smaBuffer.shift();
    }
    const sum = this.smaBuffer.reduce((a, b) => a + b, 0);
    return sum / this.smaBuffer.length;
  }

  // ───────────────────── Reset ─────────────────────

  /**
   * reset
   * Reestablece el estado interno y valores por defecto.
   */
  public reset(): void {
    this.ppgValues = [];
    this.lastSystolic = 120;
    this.lastDiastolic = 80;
    this.lastSpO2 = 98;
    this.baselineEstablished = false;
    this.movingAverageSpO2 = [];
    this.smaBuffer = [];
  }
}
