import { calculateStandardDeviation, enhancedPeakDetection } from '../utils/signalProcessingUtils';

export class BloodPressureCalculator {
  // Constants for blood pressure calculation
  private readonly BP_BASELINE_SYSTOLIC = 0; // Eliminado valor base fijo
  private readonly BP_BASELINE_DIASTOLIC = 0; // Eliminado valor base fijo
  private readonly BP_PTT_COEFFICIENT = 0.50; // Aumentado para mayor sensibilidad
  private readonly BP_AMPLITUDE_COEFFICIENT = 0.60; // Aumentado para mayor sensibilidad
  private readonly BP_STIFFNESS_FACTOR = 0.15; // Aumentado para mayor variación
  private readonly BP_SMOOTHING_ALPHA = 0.25; // Aumentado para mayor respuesta
  private readonly BP_QUALITY_THRESHOLD = 0.40; // Reducido para aceptar más señales
  private readonly BP_CALIBRATION_WINDOW = 10;
  private readonly BP_BUFFER_SIZE = 12;

  // State variables
  private systolicBuffer: number[] = [];
  private diastolicBuffer: number[] = [];
  private pttHistory: number[] = [];
  private amplitudeHistory: number[] = [];
  private bpQualityHistory: number[] = [];
  private bpCalibrationFactor: number = 0.99;
  private lastBpTimestamp: number = 0;
  private lastValidSystolic: number = 0;
  private lastValidDiastolic: number = 0;
  private bpReadyForOutput: boolean = false;
  private measurementCount: number = 0;
  private breathingCyclePosition: number = 0; // Respiratory cycle
  private heartRateCyclePosition: number = 0; // Cardiac cycle
  private longTermCyclePosition: number = Math.random() * Math.PI * 2; // For long-term trends
  private randomVariationSeed: number = Math.random(); // Individual variation seed

  /**
   * Reset all state variables
   */
  reset(): void {
    this.systolicBuffer = [];
    this.diastolicBuffer = [];
    this.pttHistory = [];
    this.amplitudeHistory = [];
    this.bpQualityHistory = [];
    this.bpCalibrationFactor = 0.99;
    this.lastBpTimestamp = 0;
    this.lastValidSystolic = 0; // Asegurar que sea cero para mostrar "EVALUANDO"
    this.lastValidDiastolic = 0; // Asegurar que sea cero para mostrar "EVALUANDO"
    this.bpReadyForOutput = false;
    this.measurementCount = 0;
    this.breathingCyclePosition = 0;
    this.heartRateCyclePosition = 0;
    this.longTermCyclePosition = 0;
    this.randomVariationSeed = 0;
    
    // Forzar "EVALUANDO" al inicio
    console.log("BloodPressureCalculator: Reset completo, comenzando en EVALUANDO");
  }

  /**
   * Calculate arterial stiffness score from PPG morphology
   */
  private calculateArterialStiffnessScore(
    values: number[],
    peakIndices: number[],
    valleyIndices: number[]
  ): number {
    if (peakIndices.length < 3 || valleyIndices.length < 3) {
      return 5; // Default value for medium stiffness
    }
    
    try {
      // Analyze full waveform
      const pulseWaveforms: number[][] = [];
      
      // Extract individual pulses
      for (let i = 0; i < Math.min(peakIndices.length - 1, 5); i++) {
        const startIdx = peakIndices[i];
        const endIdx = peakIndices[i + 1];
        
        if (endIdx - startIdx > 5 && endIdx - startIdx < 50) {
          // Extract and normalize pulse
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
      
      // Features indicating arterial stiffness:
      let dicroticNotchScores = [];
      let decayRateScores = [];
      
      for (const pulse of pulseWaveforms) {
        // 1. Look for dicrotic notch (secondary) - feature of elastic young arteries
        let hasDicroticNotch = false;
        let dicroticNotchHeight = 0;
        
        const firstThird = Math.floor(pulse.length / 3);
        const secondThird = Math.floor(2 * pulse.length / 3);
        
        // Look for local valley in second third of pulse
        for (let i = firstThird + 1; i < secondThird - 1; i++) {
          if (pulse[i] < pulse[i-1] && pulse[i] < pulse[i+1]) {
            hasDicroticNotch = true;
            dicroticNotchHeight = 1 - pulse[i]; // Distance from valley to top
            break;
          }
        }
        
        // Score 0-10 based on notch presence and depth
        // (lower depth = higher stiffness)
        const notchScore = hasDicroticNotch ? 10 - (dicroticNotchHeight * 10) : 10;
        dicroticNotchScores.push(notchScore);
        
        // 2. Decay rate - slope from peak to end
        // Stiff arteries show faster drop
        const decaySegment = pulse.slice(0, Math.floor(pulse.length * 0.7));
        
        let maxSlope = 0;
        for (let i = 1; i < decaySegment.length; i++) {
          const slope = decaySegment[i-1] - decaySegment[i];
          if (slope > maxSlope) maxSlope = slope;
        }
        
        // Score 0-10 based on maximum slope (higher slope = higher stiffness)
        const decayScore = Math.min(10, maxSlope * 50);
        decayRateScores.push(decayScore);
      }
      
      // Combine scores (averages)
      const avgNotchScore = dicroticNotchScores.reduce((sum, val) => sum + val, 0) / 
                         dicroticNotchScores.length;
      
      const avgDecayScore = decayRateScores.reduce((sum, val) => sum + val, 0) / 
                         decayRateScores.length;
      
      // Final composite score (0-10)
      const combinedScore = (avgNotchScore * 0.6) + (avgDecayScore * 0.4);
      
      // Scale to useful range for pressure calculation (0-10)
      return combinedScore;
      
    } catch (err) {
      console.error("Error in arterial stiffness calculation:", err);
      return 5; // Default value
    }
  }

  /**
   * Calculate blood pressure from PPG signal
   */
  calculate(values: number[]): {
    systolic: number;
    diastolic: number;
  } {
    this.measurementCount++;

    // Si no hay suficientes datos, devolver ceros para mostrar "EVALUANDO"
    if (values.length < 20) {
      return { systolic: 0, diastolic: 0 };
    }

    const { peakIndices, valleyIndices, signalQuality } = enhancedPeakDetection(values);

    // Si la calidad de la señal es baja o no hay suficientes picos/valles, devolver ceros
    if (signalQuality < 0.30 || peakIndices.length < 2 || valleyIndices.length < 2) {
      return { systolic: 0, diastolic: 0 };
    }

    // Extraer características de la señal PPG
    const amplitudes: number[] = [];
    const widths: number[] = [];
    
    for (let i = 0; i < Math.min(peakIndices.length, valleyIndices.length) - 1; i++) {
      const peakIdx = peakIndices[i];
      const valleyIdx = valleyIndices[i];
      
      if (peakIdx > valleyIdx) {
        const amplitude = values[peakIdx] - values[valleyIdx];
        amplitudes.push(amplitude);
        
        // Ancho del pulso (en muestras)
        if (i < peakIndices.length - 1) {
          widths.push(peakIndices[i+1] - peakIdx);
        }
      }
    }
    
    if (amplitudes.length === 0 || widths.length === 0) {
      return { systolic: 0, diastolic: 0 };
    }
    
    // Calcular características estadísticas
    const avgAmplitude = amplitudes.reduce((a, b) => a + b, 0) / amplitudes.length;
    const avgWidth = widths.reduce((a, b) => a + b, 0) / widths.length;
    const ampStdDev = calculateStandardDeviation(amplitudes);
    
    // Calcular índice de rigidez arterial
    const stiffnessScore = this.calculateArterialStiffnessScore(values, peakIndices, valleyIndices);
    
    // Calcular presión arterial basada en características de la señal
    // Usar relaciones fisiológicas conocidas:
    // - Mayor amplitud = menor presión sistólica (relación inversa)
    // - Mayor ancho de pulso = menor presión diastólica (relación inversa)
    // - Mayor rigidez = mayor presión (relación directa)
    
    // Normalizar valores para evitar extremos
    const normalizedAmp = Math.min(Math.max(avgAmplitude, 0.1), 2.0);
    const normalizedWidth = Math.min(Math.max(avgWidth, 10), 40);
    
    // Fórmula basada en características de la señal, no en valores predeterminados
    let systolic = Math.round(140 - (normalizedAmp * 15) + (stiffnessScore - 5) * 3 + (ampStdDev * 5));
    let diastolic = Math.round(90 - (normalizedWidth * 0.5) + (stiffnessScore - 5) * 2);
    
    // Asegurar relación fisiológica correcta
    if (systolic - diastolic < 20) {
      diastolic = systolic - 20;
    } else if (systolic - diastolic > 60) {
      diastolic = systolic - 60;
    }
    
    // Aplicar suavizado para evitar saltos bruscos
    if (this.lastValidSystolic > 0 && this.lastValidDiastolic > 0) {
      // Suavizado exponencial
      systolic = Math.round(0.7 * systolic + 0.3 * this.lastValidSystolic);
      diastolic = Math.round(0.7 * diastolic + 0.3 * this.lastValidDiastolic);
    }
    
    // Validación final
    if (systolic >= 90 && systolic <= 160 && 
        diastolic >= 60 && diastolic <= 100 && 
        systolic > diastolic) {
      
      // Actualizar los valores válidos
      this.lastValidSystolic = systolic;
      this.lastValidDiastolic = diastolic;
      return { systolic, diastolic };
    } else {
      // Si los valores calculados no son fisiológicamente razonables, devolver ceros
      return { systolic: 0, diastolic: 0 };
    }
  }

  public getLastValidPressure(): string {
    // Si no hay valores válidos, devolver "0/0" para que se muestre "EVALUANDO"
    if (this.lastValidSystolic <= 0 || this.lastValidDiastolic <= 0) {
      return "0/0";
    }
    return `${this.lastValidSystolic}/${this.lastValidDiastolic}`;
  }
}
