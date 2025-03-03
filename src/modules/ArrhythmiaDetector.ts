/**
 * ArrhythmiaDetector.ts
 * 
 * Specialized detector focused exclusively on identifying real premature heartbeats
 * from PPG signals with maximum precision and minimum false positives.
 */

export class ArrhythmiaDetector {
  // Constants optimized specifically for premature beat detection
  private readonly RR_WINDOW_SIZE = 5;
  private readonly LEARNING_PERIOD = 3000; // Extended learning period for better baseline
  
  // Thresholds focused specifically on premature beat patterns
  private readonly PREMATURE_BEAT_THRESHOLD = 0.70; // Timing threshold for premature beats
  private readonly AMPLITUDE_RATIO_THRESHOLD = 0.65; // Premature beats typically have 65% or less amplitude
  private readonly NORMAL_PEAK_MIN_THRESHOLD = 0.90; // Higher threshold for normal beats
  
  // Rhythm deviation threshold specifically for premature beat timing
  private readonly RHYTHM_DEVIATION_THRESHOLD = 0.30; // Detect early beats (30% earlier than expected)
  
  // Minimum confidence for detection to reduce false positives
  private readonly MIN_CONFIDENCE_THRESHOLD = 0.85; // Increased confidence threshold
  
  // Pattern recognition cooldown to prevent multiple detections of the same event
  private readonly DETECTION_COOLDOWN = 650; // ms between detections

  // State variables
  private rrIntervals: number[] = [];
  private amplitudes: number[] = []; // Store amplitudes to detect small beats
  private peakTimes: number[] = []; // Store exact timing of each peak
  private isLearningPhase = true;
  private arrhythmiaDetected = false;
  private arrhythmiaCount = 0;
  private measurementStartTime: number = Date.now();
  private lastArrhythmiaTime: number = 0;
  private lastPeakTime: number | null = null;
  private avgNormalAmplitude: number = 0;
  private baseRRInterval: number = 0; // Average normal RR interval
  
  // Rhythm pattern learning
  private rhythmPattern: number[] = [];
  private expectedNextBeatTime: number = 0;
  
  // Sequence tracking for pattern recognition
  private peakSequence: Array<{
    amplitude: number;
    time: number;
    type: 'normal' | 'premature' | 'unknown';
  }> = [];
  
  // Stability tracking
  private consecutiveNormalBeats: number = 0;
  
  // Debug mode for development
  private readonly DEBUG_MODE = false;
  
  /**
   * Reset detector state
   */
  reset(): void {
    this.rrIntervals = [];
    this.amplitudes = [];
    this.peakTimes = [];
    this.isLearningPhase = true;
    this.arrhythmiaDetected = false;
    this.arrhythmiaCount = 0;
    this.measurementStartTime = Date.now();
    this.lastArrhythmiaTime = 0;
    this.lastPeakTime = null;
    this.avgNormalAmplitude = 0;
    this.baseRRInterval = 0;
    this.peakSequence = [];
    this.rhythmPattern = [];
    this.expectedNextBeatTime = 0;
    this.consecutiveNormalBeats = 0;
  }

  /**
   * Check if in learning phase
   */
  isInLearningPhase(): boolean {
    const timeSinceStart = Date.now() - this.measurementStartTime;
    return timeSinceStart <= this.LEARNING_PERIOD;
  }

  /**
   * Update learning phase status
   */
  updateLearningPhase(): void {
    if (this.isLearningPhase) {
      const timeSinceStart = Date.now() - this.measurementStartTime;
      if (timeSinceStart > this.LEARNING_PERIOD) {
        this.isLearningPhase = false;
        
        // Calculate baseline values after learning phase
        if (this.amplitudes.length > 5) {
          // Use upper median for normal amplitude reference
          const sortedAmplitudes = [...this.amplitudes].sort((a, b) => b - a);
          const normalCount = Math.max(3, Math.ceil(sortedAmplitudes.length * 0.33));
          const topAmplitudes = sortedAmplitudes.slice(0, normalCount);
          this.avgNormalAmplitude = topAmplitudes.reduce((a, b) => a + b, 0) / topAmplitudes.length;
          
          if (this.DEBUG_MODE) {
            console.log('ArrhythmiaDetector - Normal amplitude reference:', this.avgNormalAmplitude);
          }
        }
        
        // Calculate normal RR interval reference
        if (this.rrIntervals.length > 5) {
          // Sort RR intervals and remove outliers
          const sortedRR = [...this.rrIntervals].sort((a, b) => a - b);
          const cutSize = Math.max(1, Math.floor(sortedRR.length * 0.1));
          const filteredRR = sortedRR.slice(cutSize, sortedRR.length - cutSize);
          
          // Use median as reference
          const medianIndex = Math.floor(filteredRR.length / 2);
          this.baseRRInterval = filteredRR[medianIndex];
          
          // Learn rhythm pattern
          this.learnRhythmPattern();
          
          if (this.DEBUG_MODE) {
            console.log('ArrhythmiaDetector - Base RR interval:', this.baseRRInterval);
          }
        }
      }
    }
  }

  /**
   * Learn the heart rhythm pattern based on RR intervals
   */
  private learnRhythmPattern(): void {
    if (this.rrIntervals.length < 4) return;
    
    // Use last 4 intervals that aren't too different from each other
    const lastIntervals = this.rrIntervals.slice(-4);
    const avgInterval = lastIntervals.reduce((sum, val) => sum + val, 0) / lastIntervals.length;
    
    // Filter to include only intervals within 20% of the average
    const normalIntervals = lastIntervals.filter(interval => 
      Math.abs(interval - avgInterval) / avgInterval < 0.2
    );
    
    if (normalIntervals.length >= 3) {
      this.rhythmPattern = [...normalIntervals];
      
      // Calculate next expected beat time
      if (this.lastPeakTime && this.rhythmPattern.length > 0) {
        const nextExpectedInterval = this.rhythmPattern[this.rhythmPattern.length - 1];
        this.expectedNextBeatTime = this.lastPeakTime + nextExpectedInterval;
      }
    }
  }

  /**
   * Update RR intervals and peak amplitudes with new data
   */
  updateIntervals(intervals: number[], lastPeakTime: number | null, peakAmplitude?: number): void {
    // Validate input data
    if (!intervals || intervals.length === 0) {
      return;
    }

    const currentTime = Date.now();
    
    // Store valid intervals within physiological range (30-200 BPM)
    this.rrIntervals = intervals.filter(interval => interval >= 300 && interval <= 2000);
    this.lastPeakTime = lastPeakTime;
    
    // Update expected next beat time based on rhythm pattern
    if (lastPeakTime && this.rhythmPattern.length > 0 && !this.isLearningPhase) {
      const patternIndex = this.peakTimes.length % this.rhythmPattern.length;
      const expectedInterval = this.rhythmPattern[patternIndex];
      this.expectedNextBeatTime = lastPeakTime + expectedInterval;
    }
    
    // Store peak time
    if (lastPeakTime) {
      this.peakTimes.push(lastPeakTime);
      // Keep only the most recent 10 times
      if (this.peakTimes.length > 10) {
        this.peakTimes.shift();
      }
    }
    
    // Store peak amplitude if provided
    if (typeof peakAmplitude === 'number' && !isNaN(peakAmplitude) && peakAmplitude > 0) {
      this.amplitudes.push(Math.abs(peakAmplitude));
      
      // Update peak sequence
      if (lastPeakTime) {
        // Initial classification as unknown
        let peakType: 'normal' | 'premature' | 'unknown' = 'unknown';
        
        // Classify based on amplitude if reference is available
        if (this.avgNormalAmplitude > 0 && !this.isLearningPhase) {
          const ratio = Math.abs(peakAmplitude) / this.avgNormalAmplitude;
          
          // Classify as normal if close to or above normal average
          if (ratio >= this.NORMAL_PEAK_MIN_THRESHOLD) {
            peakType = 'normal';
            this.consecutiveNormalBeats++;
          } 
          // Classify as premature if significantly smaller
          else if (ratio <= this.AMPLITUDE_RATIO_THRESHOLD) {
            peakType = 'premature';
            this.consecutiveNormalBeats = 0;
          } else {
            this.consecutiveNormalBeats = 0;
          }
        }
        
        this.peakSequence.push({
          amplitude: Math.abs(peakAmplitude),
          time: currentTime,
          type: peakType
        });
        
        // Keep only the most recent 10 peaks
        if (this.peakSequence.length > 10) {
          this.peakSequence.shift();
        }
      }
      
      // Keep amplitudes and intervals in sync
      if (this.amplitudes.length > this.rrIntervals.length) {
        this.amplitudes = this.amplitudes.slice(-this.rrIntervals.length);
      }
    }
    
    this.updateLearningPhase();
  }

  /**
   * Core detection algorithm: focused exclusively on identifying real premature beats
   * using two complementary methods:
   * 1. Rhythm-based detection: beats occurring earlier than the expected rhythm
   * 2. Morphology-based detection: characteristic small peaks between normal peaks
   */
  detect(): {
    detected: boolean;
    count: number;
    status: string;
    data: { rmssd: number; rrVariation: number; prematureBeat: boolean; confidence?: number } | null;
  } {
    // Skip detection during learning phase or with insufficient data
    if (this.rrIntervals.length < 3 || this.amplitudes.length < 3 || this.isLearningPhase) {
      return {
        detected: false,
        count: this.arrhythmiaCount,
        status: this.arrhythmiaCount > 0 ? 
          `ARRITMIA DETECTADA|${this.arrhythmiaCount}` : 
          `SIN ARRITMIAS|${this.arrhythmiaCount}`,
        data: null
      };
    }

    const currentTime = Date.now();
    
    // Calculate RMSSD (root mean square of successive differences)
    let sumSquaredDiff = 0;
    for (let i = 1; i < this.rrIntervals.length; i++) {
      const diff = this.rrIntervals[i] - this.rrIntervals[i-1];
      sumSquaredDiff += diff * diff;
    }
    const rmssd = Math.sqrt(sumSquaredDiff / (this.rrIntervals.length - 1));
    
    // Look for premature beats using timing and rhythm pattern
    let prematureBeatDetected = false;
    let detectionConfidence = 0;
    
    // METHOD 1: RHYTHM-BASED DETECTION
    // Check if the last beat occurred significantly earlier than expected
    if (this.lastPeakTime && this.expectedNextBeatTime > 0 && 
        this.peakSequence.length >= 3 && this.consecutiveNormalBeats >= 3) {
      
      // Calculate how early the beat occurred compared to expected time
      const timeDifference = this.lastPeakTime - this.expectedNextBeatTime;
      const relativeDeviation = Math.abs(timeDifference) / this.baseRRInterval;
      
      // Premature beats occur significantly earlier than expected
      if (timeDifference < 0 && relativeDeviation > this.RHYTHM_DEVIATION_THRESHOLD) {
        // Also check if amplitude is smaller (characteristic of premature beats)
        const lastPeak = this.peakSequence[this.peakSequence.length - 1];
        const previousPeak = this.peakSequence[this.peakSequence.length - 2];
        
        if (lastPeak.amplitude < previousPeak.amplitude * this.AMPLITUDE_RATIO_THRESHOLD) {
          prematureBeatDetected = true;
          detectionConfidence = 0.88 + (relativeDeviation * 0.1); // Higher confidence for more premature beats
          
          if (this.DEBUG_MODE) {
            console.log('ArrhythmiaDetector - Premature beat detected by rhythm pattern', {
              expected: this.expectedNextBeatTime,
              actual: this.lastPeakTime,
              deviation: relativeDeviation,
              amplitudeRatio: lastPeak.amplitude / previousPeak.amplitude
            });
          }
        }
      }
    }
    
    // METHOD 2: MORPHOLOGY-BASED DETECTION
    // Look for the classic pattern: normal-premature-normal sequence
    if (!prematureBeatDetected && this.peakSequence.length >= 3) {
      const lastThreePeaks = this.peakSequence.slice(-3);
      
      // Explicitly classify peaks by amplitude
      for (let i = 0; i < lastThreePeaks.length; i++) {
        const peak = lastThreePeaks[i];
        const ratio = peak.amplitude / this.avgNormalAmplitude;
        
        if (ratio >= this.NORMAL_PEAK_MIN_THRESHOLD) {
          lastThreePeaks[i].type = 'normal';
        } else if (ratio <= this.AMPLITUDE_RATIO_THRESHOLD) {
          lastThreePeaks[i].type = 'premature';
        } else {
          lastThreePeaks[i].type = 'unknown';
        }
      }
      
      // Check for normal-premature-normal pattern
      if (
        lastThreePeaks[0].type === 'normal' && 
        lastThreePeaks[1].type === 'premature' && 
        lastThreePeaks[2].type === 'normal'
      ) {
        // Verify amplitude relationships match expected pattern
        const firstPeakRatio = lastThreePeaks[0].amplitude / this.avgNormalAmplitude;
        const secondPeakRatio = lastThreePeaks[1].amplitude / this.avgNormalAmplitude;
        const thirdPeakRatio = lastThreePeaks[2].amplitude / this.avgNormalAmplitude;
        
        // Premature beat must be significantly smaller than surrounding normal beats
        if (secondPeakRatio <= this.AMPLITUDE_RATIO_THRESHOLD && 
            secondPeakRatio < firstPeakRatio * 0.75 && 
            secondPeakRatio < thirdPeakRatio * 0.75 && 
            firstPeakRatio >= this.NORMAL_PEAK_MIN_THRESHOLD && 
            thirdPeakRatio >= this.NORMAL_PEAK_MIN_THRESHOLD) {
          
          prematureBeatDetected = true;
          detectionConfidence = 0.92; // High confidence for this classic pattern
          
          if (this.DEBUG_MODE) {
            console.log('ArrhythmiaDetector - Premature beat detected by morphology pattern', {
              prematureRatio: secondPeakRatio,
              normalRatios: [firstPeakRatio, thirdPeakRatio]
            });
          }
        }
      }
    }
    
    // Calculate RR variation for additional information
    const rrVariation = (this.rrIntervals.length > 1) ? 
      Math.abs(this.rrIntervals[this.rrIntervals.length - 1] - this.baseRRInterval) / this.baseRRInterval : 
      0;
    
    // Count arrhythmia only if:
    // 1. A premature beat was detected
    // 2. Confidence exceeds minimum threshold
    // 3. Enough time has passed since last detection to avoid duplicates
    if (prematureBeatDetected && 
        detectionConfidence >= this.MIN_CONFIDENCE_THRESHOLD && 
        currentTime - this.lastArrhythmiaTime > this.DETECTION_COOLDOWN) {
      
      this.arrhythmiaCount++;
      this.lastArrhythmiaTime = currentTime;
      this.consecutiveNormalBeats = 0; // Reset normal beat counter
      
      // Update rhythm pattern after arrhythmia
      if (this.rrIntervals.length >= 4) {
        this.learnRhythmPattern();
      }
      
      if (this.DEBUG_MODE) {
        console.log('ArrhythmiaDetector - NEW ARRHYTHMIA COUNTED:', {
          count: this.arrhythmiaCount,
          confidence: detectionConfidence,
          timestamp: new Date(currentTime).toISOString(),
          peakSequence: this.peakSequence.slice(-5).map(p => ({
            type: p.type,
            ratio: p.amplitude / this.avgNormalAmplitude
          }))
        });
      }
    }

    this.arrhythmiaDetected = prematureBeatDetected;

    return {
      detected: this.arrhythmiaDetected,
      count: this.arrhythmiaCount,
      status: this.arrhythmiaCount > 0 ? 
        `ARRITMIA DETECTADA|${this.arrhythmiaCount}` : 
        `SIN ARRITMIAS|${this.arrhythmiaCount}`,
      data: { 
        rmssd, 
        rrVariation, 
        prematureBeat: prematureBeatDetected,
        confidence: detectionConfidence
      }
    };
  }

  /**
   * Get current arrhythmia status
   */
  getStatus(): string {
    return this.arrhythmiaCount > 0 ? 
      `ARRITMIA DETECTADA|${this.arrhythmiaCount}` : 
      `SIN ARRITMIAS|${this.arrhythmiaCount}`;
  }

  /**
   * Get current arrhythmia count
   */
  getCount(): number {
    return this.arrhythmiaCount;
  }
  
  /**
   * Clean memory function for resource management
   */
  cleanMemory(): void {
    this.reset();
  }
}
