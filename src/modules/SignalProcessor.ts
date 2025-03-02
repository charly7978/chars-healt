import { ProcessedSignal, ProcessingError, SignalProcessor } from '../types/signal';

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
  
  // Configuration settings
  private readonly DEFAULT_CONFIG = {
    BUFFER_SIZE: 15,           // Buffer for signal analysis
    MIN_RED_THRESHOLD: 40,     // Minimum threshold for red channel
    MAX_RED_THRESHOLD: 250,    // Maximum threshold for red channel
    STABILITY_WINDOW: 6,       // Window for stability analysis
    MIN_STABILITY_COUNT: 5,    // Increased from 4 to require more stable frames
    HYSTERESIS: 5,             // Hysteresis to avoid fluctuations
    MIN_CONSECUTIVE_DETECTIONS: 4,  // Increased from 3 to require more consecutive detections
    QUALITY_THRESHOLD_POOR: 30,    // New: threshold for poor quality
    QUALITY_THRESHOLD_ACCEPTABLE: 50,  // New: threshold for acceptable quality
    QUALITY_THRESHOLD_GOOD: 75     // New: threshold for good quality
  };

  private currentConfig: typeof this.DEFAULT_CONFIG;
  private stableFrameCount: number = 0;
  private lastStableValue: number = 0;
  private consecutiveDetections: number = 0;
  private isCurrentlyDetected: boolean = false;
  private lastDetectionTime: number = 0;
  private readonly DETECTION_TIMEOUT = 500; // 500ms timeout

  /**
   * Constructor
   */
  constructor(
    public onSignalReady?: (signal: ProcessedSignal) => void,
    public onError?: (error: ProcessingError) => void
  ) {
    this.kalmanFilter = new KalmanFilter();
    this.currentConfig = { ...this.DEFAULT_CONFIG };
    console.log("PPGSignalProcessor: Instance created");
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
      this.kalmanFilter.reset();
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
      console.log("PPGSignalProcessor: Not processing");
      return;
    }

    try {
      // Extract PPG signal based on scientific evidence
      const redValue = this.extractRedChannel(imageData);
      const filtered = this.kalmanFilter.filter(redValue);
      this.lastValues.push(filtered);
      
      if (this.lastValues.length > this.currentConfig.BUFFER_SIZE) {
        this.lastValues.shift();
      }

      const { isFingerDetected, quality } = this.analyzeSignal(filtered, redValue);

      console.log("PPGSignalProcessor: Analysis", {
        redValue,
        filtered,
        isFingerDetected,
        quality,
        stableFrames: this.stableFrameCount
      });

      const processedSignal: ProcessedSignal = {
        timestamp: Date.now(),
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
   * Extract red channel from image data
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
    
    for (let y = startY; y < endY; y++) {
      for (let x = startX; x < endX; x++) {
        const i = (y * imageData.width + x) * 4;
        redSum += data[i];     // Red channel
        greenSum += data[i+1]; // Green channel
        blueSum += data[i+2];  // Blue channel
        count++;
      }
    }
    
    const avgRed = redSum / count;
    const avgGreen = greenSum / count;
    const avgBlue = blueSum / count;

    // Check red channel dominance (characteristic of blood-containing tissue)
    const isRedDominant = avgRed > (avgGreen * 1.25) && avgRed > (avgBlue * 1.25); // Increased from 1.2 to 1.25 for stronger red dominance requirement
    
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
    if (stability > 0.75) { // Increased from 0.7 to 0.75 for stricter stability requirement
      this.stableFrameCount = Math.min(
        this.stableFrameCount + 1,
        this.currentConfig.MIN_STABILITY_COUNT * 2
      );
    } else {
      // More gradual decrease for stability - add a fractional decrease for smoother transition
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
      // More gradual decrease for consecutive detections - add fractional decrease
      this.consecutiveDetections = Math.max(0, this.consecutiveDetections - 1);
    }

    // Calculate signal quality based on photoplethysmography principles
    const stabilityScore = this.stableFrameCount / (this.currentConfig.MIN_STABILITY_COUNT * 2);
    const intensityScore = Math.min((rawValue - this.currentConfig.MIN_RED_THRESHOLD) / 
                                (this.currentConfig.MAX_RED_THRESHOLD - this.currentConfig.MIN_RED_THRESHOLD), 1);
    
    // Improved quality calculation with smoother gradient between quality levels
    let quality = Math.round((stabilityScore * 0.6 + intensityScore * 0.4) * 100);
    
    // Apply more gradual quality transitions with some hysteresis
    if (quality < this.currentConfig.QUALITY_THRESHOLD_POOR) {
      // Keep very low quality as is
      quality = quality;
    } else if (quality < this.currentConfig.QUALITY_THRESHOLD_ACCEPTABLE) {
      // Poor but detectable quality range - make sure it's visible to user
      quality = Math.max(this.currentConfig.QUALITY_THRESHOLD_POOR + 5, quality);
    } else if (quality < this.currentConfig.QUALITY_THRESHOLD_GOOD) {
      // Acceptable quality range - ensure clear difference from poor
      quality = Math.max(this.currentConfig.QUALITY_THRESHOLD_ACCEPTABLE + 3, quality);
    } else {
      // Good quality range - keep as is
      quality = quality;
    }

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
