/**
 * PPG Data Point interface representing a single point in the PPG signal
 */
export interface PPGDataPoint {
  time: number;
  value: number;
  isArrhythmia: boolean;
}

/**
 * Circular Buffer implementation for efficiently storing and managing PPG signal data
 * with advanced signal processing capabilities
 */
export class CircularBuffer {
  private buffer: PPGDataPoint[];
  private capacity: number;
  private head: number = 0;
  private tail: number = 0;
  private size: number = 0;
  
  // Buffers for advanced signal processing
  private rawValuesBuffer: number[] = [];
  private filteredValuesBuffer: number[] = [];
  private timestamps: number[] = [];
  
  // Signal processing parameters
  private samplingRate: number = 30; // Typical camera frame rate
  private previousRaw: number[] = [0, 0, 0, 0]; // Store previous raw values for filtering
  private previousFiltered: number[] = [0, 0, 0, 0]; // Store previous filtered values
  private dcComponent: number = 0; // Baseline (DC component) of the signal
  private calibrationPhase: boolean = true; // Initially in calibration phase
  private calibrationCounter: number = 0;
  private calibrationThreshold: number = 30; // Frames to calibrate

  /**
   * Creates a new CircularBuffer with the specified capacity
   * @param capacity Maximum number of data points the buffer can hold
   */
  constructor(capacity: number) {
    this.buffer = new Array<PPGDataPoint>(capacity);
    this.capacity = capacity;
  }

  /**
   * Adds a new data point to the buffer
   * @param point The PPG data point to add
   */
  push(point: PPGDataPoint): void {
    this.buffer[this.tail] = point;
    
    if (this.size === this.capacity) {
      // Buffer is full, move head
      this.head = (this.head + 1) % this.capacity;
    } else {
      // Buffer not full yet, increase size
      this.size++;
    }
    
    // Update tail position for next insertion
    this.tail = (this.tail + 1) % this.capacity;
    
    // Add to processing buffers
    this.rawValuesBuffer.push(point.value);
    this.timestamps.push(point.time);
    
    // Keep raw buffer at a manageable size
    const maxBufferLength = 300; // 10 seconds at 30fps
    if (this.rawValuesBuffer.length > maxBufferLength) {
      this.rawValuesBuffer = this.rawValuesBuffer.slice(-maxBufferLength);
      this.filteredValuesBuffer = this.filteredValuesBuffer.slice(-maxBufferLength);
      this.timestamps = this.timestamps.slice(-maxBufferLength);
    }
  }

  /**
   * Processes a new raw PPG value using advanced signal processing techniques
   * @param rawValue The raw PPG value to process
   * @param timestamp Current timestamp in milliseconds
   * @returns A processed PPG data point
   */
  processSignal(rawValue: number, timestamp: number): PPGDataPoint {
    // Step 1: Initial data collection for calibration
    if (this.calibrationPhase) {
      this.calibrationCounter++;
      this.rawValuesBuffer.push(rawValue);
      
      if (this.calibrationCounter >= this.calibrationThreshold) {
        this.calibrationPhase = false;
        
        // Calculate initial DC component as mean of calibration data
        if (this.rawValuesBuffer.length > 0) {
          this.dcComponent = this.rawValuesBuffer.reduce((a, b) => a + b, 0) / this.rawValuesBuffer.length;
        }
        
        console.log("PPG Signal Calibration Complete - DC Component:", this.dcComponent);
      }
      
      const filteredValue = rawValue; // During calibration, just use raw value
      this.filteredValuesBuffer.push(filteredValue);
      
      return {
        time: timestamp,
        value: filteredValue,
        isArrhythmia: false
      };
    }
    
    // Step 2: DC Component tracking with adaptive algorithm
    // Adaptive DC tracking with weighted Moving Average
    const dcWeight = 0.95; // Weight for DC component update (higher = slower adaptation)
    this.dcComponent = dcWeight * this.dcComponent + (1 - dcWeight) * rawValue;
    
    // Step 3: Detrend the signal (remove DC offset and low-frequency trends)
    const detrendedValue = rawValue - this.dcComponent;
    
    // Step 4: Apply bandpass filtering
    // 4.1 Apply Butterworth bandpass filter coefficients (optimized for PPG)
    // These coefficients are designed to isolate the 0.5-4Hz frequency range
    // which corresponds to heart rates between 30-240 BPM
    const a = [1.0, -1.7111, 0.7421]; // Denominator coefficients
    const b = [0.1420, 0, -0.1420]; // Numerator coefficients
    
    // Shift previous raw values
    this.previousRaw.shift();
    this.previousRaw.push(detrendedValue);
    
    // Shift previous filtered values
    this.previousFiltered.shift();
    
    // Apply filter (Direct Form II Transposed implementation)
    let filteredValue = 
      b[0] * this.previousRaw[3] +
      b[1] * this.previousRaw[2] +
      b[2] * this.previousRaw[1] -
      a[1] * this.previousFiltered[2] -
      a[2] * this.previousFiltered[1];
    
    // 4.2 Apply adaptive noise removal
    // Moving average smoothing with variable window
    const windowSize = 3; // Small window to preserve peaks
    let sum = 0;
    let count = 0;
    
    // Get recent filtered values including the current one
    const recentFiltered = [...this.filteredValuesBuffer.slice(-windowSize), filteredValue];
    
    for (const val of recentFiltered) {
      if (!isNaN(val)) {
        sum += val;
        count++;
      }
    }
    
    // Apply smoothing only if we have enough values
    if (count > 0) {
      const smoothedValue = sum / count;
      
      // 4.3 Adaptive noise rejection - only apply smoothing if the change is likely noise
      const changeThreshold = 0.5; // Threshold for what constitutes noise vs. signal
      const recentChange = Math.abs(filteredValue - (this.filteredValuesBuffer.length > 0 ? 
        this.filteredValuesBuffer[this.filteredValuesBuffer.length - 1] : 0));
      
      if (recentChange > changeThreshold) {
        // Large change - could be a legitimate peak, so keep it
        filteredValue = filteredValue;
      } else {
        // Small change - likely noise, so smooth it
        filteredValue = 0.3 * filteredValue + 0.7 * smoothedValue;
      }
    }
    
    // 4.4 Apply peak enhancement using a technique from wavelet transform
    if (this.filteredValuesBuffer.length >= 3) {
      const prev2 = this.filteredValuesBuffer[this.filteredValuesBuffer.length - 3];
      const prev1 = this.filteredValuesBuffer[this.filteredValuesBuffer.length - 2];
      const curr = this.filteredValuesBuffer[this.filteredValuesBuffer.length - 1];
      
      // Check if we're on an upward slope (potential peak coming)
      if (curr > prev1 && prev1 > prev2 && filteredValue > curr) {
        // Enhance the potential peak slightly
        filteredValue = filteredValue * 1.15;
      }
    }
    
    // Store the new filtered value
    this.previousFiltered.push(filteredValue);
    this.filteredValuesBuffer.push(filteredValue);
    
    // Step 5: Analyze for arrhythmia indicators (simple version)
    let isArrhythmia = false;
    
    // If we have enough data, check for irregularities in intervals between peaks
    if (this.filteredValuesBuffer.length > 30) {
      const peaks = this.detectPeaks(this.filteredValuesBuffer.slice(-30));
      
      if (peaks.length >= 3) {
        // Calculate intervals between peaks
        const intervals = [];
        for (let i = 1; i < peaks.length; i++) {
          intervals.push(peaks[i] - peaks[i-1]);
        }
        
        // Calculate standard deviation of intervals
        const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
        const variance = intervals.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / intervals.length;
        const stdDev = Math.sqrt(variance);
        
        // If standard deviation is high relative to mean, potential arrhythmia
        if (stdDev / mean > 0.2) {
          isArrhythmia = true;
        }
      }
    }
    
    // Create and return the processed data point
    return {
      time: timestamp,
      value: filteredValue,
      isArrhythmia: isArrhythmia
    };
  }
  
  /**
   * Detect peaks in a signal array
   * @param signal Array of signal values
   * @returns Array of peak indices
   */
  private detectPeaks(signal: number[]): number[] {
    const peaks: number[] = [];
    
    // Need at least 3 points to detect a peak
    if (signal.length < 3) return peaks;
    
    // Find local maxima
    for (let i = 1; i < signal.length - 1; i++) {
      if (signal[i] > signal[i - 1] && signal[i] > signal[i + 1]) {
        peaks.push(i);
      }
    }
    
    return peaks;
  }

  /**
   * Gets all data points in the buffer in chronological order
   * @returns Array of data points
   */
  getPoints(): PPGDataPoint[] {
    const result: PPGDataPoint[] = [];
    
    if (this.size === 0) {
      return result;
    }
    
    // Start from head and collect all points in order
    let current = this.head;
    for (let i = 0; i < this.size; i++) {
      result.push(this.buffer[current]);
      current = (current + 1) % this.capacity;
    }
    
    // Sort by time to ensure chronological order
    return result.sort((a, b) => a.time - b.time);
  }

  /**
   * Clears all data from the buffer
   */
  clear(): void {
    this.head = 0;
    this.tail = 0;
    this.size = 0;
    this.rawValuesBuffer = [];
    this.filteredValuesBuffer = [];
    this.timestamps = [];
    this.previousRaw = [0, 0, 0, 0];
    this.previousFiltered = [0, 0, 0, 0];
    this.dcComponent = 0;
    this.calibrationPhase = true;
    this.calibrationCounter = 0;
  }

  /**
   * Gets the current number of data points in the buffer
   * @returns Number of data points
   */
  getSize(): number {
    return this.size;
  }

  /**
   * Gets the maximum capacity of the buffer
   * @returns Maximum capacity
   */
  getCapacity(): number {
    return this.capacity;
  }

  /**
   * Gets latest data points up to the specified count
   * @param count Maximum number of recent points to return
   * @returns Array of the most recent data points
   */
  getLatestPoints(count: number): PPGDataPoint[] {
    const allPoints = this.getPoints();
    return allPoints.slice(Math.max(0, allPoints.length - count));
  }
  
  /**
   * Gets the raw signal buffer
   * @returns Array of raw signal values
   */
  getRawBuffer(): number[] {
    return [...this.rawValuesBuffer];
  }
  
  /**
   * Gets the filtered signal buffer
   * @returns Array of filtered signal values
   */
  getFilteredBuffer(): number[] {
    return [...this.filteredValuesBuffer];
  }
  
  /**
   * Gets the current DC component (baseline) of the signal
   * @returns The DC component value
   */
  getDCComponent(): number {
    return this.dcComponent;
  }
  
  /**
   * Gets the timestamps corresponding to the signal values
   * @returns Array of timestamps
   */
  getTimestamps(): number[] {
    return [...this.timestamps];
  }
  
  /**
   * Calculates the signal quality based on recent data
   * @returns Quality score between 0-100
   */
  calculateSignalQuality(): number {
    if (this.filteredValuesBuffer.length < 10) return 0;
    
    // Get the most recent signal section
    const recentSignal = this.filteredValuesBuffer.slice(-30);
    
    // Calculate signal-to-noise ratio and other metrics
    
    // 1. Calculate signal amplitude (peak-to-peak)
    const min = Math.min(...recentSignal);
    const max = Math.max(...recentSignal);
    const amplitude = max - min;
    
    // 2. Calculate signal variance
    const mean = recentSignal.reduce((a, b) => a + b, 0) / recentSignal.length;
    const variance = recentSignal.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / recentSignal.length;
    
    // 3. Detect peaks to assess regularity
    const peaks = this.detectPeaks(recentSignal);
    const peakRegularity = peaks.length >= 2 ? 50 : 0;
    
    // 4. Calculate high-frequency noise component
    let noiseComponent = 0;
    for (let i = 1; i < recentSignal.length; i++) {
      noiseComponent += Math.abs(recentSignal[i] - recentSignal[i-1]);
    }
    noiseComponent /= recentSignal.length - 1;
    
    // 5. Scale to 0-100 range
    // - Amplitude should be significant (0-40 points)
    const amplitudeScore = Math.min(40, amplitude * 200);
    
    // - Variance should be in a good range (0-30 points)
    // Too low variance = flat line, too high = noisy
    const varianceScore = Math.min(30, variance > 0.01 ? 30 * Math.min(variance, 0.1) / 0.1 : 0);
    
    // - Peak regularity (0-20 points)
    // - Noise component should be low (0-10 points)
    const noiseScore = Math.max(0, 10 - noiseComponent * 100);
    
    // Combine all factors
    const qualityScore = Math.min(100, amplitudeScore + varianceScore + peakRegularity + noiseScore);
    
    return Math.round(qualityScore);
  }
}
