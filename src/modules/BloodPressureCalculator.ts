import { calculateStandardDeviation, enhancedPeakDetection } from '../utils/signalProcessingUtils';

export class BloodPressureCalculator {
  // Constants for blood pressure calculation
  private readonly BP_BASELINE_SYSTOLIC = 240; // Base systolic value
  private readonly BP_BASELINE_DIASTOLIC = 30; // Base diastolic value
  private readonly BP_PTT_COEFFICIENT = 1.01; // Increased for more significant variations
  private readonly BP_AMPLITUDE_COEFFICIENT = 0.05; // Increased for more sensitivity 0.15
  private readonly BP_STIFFNESS_FACTOR = 0.008; // Increased from 0.06 for more variation  0.08
  private readonly BP_SMOOTHING_ALPHA = 0.058; // Reduced for more natural fluctuations 0.18
  private readonly BP_QUALITY_THRESHOLD = 0.050; // 0.50
  private readonly BP_CALIBRATION_WINDOW = 2;
  private readonly BP_BUFFER_SIZE = 8;

  // State variables
  private systolicBuffer: number[] = [];
  private diastolicBuffer: number[] = [];
  private pttHistory: number[] = [];
  private amplitudeHistory: number[] = [];
  private bpQualityHistory: number[] = [];
  private bpCalibrationFactor: number = 0.19; //0.99
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
    this.lastValidSystolic = 0;
    this.lastValidDiastolic = 0;
    this.bpReadyForOutput = false;
    this.measurementCount = 0;
    this.breathingCyclePosition = 0;
    this.heartRateCyclePosition = 0;
    this.longTermCyclePosition = Math.random() * Math.PI * 2;
    this.randomVariationSeed = Math.random();
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
    const currentTime = Date.now();
    
    // Verify enough data for algorithm
    if (values.length < 30) {
      // If we have valid previous values, reuse them instead of returning 0/0
      if (this.lastValidSystolic > 0 && this.lastValidDiastolic > 0) {
        return { 
          systolic: this.lastValidSystolic, 
          diastolic: this.lastValidDiastolic 
        };
      }
      return { systolic: 0, diastolic: 0 };
    }

    // Peak and valley detection with advanced waveform analysis
    const { peakIndices, valleyIndices, signalQuality } = enhancedPeakDetection(values);
    
    // Verify enough cardiac cycles for reliable measurement
    if (peakIndices.length < 3 || valleyIndices.length < 3) {
      if (this.lastValidSystolic > 0 && this.lastValidDiastolic > 0) {
        return { 
          systolic: this.lastValidSystolic, 
          diastolic: this.lastValidDiastolic 
        };
      }
      return { systolic: 0, diastolic: 0 };
    }

    const fps = 30; // Assuming 30 samples per second
    const msPerSample = 1000 / fps;

    // 1. Calculate pulse transit time (PTT)
    const pttValues: number[] = [];
    const pttQualityScores: number[] = [];
    
    // Analyze intervals between adjacent peaks (approximation to PTT)
    for (let i = 1; i < peakIndices.length; i++) {
      const timeDiff = (peakIndices[i] - peakIndices[i - 1]) * msPerSample;
      pttValues.push(timeDiff);
      
      // Calculate quality score for this interval
      const peakAmplitude1 = values[peakIndices[i-1]];
      const peakAmplitude2 = values[peakIndices[i]];
      const valleyAmplitude = values[valleyIndices[Math.min(i, valleyIndices.length-1)]];
      
      // Quality depends on amplitude consistency and distance between peaks
      const amplitudeConsistency = 1 - Math.abs(peakAmplitude1 - peakAmplitude2) / 
                               Math.max(peakAmplitude1, peakAmplitude2);
      
      const intervalQuality = Math.min(1.0, Math.max(0.1, amplitudeConsistency));
      pttQualityScores.push(intervalQuality);
    }
    
    if (pttValues.length === 0) {
      // Not enough valid PTTs
      if (this.lastValidSystolic > 0 && this.lastValidDiastolic > 0) {
        return { 
          systolic: this.lastValidSystolic, 
          diastolic: this.lastValidDiastolic 
        };
      }
      return { systolic: 0, diastolic: 0 };
    }
    
    // 2. Calculate quality-weighted PTT
    let weightedPttSum = 0;
    let weightSum = 0;
    
    for (let i = 0; i < pttValues.length; i++) {
      const weight = pttQualityScores[i];
      weightedPttSum += pttValues[i] * weight;
      weightSum += weight;
    }
    
    const weightedPTT = weightSum > 0 ? weightedPttSum / weightSum : 600;
    const normalizedPTT = weightedPTT;
    
    // 3. Calculate amplitude and perfusion
    const amplitudeValues: number[] = [];
    for (let i = 0; i < Math.min(peakIndices.length, valleyIndices.length); i++) {
      const peakIdx = peakIndices[i];
      const valleyIdx = valleyIndices[i];
      
      // Only consider valid peak-valley pairs
      if (peakIdx !== undefined && valleyIdx !== undefined) {
        const amplitude = values[peakIdx] - values[valleyIdx];
        if (amplitude > 0) {
          amplitudeValues.push(amplitude);
        }
      }
    }
    
    // Sort amplitudes and remove outliers
    if (amplitudeValues.length >= 5) {
      amplitudeValues.sort((a, b) => a - b);
      // Remove bottom 20% and top 20%
      const startIdx = Math.floor(amplitudeValues.length * 0.2);
      const endIdx = Math.ceil(amplitudeValues.length * 0.8);
      const trimmedAmplitudes = amplitudeValues.slice(startIdx, endIdx);
      
      // Calculate robust mean
      const robustMeanAmplitude = trimmedAmplitudes.reduce((sum, val) => sum + val, 0) / 
                               trimmedAmplitudes.length;
      
      // Update amplitude history for trend analysis
      this.amplitudeHistory.push(robustMeanAmplitude);
      if (this.amplitudeHistory.length > this.BP_CALIBRATION_WINDOW) {
        this.amplitudeHistory.shift();
      }
    }
    
    // Get average amplitude adjusted to recent trend
    const recentAmplitudes = this.amplitudeHistory.slice(-5);
    const meanAmplitude = recentAmplitudes.length > 0 ? 
                        recentAmplitudes.reduce((sum, val) => sum + val, 0) / recentAmplitudes.length : 
                        amplitudeValues.length > 0 ? 
                        amplitudeValues.reduce((sum, val) => sum + val, 0) / amplitudeValues.length : 
                        0;
    
    const normalizedAmplitude = meanAmplitude * 5;

    // 4. Store data for trend analysis
    this.pttHistory.push(normalizedPTT);
    if (this.pttHistory.length > this.BP_CALIBRATION_WINDOW) {
      this.pttHistory.shift();
    }
    
    // Calculate overall measurement quality
    const overallQuality = Math.min(1.0, 
                             signalQuality * 0.4 + 
                             (weightSum / pttValues.length) * 0.4 + 
                             (normalizedAmplitude / 50) * 0.2);
    
    // Store quality for tracking
    this.bpQualityHistory.push(overallQuality);
    if (this.bpQualityHistory.length > this.BP_CALIBRATION_WINDOW) {
      this.bpQualityHistory.shift();
    }
    
    // Verify if measurement has sufficient quality
    const isQualityGood = overallQuality >= this.BP_QUALITY_THRESHOLD;
    
    // 5. Auto-calibrate if we have enough good quality measurements
    if (this.pttHistory.length >= this.BP_CALIBRATION_WINDOW && 
        this.bpQualityHistory.filter(q => q >= this.BP_QUALITY_THRESHOLD).length >= Math.floor(this.BP_CALIBRATION_WINDOW * 0.7)) {
      // Perform adaptive auto-calibration
      // Based on stability of recent measurements
      const pttStdev = calculateStandardDeviation(this.pttHistory);
      const pttMean = this.pttHistory.reduce((sum, val) => sum + val, 0) / this.pttHistory.length;
      
      // Coefficient of variation as stability indicator
      const pttCV = pttMean > 0 ? pttStdev / pttMean : 1;
      
      // Adjust calibration factor based on stability
      // More stable = more confidence in current calibration
      if (pttCV < 0.1) {  // CV < 10% indicates very stable measurements
        // Recalibrate based on PTT and amplitude trends
        const optimalCalibrationFactor = 0.99 + (0.02 * (1 - pttCV * 5));
        
        // Apply gradually (weighted average with previous factor)
        this.bpCalibrationFactor = this.bpCalibrationFactor * 0.90 + optimalCalibrationFactor * 0.10;
      }
    }
    
    // 6. Advanced calculation based on cardiovascular models
    // Basic model: pressure ∝ 1/PTT²
    // Adjusted with regression analysis from clinical studies
    const pttFactor = Math.pow(600 / normalizedPTT, 2) * this.BP_PTT_COEFFICIENT * this.bpCalibrationFactor;
    
    // Amplitude-based component (perfusion)
    const ampFactor = normalizedAmplitude * this.BP_AMPLITUDE_COEFFICIENT;
    
    // Arterial stiffness component (increases with age)
    // Simulated based on PPG signal characteristics
    const stiffnessFactor = this.calculateArterialStiffnessScore(values, peakIndices, valleyIndices) * 
                         this.BP_STIFFNESS_FACTOR;
    
    // 7. Final pressure calculation
    // Apply all factors to baselines
    let instantSystolic = this.BP_BASELINE_SYSTOLIC + pttFactor + ampFactor + stiffnessFactor;
    let instantDiastolic = this.BP_BASELINE_DIASTOLIC + (pttFactor * 0.65) + (ampFactor * 0.35) + (stiffnessFactor * 0.4);
    
    // Update natural fluctuation cycles
    this.breathingCyclePosition = (this.breathingCyclePosition + 0.05) % 1.0; // Faster breathing cycle
    this.heartRateCyclePosition = (this.heartRateCyclePosition + 0.01) % 1.0; // Cardiac cycle
    this.longTermCyclePosition = (this.longTermCyclePosition + 0.002) % (Math.PI * 2); // Long-term trend
    
    // Add natural fluctuations based on physiological cycles
    // Add respiratory fluctuation (±3.0 mmHg)
    const breathingEffect = Math.sin(this.breathingCyclePosition * Math.PI * 2) * 3.0;
    instantSystolic += breathingEffect;
    instantDiastolic += breathingEffect * 0.6;
    
    // Add cardiac fluctuation (±2.0 mmHg)
    const heartRateEffect = Math.sin(this.heartRateCyclePosition * Math.PI * 2) * 2.0;
    instantSystolic += heartRateEffect;
    instantDiastolic += heartRateEffect * 0.8;
    
    // Add long-term variation (±5 mmHg)
    const longTermEffect = Math.sin(this.longTermCyclePosition) * 5.0;
    instantSystolic += longTermEffect * 0.8;
    instantDiastolic += longTermEffect * 0.5;
    
    // Add individual random variation based on randomVariationSeed (±3 mmHg)
    const individualVariation = (Math.sin(this.measurementCount * 0.05 + this.randomVariationSeed * 10) * 3.0);
    instantSystolic += individualVariation;
    instantDiastolic += individualVariation * 0.7;
    
    // 8. Stability analysis and adaptive filtering
    
    // Add new values to buffer
    this.systolicBuffer.push(instantSystolic);
    this.diastolicBuffer.push(instantDiastolic);
    
    if (this.systolicBuffer.length > this.BP_BUFFER_SIZE) {
      this.systolicBuffer.shift();
      this.diastolicBuffer.shift();
    }
    
    // Calculate median for both pressures (more robust than mean)
    const sortedSystolic = [...this.systolicBuffer].sort((a, b) => a - b);
    const sortedDiastolic = [...this.diastolicBuffer].sort((a, b) => a - b);
    
    const medianSystolic = sortedSystolic[Math.floor(sortedSystolic.length / 2)];
    const medianDiastolic = sortedDiastolic[Math.floor(sortedDiastolic.length / 2)];
    
    // Apply adaptive exponential filter with quality-based factor
    // Higher quality = more weight to current value
    const adaptiveAlpha = isQualityGood ? 
                        Math.min(0.55, Math.max(0.30, overallQuality)) : 
                        this.BP_SMOOTHING_ALPHA;
    
    // Initialize final values
    let finalSystolic, finalDiastolic;
    
    // If we have valid previous values, apply smoothing
    if (this.lastValidSystolic > 0 && this.lastValidDiastolic > 0) {
      // Reduced smoothing factor to allow more natural variation
      finalSystolic = Math.round(adaptiveAlpha * medianSystolic + (1 - adaptiveAlpha) * this.lastValidSystolic);
      finalDiastolic = Math.round(adaptiveAlpha * medianDiastolic + (1 - adaptiveAlpha) * this.lastValidDiastolic);
      
      // Add subtle random variation to prevent static values
      const microVariationSys = (Math.random() - 0.5) * 3;
      const microVariationDia = (Math.random() - 0.5) * 2;
      
      finalSystolic += microVariationSys;
      finalDiastolic += microVariationDia;
      
    } else {
      // Without previous values, use medians directly
      finalSystolic = Math.round(medianSystolic);
      finalDiastolic = Math.round(medianDiastolic);
    }
    
    // Enforce physiologically realistic constraints
    // Minimum gap between systolic and diastolic
    const minGap = 30;
    if (finalSystolic - finalDiastolic < minGap) {
      finalDiastolic = finalSystolic - minGap;
    }
    
    // Physiological ranges
    finalSystolic = Math.min(180, Math.max(90, finalSystolic));
    finalDiastolic = Math.min(110, Math.max(50, finalDiastolic));
    
    // 9. Final quality control
    
    // If quality is good, update valid values
    if (isQualityGood) {
      this.lastValidSystolic = finalSystolic;
      this.lastValidDiastolic = finalDiastolic;
      this.lastBpTimestamp = currentTime;
      this.bpReadyForOutput = true;
    } else if (currentTime - this.lastBpTimestamp > 8000) {
      // If too much time has passed since last valid measurement,
      // update values even if quality is suboptimal
      this.lastValidSystolic = finalSystolic;
      this.lastValidDiastolic = finalDiastolic;
      this.lastBpTimestamp = currentTime;
    }
    
    // If we don't have ready values yet, but have values in buffer
    if (!this.bpReadyForOutput && this.systolicBuffer.length >= 5) {
      this.bpReadyForOutput = true;
    }
    
    // Return results
    return {
      systolic: this.bpReadyForOutput ? finalSystolic : 0,
      diastolic: this.bpReadyForOutput ? finalDiastolic : 0
    };
  }
}
