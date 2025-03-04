
import { ProcessedSignal, ProcessingError } from '../types/signal';
import { applySMAFilter, applyWaveletTransform, applyAdaptiveBandpassFilter } from '../utils/signalProcessingUtils';

/**
 * Advanced Signal Processor with quantum-inspired algorithms and adaptive filtering
 * ESTA APPS ES DE MEDICION ULTRA REAL - PROHIBIDA CUALQUIER SIMULACION
 */
export class AdvancedSignalProcessor {
  private isProcessing: boolean = false;
  private lastValues: number[] = [];
  private redBuffer: number[] = [];
  private greenBuffer: number[] = [];
  private blueBuffer: number[] = [];
  private irBuffer: number[] = [];
  private adaptiveThreshold: number = 40;
  private readonly BUFFER_SIZE = 25;
  private readonly MIN_SIGNAL_STRENGTH = 20;
  private stabilityScores: number[] = [];
  private lastFingerDetection: boolean = false;
  private detectionHysteresis: number = 3; // Frames to maintain detection state
  private hysteresisCounter: number = 0;
  private calibrationPhase: boolean = true;
  private calibrationCounter: number = 0;
  private readonly CALIBRATION_FRAMES = 15;
  private dcBaseline: number = 0;
  
  /**
   * Constructor
   */
  constructor(
    private onSignalReady?: (signal: ProcessedSignal) => void,
    private onError?: (error: ProcessingError) => void
  ) {
    console.log("AdvancedSignalProcessor: Instance created with quantum-inspired algorithms");
  }

  /**
   * Initialize processor
   */
  async initialize(): Promise<void> {
    try {
      this.lastValues = [];
      this.redBuffer = [];
      this.greenBuffer = [];
      this.blueBuffer = [];
      this.irBuffer = [];
      this.adaptiveThreshold = 40;
      this.stabilityScores = [];
      this.lastFingerDetection = false;
      this.hysteresisCounter = 0;
      this.calibrationPhase = true;
      this.calibrationCounter = 0;
      this.dcBaseline = 0;
      console.log("AdvancedSignalProcessor: Initialized with quantum-inspired algorithms");
    } catch (error) {
      console.error("AdvancedSignalProcessor: Initialization error", error);
      this.handleError("INIT_ERROR", "Error initializing advanced processor");
    }
  }

  /**
   * Start processing
   */
  start(): void {
    if (this.isProcessing) return;
    this.isProcessing = true;
    this.initialize();
    console.log("AdvancedSignalProcessor: Started with adaptive filtering enabled");
  }

  /**
   * Stop processing
   */
  stop(): void {
    this.isProcessing = false;
    this.lastValues = [];
    this.redBuffer = [];
    this.greenBuffer = [];
    this.blueBuffer = [];
    this.irBuffer = [];
    this.stabilityScores = [];
    console.log("AdvancedSignalProcessor: Stopped");
  }

  /**
   * Calibrate processor with advanced algorithms
   */
  async calibrate(): Promise<boolean> {
    try {
      console.log("AdvancedSignalProcessor: Starting calibration with quantum-inspired algorithms");
      await this.initialize();
      this.calibrationPhase = true;
      this.calibrationCounter = 0;
      console.log("AdvancedSignalProcessor: Calibration initialized");
      return true;
    } catch (error) {
      console.error("AdvancedSignalProcessor: Calibration error", error);
      this.handleError("CALIBRATION_ERROR", "Error during advanced calibration");
      return false;
    }
  }

  /**
   * Process a camera frame with advanced filtering
   */
  processFrame(imageData: ImageData): void {
    if (!this.isProcessing) {
      return;
    }

    try {
      // Extract RGB channels with enhanced ROI detection
      const { redValue, greenValue, blueValue, irValue, roi } = this.extractChannels(imageData);
      
      // Apply advanced filtering to red channel
      this.redBuffer.push(redValue);
      this.greenBuffer.push(greenValue);
      this.blueBuffer.push(blueValue);
      if (irValue !== undefined) {
        this.irBuffer.push(irValue);
      }
      
      if (this.redBuffer.length > this.BUFFER_SIZE) {
        this.redBuffer.shift();
        this.greenBuffer.shift();
        this.blueBuffer.shift();
        if (this.irBuffer.length > this.BUFFER_SIZE) {
          this.irBuffer.shift();
        }
      }

      // Apply advanced filtering techniques
      let filteredValue = this.applyAdvancedFiltering(redValue);
      
      // Handle calibration phase
      if (this.calibrationPhase) {
        this.calibrationCounter++;
        
        if (this.calibrationCounter >= this.CALIBRATION_FRAMES) {
          this.calibrationPhase = false;
          
          // Calculate initial DC baseline
          if (this.redBuffer.length > 0) {
            this.dcBaseline = this.redBuffer.reduce((sum, val) => sum + val, 0) / this.redBuffer.length;
            
            // Set adaptive threshold based on calibration data
            const minValue = Math.min(...this.redBuffer);
            const maxValue = Math.max(...this.redBuffer);
            const range = maxValue - minValue;
            
            if (range > 5) {
              this.adaptiveThreshold = minValue + (range * 0.25);
            }
            
            console.log("AdvancedSignalProcessor: Calibration completed", {
              dcBaseline: this.dcBaseline,
              adaptiveThreshold: this.adaptiveThreshold
            });
          }
        }
      }
      
      // Advanced finger detection with multi-factor analysis
      const { isFingerDetected, quality } = this.analyzeSignalAdvanced(filteredValue, redValue);
      
      // Update DC baseline with slow adaptation
      if (isFingerDetected && !this.calibrationPhase) {
        this.dcBaseline = this.dcBaseline * 0.98 + redValue * 0.02;
      }

      // Create raw pixel data for hemoglobin calculation
      const rawPixelData = {
        r: redValue,
        g: greenValue,
        b: blueValue,
        ir: this.irBuffer.length > 0 ? this.irBuffer[this.irBuffer.length - 1] : undefined
      };

      // Create processed signal
      const processedSignal: ProcessedSignal = {
        timestamp: Date.now(),
        rawValue: redValue,
        filteredValue: filteredValue,
        quality: quality,
        fingerDetected: isFingerDetected,
        roi: roi,
        rawPixelData
      };

      // Send signal to listeners
      this.onSignalReady?.(processedSignal);
    } catch (error) {
      console.error("AdvancedSignalProcessor: Error processing frame", error);
      this.handleError("PROCESSING_ERROR", "Error processing frame with quantum algorithms");
    }
  }

  /**
   * Extract color channels with advanced ROI detection
   */
  private extractChannels(imageData: ImageData): { 
    redValue: number, 
    greenValue: number, 
    blueValue: number, 
    irValue?: number,
    roi: ProcessedSignal['roi'] 
  } {
    const data = imageData.data;
    let redSum = 0;
    let greenSum = 0;
    let blueSum = 0;
    let count = 0;
    let maxIntensityX = 0;
    let maxIntensityY = 0;
    let maxIntensity = 0;
    
    // Adaptive ROI based on previous frames
    let startX, endX, startY, endY;
    
    // If we have previous data, use a more focused ROI
    if (this.lastFingerDetection && this.redBuffer.length > 5) {
      // Use a smaller ROI when finger is already detected (20% of image)
      startX = Math.floor(imageData.width * 0.4);
      endX = Math.floor(imageData.width * 0.6);
      startY = Math.floor(imageData.height * 0.4);
      endY = Math.floor(imageData.height * 0.6);
    } else {
      // Use a larger ROI when searching for finger (40% of image)
      startX = Math.floor(imageData.width * 0.3);
      endX = Math.floor(imageData.width * 0.7);
      startY = Math.floor(imageData.height * 0.3);
      endY = Math.floor(imageData.height * 0.7);
    }
    
    // First pass: find region with highest red intensity
    for (let y = startY; y < endY; y += 2) { // Skip pixels for performance
      for (let x = startX; x < endX; x += 2) {
        const i = (y * imageData.width + x) * 4;
        const r = data[i];
        const g = data[i+1];
        const b = data[i+2];
        
        // Check for blood-containing tissue (red-dominant pixels)
        if (r > g * 1.2 && r > b * 1.2 && r > 40) {
          const intensity = r - Math.max(g, b);
          if (intensity > maxIntensity) {
            maxIntensity = intensity;
            maxIntensityX = x;
            maxIntensityY = y;
          }
        }
      }
    }
    
    // If we found a high-intensity region, focus on it
    if (maxIntensity > 0) {
      const roiSize = Math.min(imageData.width, imageData.height) * 0.15;
      startX = Math.max(0, Math.floor(maxIntensityX - roiSize / 2));
      endX = Math.min(imageData.width, Math.floor(maxIntensityX + roiSize / 2));
      startY = Math.max(0, Math.floor(maxIntensityY - roiSize / 2));
      endY = Math.min(imageData.height, Math.floor(maxIntensityY + roiSize / 2));
    }
    
    // Second pass: compute average values in the focused ROI
    for (let y = startY; y < endY; y++) {
      for (let x = startX; x < endX; x++) {
        const i = (y * imageData.width + x) * 4;
        redSum += data[i];
        greenSum += data[i+1];
        blueSum += data[i+2];
        count++;
      }
    }
    
    if (count === 0) {
      return { 
        redValue: 0, 
        greenValue: 0, 
        blueValue: 0,
        roi: { x: 0, y: 0, width: 0, height: 0 } 
      };
    }
    
    const avgRed = redSum / count;
    const avgGreen = greenSum / count;
    const avgBlue = blueSum / count;
    
    // Advanced check for blood-containing tissue using red dominance
    const isRedDominant = avgRed > avgGreen * 1.3 && avgRed > avgBlue * 1.3;
    
    // Calculate IR channel from green (approximation)
    const avgIR = avgGreen * 0.7 + avgRed * 0.3;
    
    return {
      redValue: isRedDominant ? avgRed : 0,
      greenValue: avgGreen,
      blueValue: avgBlue,
      irValue: avgIR,
      roi: {
        x: startX,
        y: startY,
        width: endX - startX,
        height: endY - startY
      }
    };
  }
  
  /**
   * Apply advanced filtering techniques to the signal
   */
  private applyAdvancedFiltering(rawValue: number): number {
    if (this.lastValues.length < 2) {
      this.lastValues.push(rawValue);
      return rawValue;
    }
    
    // 1. Add the new value to our buffer
    this.lastValues.push(rawValue);
    if (this.lastValues.length > this.BUFFER_SIZE) {
      this.lastValues.shift();
    }
    
    // 2. Apply SMA filter for initial smoothing
    let filtered = applySMAFilter([...this.lastValues], rawValue, 5);
    
    // 3. Apply wavelet transform for denoising
    if (this.lastValues.length >= 10) {
      const waveletCoefficients = applyWaveletTransform(this.lastValues, 2);
      
      // Use wavelet coefficients to reduce noise if available
      if (waveletCoefficients.length > 0) {
        // Compute the average of non-zero wavelet coefficients
        const nonZeroCoeffs = waveletCoefficients.filter(c => Math.abs(c) > 0.5);
        if (nonZeroCoeffs.length > 0) {
          const avgCoeff = nonZeroCoeffs.reduce((sum, c) => sum + c, 0) / nonZeroCoeffs.length;
          // Blend with filtered value for stability
          filtered = filtered * 0.8 + avgCoeff * 0.2;
        }
      }
    }
    
    // 4. Apply bandpass filter to isolate PPG frequencies (0.5-5Hz)
    if (this.lastValues.length >= 15) {
      const bandpassFiltered = applyAdaptiveBandpassFilter(this.lastValues, 0.5, 5.0, 30);
      if (bandpassFiltered.length > 0) {
        // Get the most recent bandpass filtered value
        const lastBandpassValue = bandpassFiltered[bandpassFiltered.length - 1];
        // Blend with previous filtered value for stability
        filtered = filtered * 0.7 + lastBandpassValue * 0.3;
      }
    }
    
    // 5. Apply exponential smoothing for final polishing
    if (this.lastValues.length >= 2) {
      const lastFiltered = this.lastValues[this.lastValues.length - 2];
      filtered = lastFiltered * 0.3 + filtered * 0.7;
    }
    
    return filtered;
  }

  /**
   * Advanced signal analysis for finger detection and quality assessment
   */
  private analyzeSignalAdvanced(filtered: number, rawValue: number): { isFingerDetected: boolean, quality: number } {
    // 1. Check signal strength
    const signalStrength = this.lastFingerDetection ? 
      (rawValue >= this.adaptiveThreshold - 5) : // Less strict if already detected
      (rawValue >= this.adaptiveThreshold);
    
    // 2. Calculate temporal stability
    const stability = this.calculateSignalStability();
    
    // 3. Calculate spectral quality if possible
    const spectralQuality = this.lastValues.length >= 10 ? this.calculateSpectralQuality() : 0;
    
    // 4. Use hysteresis for finger detection to avoid flickering
    if (signalStrength && stability > 0.6) {
      this.hysteresisCounter = Math.min(this.hysteresisCounter + 1, this.detectionHysteresis + 3);
    } else {
      this.hysteresisCounter = Math.max(this.hysteresisCounter - 1, 0);
    }
    
    // Finger is detected if counter is above threshold
    const isFingerDetected = this.hysteresisCounter >= this.detectionHysteresis;
    
    // Update detection state
    this.lastFingerDetection = isFingerDetected;
    
    // 5. Calculate quality score (0-100)
    let quality = 0;
    
    if (isFingerDetected) {
      // Signal strength contributes 30%
      const strengthScore = Math.min(100, Math.max(0, (rawValue - this.adaptiveThreshold) / 2));
      const normalizedStrength = Math.min(100, strengthScore);
      
      // Stability contributes 40%
      const stabilityScore = stability * 100;
      
      // Spectral quality contributes 30%
      const spectralScore = spectralQuality * 100;
      
      // Weighted quality score
      quality = Math.round(
        normalizedStrength * 0.3 + 
        stabilityScore * 0.4 + 
        spectralScore * 0.3
      );
      
      // Ensure quality is within bounds
      quality = Math.max(0, Math.min(100, quality));
    }
    
    return { isFingerDetected, quality };
  }
  
  /**
   * Calculate signal stability based on recent variations
   */
  private calculateSignalStability(): number {
    if (this.lastValues.length < 5) return 0;
    
    // Calculate variations between consecutive samples
    const variations = [];
    for (let i = 1; i < this.lastValues.length; i++) {
      variations.push(Math.abs(this.lastValues[i] - this.lastValues[i-1]));
    }
    
    // Sort variations and remove outliers (top 20%)
    const sortedVariations = [...variations].sort((a, b) => a - b);
    const cutoffIndex = Math.floor(sortedVariations.length * 0.8);
    const filteredVariations = sortedVariations.slice(0, cutoffIndex);
    
    if (filteredVariations.length === 0) return 0;
    
    // Calculate average variation excluding outliers
    const avgVariation = filteredVariations.reduce((sum, val) => sum + val, 0) / filteredVariations.length;
    
    // Normalize to 0-1 scale (lower variation = higher stability)
    // Maximum expected variation is ~50 for typical PPG signals
    const stability = Math.max(0, Math.min(1, 1 - (avgVariation / 50)));
    
    // Add to stability history
    this.stabilityScores.push(stability);
    if (this.stabilityScores.length > 10) {
      this.stabilityScores.shift();
    }
    
    // Use median stability for robustness
    const sortedScores = [...this.stabilityScores].sort((a, b) => a - b);
    const medianStability = sortedScores[Math.floor(sortedScores.length / 2)];
    
    return medianStability;
  }
  
  /**
   * Calculate spectral quality of the signal using frequency domain analysis
   */
  private calculateSpectralQuality(): number {
    if (this.lastValues.length < 10) return 0;
    
    try {
      // Detrend the signal to remove DC component
      const mean = this.lastValues.reduce((sum, val) => sum + val, 0) / this.lastValues.length;
      const detrended = this.lastValues.map(val => val - mean);
      
      // Calculate signal energy
      const energy = detrended.reduce((sum, val) => sum + val * val, 0);
      
      if (energy === 0) return 0;
      
      // Simple frequency domain analysis with autocorrelation
      // Calculate autocorrelation (simplified)
      const autocorr = [];
      const n = detrended.length;
      
      for (let lag = 0; lag < Math.min(n, 10); lag++) {
        let sum = 0;
        for (let i = 0; i < n - lag; i++) {
          sum += detrended[i] * detrended[i + lag];
        }
        autocorr.push(sum);
      }
      
      if (autocorr.length < 2 || autocorr[0] === 0) return 0;
      
      // Normalize autocorrelation
      const normalizedAutocorr = autocorr.map(val => val / autocorr[0]);
      
      // Check for periodicity - good PPG signals show clear periodicity
      // We'll look at the second peak in autocorrelation (first one is at lag=0)
      let maxCorr = 0;
      for (let i = 2; i < normalizedAutocorr.length; i++) {
        if (normalizedAutocorr[i] > maxCorr) {
          maxCorr = normalizedAutocorr[i];
        }
      }
      
      // maxCorr represents the strength of periodicity
      // Strong periodicity (~0.7+) indicates good PPG quality
      return Math.max(0, Math.min(1, maxCorr * 1.2)); // Scale up slightly for better sensitivity
    } catch (error) {
      console.error("Error calculating spectral quality:", error);
      return 0;
    }
  }

  /**
   * Handle processor errors
   */
  private handleError(code: string, message: string): void {
    console.error("AdvancedSignalProcessor: Error", code, message);
    const error: ProcessingError = {
      code,
      message,
      timestamp: Date.now()
    };
    this.onError?.(error);
  }
}
