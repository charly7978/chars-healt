import { ProcessedSignal, ProcessingError, SignalProcessor } from '../types/signal';
import deviceContextService from '../services/DeviceContextService';

// Class for Kalman filter - improves signal noise reduction
class KalmanFilter {
  private R: number = 0.01;  // Measurement noise
  private Q: number = 0.1;   // Process noise
  private P: number = 1;     // Error covariance
  private X: number = 0;     // State estimate
  private K: number = 0;     // Kalman gain

  /**
   * Apply Kalman filter to a measurement
   */
  filter(measurement: number): number {
    // Prediction update
    this.P = this.P + this.Q;
    
    // Measurement update
    this.K = this.P / (this.P + this.R);
    this.X = this.X + this.K * (measurement - this.X);
    this.P = (1 - this.K) * this.P;
    
    return this.X;
  }

  /**
   * Reset filter state
   */
  reset() {
    this.X = 0;
    this.P = 1;
  }
}

/**
 * PPG Signal Processor implementation
 * Processes camera frames to extract and analyze PPG signals
 */
export class PPGSignalProcessor implements SignalProcessor {
  private isProcessing: boolean = false;
  private kalmanFilter: KalmanFilter;
  private lastValues: number[] = [];
  private frameSkipCount: number = 0;  // For frame skipping optimization
  private frameSkipFactor: number = 2; // Adjust dynamically based on stability
  
  // Frame compression settings
  private compressionCanvas: HTMLCanvasElement | null = null;
  private compressionCtx: CanvasRenderingContext2D | null = null;
  private compressionQuality: number = 1.0; // 1.0 = no compression
  
  // Configuration settings
  private readonly DEFAULT_CONFIG = {
    BUFFER_SIZE: 15,           // Buffer for signal analysis
    MIN_RED_THRESHOLD: 40,     // Minimum threshold for red channel
    MAX_RED_THRESHOLD: 250,    // Maximum threshold for red channel
    STABILITY_WINDOW: 6,       // Window for stability analysis
    MIN_STABILITY_COUNT: 4,    // Minimum stable samples
    HYSTERESIS: 5,             // Hysteresis to avoid fluctuations
    MIN_CONSECUTIVE_DETECTIONS: 3  // Minimum consecutive detections needed
  };

  private currentConfig: typeof this.DEFAULT_CONFIG;
  private stableFrameCount: number = 0;
  private lastStableValue: number = 0;
  private consecutiveDetections: number = 0;
  private isCurrentlyDetected: boolean = false;
  private lastDetectionTime: number = 0;
  private readonly DETECTION_TIMEOUT = 500; // 500ms timeout
  
  // Cache for optimizing repeated calculations
  private lastRedValue: number = 0;
  private lastProcessedTime: number = 0;
  private processingThrottleMs: number = 33; // ~ 30fps max processing rate
  
  // Signal stability tracking
  private lastSignalStability: number = 0;
  private stabilityHistory: number[] = [];
  
  // Pattern recognition
  private signalPatterns: Array<{pattern: number[], timestamp: number}> = [];
  private patternMatchThreshold: number = 0.8;

  /**
   * Constructor
   */
  constructor(
    public onSignalReady?: (signal: ProcessedSignal) => void,
    public onError?: (error: ProcessingError) => void
  ) {
    this.kalmanFilter = new KalmanFilter();
    this.currentConfig = { ...this.DEFAULT_CONFIG };
    this.initializeCompression();
    console.log("PPGSignalProcessor: Instance created");
  }
  
  /**
   * Initialize compression canvas
   */
  private initializeCompression(): void {
    try {
      this.compressionCanvas = document.createElement('canvas');
      this.compressionCtx = this.compressionCanvas.getContext('2d', { willReadFrequently: true });
      console.log("PPGSignalProcessor: Compression canvas initialized");
    } catch (error) {
      console.error("PPGSignalProcessor: Error initializing compression canvas", error);
    }
  }

  /**
   * Initialize processor
   */
  async initialize(): Promise<void> {
    try {
      this.lastValues = [];
      this.stableFrameCount = 0;
      this.lastStableValue = 0;
      this.consecutiveDetections = 0;
      this.isCurrentlyDetected = false;
      this.lastDetectionTime = 0;
      this.frameSkipCount = 0;
      this.frameSkipFactor = 2;
      this.kalmanFilter.reset();
      this.lastRedValue = 0;
      this.lastProcessedTime = 0;
      this.lastSignalStability = 0;
      this.stabilityHistory = [];
      console.log("PPGSignalProcessor: Initialized");
    } catch (error) {
      console.error("PPGSignalProcessor: Initialization error", error);
      this.handleError("INIT_ERROR", "Error initializing processor");
    }
  }

  /**
   * Start processing
   */
  start(): void {
    if (this.isProcessing) return;
    this.isProcessing = true;
    this.initialize();
    console.log("PPGSignalProcessor: Started");
  }

  /**
   * Stop processing
   */
  stop(): void {
    this.isProcessing = false;
    this.lastValues = [];
    this.stableFrameCount = 0;
    this.lastStableValue = 0;
    this.consecutiveDetections = 0;
    this.isCurrentlyDetected = false;
    this.kalmanFilter.reset();
    this.lastRedValue = 0;
    this.lastProcessedTime = 0;
    this.stabilityHistory = [];
    this.signalPatterns = [];
    console.log("PPGSignalProcessor: Stopped");
  }

  /**
   * Calibrate processor
   */
  async calibrate(): Promise<boolean> {
    try {
      console.log("PPGSignalProcessor: Starting calibration");
      await this.initialize();
      console.log("PPGSignalProcessor: Calibration completed");
      return true;
    } catch (error) {
      console.error("PPGSignalProcessor: Calibration error", error);
      this.handleError("CALIBRATION_ERROR", "Error during calibration");
      return false;
    }
  }

  /**
   * Process a camera frame
   */
  processFrame(imageData: ImageData): void {
    if (!this.isProcessing) {
      return;
    }
    
    // Don't process if app is backgrounded or in hibernation
    if (deviceContextService.isBackgrounded) {
      console.log("PPGSignalProcessor: App in background, skipping processing");
      return;
    }
    
    // If device is idle for a while, enter hibernation mode for non-critical components
    if (deviceContextService.isDeviceIdle) {
      this.frameSkipFactor = 4; // Maximum skip in hibernation mode
    } else {
      // Dynamic skip factor based on battery and stability
      const lowPower = deviceContextService.isBatterySavingMode;
      
      if (lowPower) {
        // More aggressive skipping when battery is low
        this.frameSkipFactor = Math.min(this.frameSkipFactor + 0.25, 3);
      } else if (this.lastSignalStability > 0.9) {
        // Very stable signal - can skip more frames
        this.frameSkipFactor = Math.min(this.frameSkipFactor + 0.1, 3);
      } else if (this.lastSignalStability < 0.7) {
        // Less stable signal - process more frames
        this.frameSkipFactor = Math.max(this.frameSkipFactor - 0.2, 1);
      }
    }

    // Frame skipping for performance optimization
    this.frameSkipCount = (this.frameSkipCount + 1) % Math.floor(this.frameSkipFactor);
    if (this.frameSkipCount !== 0) {
      return;
    }

    // Throttle processing rate for performance
    const now = Date.now();
    if (now - this.lastProcessedTime < this.processingThrottleMs) {
      return;
    }
    this.lastProcessedTime = now;
    
    try {
      // Compress image before processing if needed
      let processedImageData = imageData;
      
      if (deviceContextService.isBatterySavingMode && this.compressionCanvas && this.compressionCtx) {
        // Reduced resolution for processing when in battery saving mode
        processedImageData = this.compressImage(imageData, 0.75);
      }
      
      // Extract PPG signal based on scientific evidence
      const redValue = this.extractRedChannel(processedImageData);
      
      // Skip processing if the value hasn't changed significantly (optimization)
      if (Math.abs(redValue - this.lastRedValue) < 0.5 && this.lastValues.length > 0) {
        return;
      }
      this.lastRedValue = redValue;
      
      const filtered = this.kalmanFilter.filter(redValue);
      this.lastValues.push(filtered);
      
      if (this.lastValues.length > this.currentConfig.BUFFER_SIZE) {
        this.lastValues.shift();
      }

      const { isFingerDetected, quality } = this.analyzeSignal(filtered, redValue);
      
      // Check for pattern recognition if we have enough samples
      if (isFingerDetected && this.lastValues.length >= 10) {
        this.learnPattern();
      }

      // Only emit signal if value has changed meaningfully or detection status changed
      const processedSignal: ProcessedSignal = {
        timestamp: now,
        rawValue: redValue,
        filteredValue: filtered,
        quality: quality,
        fingerDetected: isFingerDetected,
        roi: this.detectROI(redValue)
      };

      this.onSignalReady?.(processedSignal);

    } catch (error) {
      console.error("PPGSignalProcessor: Error processing frame", error);
      this.handleError("PROCESSING_ERROR", "Error processing frame");
    }
  }
  
  /**
   * Compress image for more efficient processing
   */
  private compressImage(imageData: ImageData, quality: number): ImageData {
    if (!this.compressionCanvas || !this.compressionCtx) {
      return imageData;
    }
    
    try {
      // Set canvas size proportional to original based on quality factor
      const targetWidth = Math.floor(imageData.width * quality);
      const targetHeight = Math.floor(imageData.height * quality);
      
      this.compressionCanvas.width = targetWidth;
      this.compressionCanvas.height = targetHeight;
      
      // Create a temporary canvas to draw the original image data
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = imageData.width;
      tempCanvas.height = imageData.height;
      const tempCtx = tempCanvas.getContext('2d');
      
      if (!tempCtx) {
        return imageData;
      }
      
      // Draw original image data to temp canvas
      tempCtx.putImageData(imageData, 0, 0);
      
      // Draw and resize to compression canvas
      this.compressionCtx.drawImage(tempCanvas, 0, 0, imageData.width, imageData.height, 
                                  0, 0, targetWidth, targetHeight);
      
      // Get compressed image data
      return this.compressionCtx.getImageData(0, 0, targetWidth, targetHeight);
    } catch (err) {
      console.error("Error compressing image:", err);
      return imageData;
    }
  }

  /**
   * Extract red channel from image data - optimized version
   */
  private extractRedChannel(imageData: ImageData): number {
    const data = imageData.data;
    let redSum = 0;
    let greenSum = 0;
    let blueSum = 0;
    let count = 0;
    
    // Use central region for better signal (central 25%)
    const startX = Math.floor(imageData.width * 0.375);
    const endX = Math.floor(imageData.width * 0.625);
    const startY = Math.floor(imageData.height * 0.375);
    const endY = Math.floor(imageData.height * 0.625);
    
    // Optimize by sampling every other pixel when resolution is high
    const samplingRate = (imageData.width > 640 || imageData.height > 480) ? 2 : 1;
    
    for (let y = startY; y < endY; y += samplingRate) {
      const rowOffset = y * imageData.width * 4;
      
      for (let x = startX; x < endX; x += samplingRate) {
        const i = rowOffset + (x * 4);
        redSum += data[i];     // Red channel
        greenSum += data[i+1]; // Green channel
        blueSum += data[i+2];  // Blue channel
        count++;
      }
    }
    
    if (count === 0) return 0;
    
    const avgRed = redSum / count;
    const avgGreen = greenSum / count;
    const avgBlue = blueSum / count;

    // Check red channel dominance (characteristic of blood-containing tissue)
    const isRedDominant = avgRed > (avgGreen * 1.2) && avgRed > (avgBlue * 1.2);
    
    return isRedDominant ? avgRed : 0;
  }

  /**
   * Analyze signal for finger detection and quality assessment
   */
  private analyzeSignal(filtered: number, rawValue: number): { isFingerDetected: boolean, quality: number } {
    const currentTime = Date.now();
    const timeSinceLastDetection = currentTime - this.lastDetectionTime;
    
    // Check if value is within valid range with hysteresis
    const inRange = this.isCurrentlyDetected
      ? rawValue >= (this.currentConfig.MIN_RED_THRESHOLD - this.currentConfig.HYSTERESIS) &&
        rawValue <= (this.currentConfig.MAX_RED_THRESHOLD + this.currentConfig.HYSTERESIS)
      : rawValue >= this.currentConfig.MIN_RED_THRESHOLD &&
        rawValue <= this.currentConfig.MAX_RED_THRESHOLD;

    if (!inRange) {
      this.consecutiveDetections = 0;
      this.stableFrameCount = Math.max(0, this.stableFrameCount - 1);
      
      if (timeSinceLastDetection > this.DETECTION_TIMEOUT) {
        this.isCurrentlyDetected = false;
      }
      
      return { isFingerDetected: this.isCurrentlyDetected, quality: 0 };
    }

    // Analyze signal stability - scientifically validated measure
    const stability = this.calculateStability();
    this.lastSignalStability = stability;
    this.stabilityHistory.push(stability);
    
    // Keep stability history limited
    if (this.stabilityHistory.length > 30) {
      this.stabilityHistory.shift();
    }
    
    if (stability > 0.7) {
      this.stableFrameCount = Math.min(
        this.stableFrameCount + 1,
        this.currentConfig.MIN_STABILITY_COUNT * 2
      );
    } else {
      this.stableFrameCount = Math.max(0, this.stableFrameCount - 0.5);
    }

    // Update detection state
    const isStableNow = this.stableFrameCount >= this.currentConfig.MIN_STABILITY_COUNT;

    if (isStableNow) {
      this.consecutiveDetections++;
      if (this.consecutiveDetections >= this.currentConfig.MIN_CONSECUTIVE_DETECTIONS) {
        this.isCurrentlyDetected = true;
        this.lastDetectionTime = currentTime;
      }
    } else {
      this.consecutiveDetections = Math.max(0, this.consecutiveDetections - 1);
    }

    // Calculate signal quality based on photoplethysmography principles
    const stabilityScore = this.stableFrameCount / (this.currentConfig.MIN_STABILITY_COUNT * 2);
    const intensityScore = Math.min((rawValue - this.currentConfig.MIN_RED_THRESHOLD) / 
                                (this.currentConfig.MAX_RED_THRESHOLD - this.currentConfig.MIN_RED_THRESHOLD), 1);
    
    // If we have matched a pattern, improve quality score
    const patternBonus = this.hasMatchingPattern() ? 0.1 : 0;
    
    const quality = Math.round((stabilityScore * 0.6 + intensityScore * 0.3 + patternBonus) * 100);

    return {
      isFingerDetected: this.isCurrentlyDetected,
      quality: this.isCurrentlyDetected ? quality : 0
    };
  }

  /**
   * Calculate signal stability
   */
  private calculateStability(): number {
    if (this.lastValues.length < 2) return 0;
    
    // Stability calculation based on research
    const variations = this.lastValues.slice(1).map((val, i) => 
      Math.abs(val - this.lastValues[i])
    );
    
    const avgVariation = variations.reduce((sum, val) => sum + val, 0) / variations.length;
    return Math.max(0, Math.min(1, 1 - (avgVariation / 50)));
  }
  
  /**
   * Learn signal patterns for optimized processing
   */
  private learnPattern(): void {
    if (this.lastValues.length < 10) return;
    
    // Extract the last 10 values as a pattern
    const pattern = this.lastValues.slice(-10);
    
    // Normalize pattern (important for comparison)
    const min = Math.min(...pattern);
    const max = Math.max(...pattern);
    const range = max - min;
    
    if (range < 2) return; // Skip patterns with minimal variation
    
    const normalizedPattern = pattern.map(val => (val - min) / range);
    
    // Store pattern with timestamp
    this.signalPatterns.push({
      pattern: normalizedPattern,
      timestamp: Date.now()
    });
    
    // Keep only last 5 patterns
    if (this.signalPatterns.length > 5) {
      this.signalPatterns.shift();
    }
  }
  
  /**
   * Check if current signal matches learned patterns
   */
  private hasMatchingPattern(): boolean {
    if (this.signalPatterns.length === 0 || this.lastValues.length < 10) {
      return false;
    }
    
    // Get current pattern
    const currentPattern = this.lastValues.slice(-10);
    
    // Normalize current pattern
    const min = Math.min(...currentPattern);
    const max = Math.max(...currentPattern);
    const range = max - min;
    
    if (range < 2) return false;
    
    const normalizedCurrent = currentPattern.map(val => (val - min) / range);
    
    // Compare with stored patterns
    for (const storedPattern of this.signalPatterns) {
      // Calculate similarity
      let similarity = 0;
      for (let i = 0; i < 10; i++) {
        similarity += 1 - Math.abs(normalizedCurrent[i] - storedPattern.pattern[i]);
      }
      similarity /= 10;
      
      if (similarity > this.patternMatchThreshold) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Detect region of interest
   */
  private detectROI(redValue: number): ProcessedSignal['roi'] {
    // Constant ROI for simplification
    return {
      x: 0,
      y: 0,
      width: 100,
      height: 100
    };
  }

  /**
   * Handle processor errors
   */
  private handleError(code: string, message: string): void {
    console.error("PPGSignalProcessor: Error", code, message);
    const error: ProcessingError = {
      code,
      message,
      timestamp: Date.now()
    };
    this.onError?.(error);
  }
}
