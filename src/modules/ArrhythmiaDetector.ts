export class ArrhythmiaDetector {
  // Constants for arrhythmia detection
  private readonly RR_WINDOW_SIZE = 5;
  private readonly ARRHYTHMIA_LEARNING_PERIOD = 2000; // Reduced from 3000ms to detect earlier
  
  // More strict constants for premature beat detection - adjusted to prevent false positives
  private readonly PREMATURE_BEAT_THRESHOLD = 0.78; // Threshold for premature beat detection (more strict)
  private readonly AMPLITUDE_RATIO_THRESHOLD = 0.70; // Threshold for amplitude differences (more strict)
  private readonly POST_PREMATURE_THRESHOLD = 1.15; // Threshold for compensatory pause (more strict)
  
  // State variables
  private rrIntervals: number[] = [];
  private amplitudes: number[] = []; // Store amplitudes to detect small beats
  private isLearningPhase = true;
  private hasDetectedFirstArrhythmia = false;
  private arrhythmiaDetected = false;
  private measurementStartTime: number = Date.now();
  private arrhythmiaCount = 0;
  private lastRMSSD: number = 0;
  private lastRRVariation: number = 0;
  private lastArrhythmiaTime: number = 0;
  private lastPeakTime: number | null = null;
  private avgNormalAmplitude: number = 0;
  private baseRRInterval: number = 0; // Average normal RR interval
  
  // Tracking variables to improve detection
  private consecutiveNormalBeats: number = 0;
  private lastBeatsClassification: Array<'normal' | 'premature'> = [];
  
  // Variables for more robust detection
  private recentRRIntervals: number[] = [];
  private detectionSensitivity: number = 0.9; // Reduced from 1.2 to make detection more selective
  
  // Sequence tracking for better arrhythmia context analysis
  private lastNormalBeatsAmplitudes: number[] = [];
  private lastNormalBeatsRRs: number[] = [];
  
  // DEBUG flag to track detection issues
  private readonly DEBUG_MODE = true;
  
  /**
   * Reset all state variables
   */
  reset(): void {
    this.rrIntervals = [];
    this.amplitudes = [];
    this.isLearningPhase = true;
    this.hasDetectedFirstArrhythmia = false;
    this.arrhythmiaDetected = false;
    this.arrhythmiaCount = 0;
    this.measurementStartTime = Date.now();
    this.lastRMSSD = 0;
    this.lastRRVariation = 0;
    this.lastArrhythmiaTime = 0;
    this.lastPeakTime = null;
    this.avgNormalAmplitude = 0;
    this.baseRRInterval = 0;
    this.consecutiveNormalBeats = 0;
    this.lastBeatsClassification = [];
    this.lastNormalBeatsAmplitudes = [];
    this.lastNormalBeatsRRs = [];
  }

  /**
   * Check if in learning phase
   */
  isInLearningPhase(): boolean {
    const timeSinceStart = Date.now() - this.measurementStartTime;
    return timeSinceStart <= this.ARRHYTHMIA_LEARNING_PERIOD;
  }

  /**
   * Update learning phase status
   */
  updateLearningPhase(): void {
    if (this.isLearningPhase) {
      const timeSinceStart = Date.now() - this.measurementStartTime;
      if (timeSinceStart > this.ARRHYTHMIA_LEARNING_PERIOD) {
        this.isLearningPhase = false;
        
        // Calculate base values after learning phase
        if (this.rrIntervals.length > 5) {
          // Enhanced baseline calculation method using median
          const sortedRR = [...this.rrIntervals].sort((a, b) => a - b);
          
          // Take the middle 70% of values
          const startIdx = Math.floor(sortedRR.length * 0.15);
          const endIdx = Math.floor(sortedRR.length * 0.85);
          const middleValues = sortedRR.slice(startIdx, endIdx);
          
          // Calculate median from the middle values
          this.baseRRInterval = middleValues[Math.floor(middleValues.length / 2)];
          
          // Calculate average normal amplitude
          if (this.amplitudes.length > 5) {
            // Sort amplitudes in descending order (highest first)
            const sortedAmplitudes = [...this.amplitudes].sort((a, b) => b - a);
            
            // Use top 70% of amplitudes as reference for normal beats
            const normalCount = Math.ceil(sortedAmplitudes.length * 0.7);
            const normalAmplitudes = sortedAmplitudes.slice(0, normalCount);
            this.avgNormalAmplitude = normalAmplitudes.reduce((a, b) => a + b, 0) / normalAmplitudes.length;
            
            console.log('ArrhythmiaDetector - Baseline values calculated:', {
              baseRRInterval: this.baseRRInterval,
              avgNormalAmplitude: this.avgNormalAmplitude,
              totalSamples: this.rrIntervals.length
            });
          }
        }
      }
    }
  }

  /**
   * Update RR intervals and peak amplitudes with new data
   */
  updateIntervals(intervals: number[], lastPeakTime: number | null, peakAmplitude?: number): void {
    // Check if we have any data to process
    if (!intervals || intervals.length === 0) {
      console.warn('ArrhythmiaDetector: Empty intervals provided');
      return;
    }

    this.rrIntervals = intervals;
    this.lastPeakTime = lastPeakTime;
    
    // Store peak amplitude if provided
    if (typeof peakAmplitude === 'number' && !isNaN(peakAmplitude) && peakAmplitude > 0) {
      this.amplitudes.push(Math.abs(peakAmplitude));
      
      // Keep the same number of amplitudes as intervals
      if (this.amplitudes.length > this.rrIntervals.length) {
        this.amplitudes = this.amplitudes.slice(-this.rrIntervals.length);
      }
    } else if (this.DEBUG_MODE) {
      // Force amplitude values from RR intervals if not provided
      // Smaller RR intervals (higher heart rate) often correspond to premature beats
      const derivedAmplitude = 100 / (intervals[intervals.length - 1] || 800);
      this.amplitudes.push(derivedAmplitude);
      
      if (this.amplitudes.length > this.rrIntervals.length) {
        this.amplitudes = this.amplitudes.slice(-this.rrIntervals.length);
      }
    }
    
    // Update recent RR intervals for trend analysis
    if (intervals.length > 0) {
      const latestRR = intervals[intervals.length - 1];
      this.recentRRIntervals.push(latestRR);
      if (this.recentRRIntervals.length > 10) {
        this.recentRRIntervals.shift();
      }
    }
    
    this.updateLearningPhase();
  }

  /**
   * Detect arrhythmia based on premature beat patterns - ENHANCED DETECTION LOGIC
   * with focus on identifying only small beats between normal beats as arrhythmias
   */
  detect(): {
    detected: boolean;
    count: number;
    status: string;
    data: { rmssd: number; rrVariation: number; prematureBeat: boolean } | null;
  } {
    // Skip detection during learning phase or if not enough data
    if (this.rrIntervals.length < 4 || this.amplitudes.length < 4 || this.isLearningPhase) {
      return {
        detected: false,
        count: this.arrhythmiaCount,
        status: this.hasDetectedFirstArrhythmia ? 
          `ARRITMIA DETECTADA|${this.arrhythmiaCount}` : 
          `SIN ARRITMIAS|${this.arrhythmiaCount}`,
        data: null
      };
    }

    const currentTime = Date.now();
    
    // Calculate RMSSD for reference
    let sumSquaredDiff = 0;
    for (let i = 1; i < this.rrIntervals.length; i++) {
      const diff = this.rrIntervals[i] - this.rrIntervals[i-1];
      sumSquaredDiff += diff * diff;
    }
    const rmssd = Math.sqrt(sumSquaredDiff / (this.rrIntervals.length - 1));
    this.lastRMSSD = rmssd;
    
    // Get the last 5 RR intervals and amplitudes for pattern analysis
    const lastRRs = this.rrIntervals.slice(-5);
    const lastAmplitudes = this.amplitudes.slice(-5);
    
    // Establish baseline if not already done
    if (this.baseRRInterval <= 0 && lastRRs.length >= 4) {
      // Sort RRs to find median (more robust)
      const sortedRRs = [...lastRRs].sort((a, b) => a - b);
      this.baseRRInterval = sortedRRs[Math.floor(sortedRRs.length / 2)];
      
      if (lastAmplitudes.length >= 4) {
        // Sort amplitudes in descending order to find normal beats
        const sortedAmps = [...lastAmplitudes].sort((a, b) => b - a);
        // Use the average of the top 60% as normal amplitude
        const normalCount = Math.ceil(sortedAmps.length * 0.6);
        const normalAmps = sortedAmps.slice(0, normalCount);
        this.avgNormalAmplitude = normalAmps.reduce((a, b) => a + b, 0) / normalAmps.length;
      }
    }
    
    // IMPROVED: Identification of premature beats only between normal beats
    let prematureBeatDetected = false;
    
    if (lastRRs.length >= 4 && lastAmplitudes.length >= 4 && this.baseRRInterval > 0) {
      // Get beat data with index positions
      const beatsData = lastAmplitudes.map((amp, i) => ({
        amplitude: amp,
        rr: i < lastRRs.length ? lastRRs[i] : 0,
        index: i
      }));
      
      // Identify normal beats first
      const normalBeatsIndices: number[] = [];
      for (let i = 0; i < beatsData.length; i++) {
        const beat = beatsData[i];
        
        // A beat is normal if:
        // 1. Its amplitude is close to or above the average normal amplitude
        // 2. Its RR interval is close to the baseline RR interval
        if (beat.amplitude >= this.avgNormalAmplitude * 0.85 &&
            (beat.rr === 0 || (beat.rr >= this.baseRRInterval * 0.85 && beat.rr <= this.baseRRInterval * 1.15))) {
          normalBeatsIndices.push(i);
          
          // Store data about normal beats for future comparisons
          this.lastNormalBeatsAmplitudes.push(beat.amplitude);
          this.lastNormalBeatsRRs.push(beat.rr);
          
          // Keep limited history
          if (this.lastNormalBeatsAmplitudes.length > 5) {
            this.lastNormalBeatsAmplitudes.shift();
            this.lastNormalBeatsRRs.shift();
          }
        }
      }
      
      // Calculate current normal amplitude from recent normal beats
      let currentNormalAmplitude = this.avgNormalAmplitude;
      if (this.lastNormalBeatsAmplitudes.length >= 3) {
        currentNormalAmplitude = this.lastNormalBeatsAmplitudes.reduce((a, b) => a + b, 0) / 
                                this.lastNormalBeatsAmplitudes.length;
      }
      
      // Now look for premature beats (small beats between normal beats)
      const lastBeatIndex = beatsData.length - 1;
      const currentBeat = beatsData[lastBeatIndex];
      
      // If the most recent beat is not considered normal, check if it's premature
      if (!normalBeatsIndices.includes(lastBeatIndex)) {
        // Find previous and next normal beats
        const prevNormalIndex = normalBeatsIndices
          .filter(idx => idx < lastBeatIndex)
          .sort((a, b) => b - a)[0]; // Get closest previous normal beat
        
        // Check if we have a normal beat before this one
        if (prevNormalIndex !== undefined) {
          const prevNormalBeat = beatsData[prevNormalIndex];
          
          // Calculate amplitude ratio compared to normal beats
          const amplitudeRatio = currentBeat.amplitude / currentNormalAmplitude;
          
          // A beat is considered premature if:
          // 1. Its amplitude is significantly smaller than normal beats
          // 2. It comes after a normal beat
          if (amplitudeRatio < this.AMPLITUDE_RATIO_THRESHOLD) {
            prematureBeatDetected = true;
            
            console.log('ArrhythmiaDetector - PREMATURE BEAT DETECTED:', {
              prematureAmplitude: currentBeat.amplitude,
              normalAmplitude: currentNormalAmplitude,
              amplitudeRatio,
              prevNormalBeatIndex: prevNormalIndex,
              currentBeatIndex: lastBeatIndex
            });
          }
        }
      }
    }
    
    // Calculate RR variation
    const rrVariation = Math.abs(lastRRs[lastRRs.length - 1] - this.baseRRInterval) / this.baseRRInterval;
    this.lastRRVariation = rrVariation;
    
    // Only count arrhythmias if enough time has passed since the last one (500ms)
    if (prematureBeatDetected && currentTime - this.lastArrhythmiaTime > 500) {
      this.arrhythmiaCount++;
      this.lastArrhythmiaTime = currentTime;
      this.hasDetectedFirstArrhythmia = true;
      
      console.log('ArrhythmiaDetector - NEW ARRHYTHMIA COUNTED:', {
        count: this.arrhythmiaCount,
        rmssd,
        rrVariation,
        timestamp: currentTime,
        intervals: lastRRs,
        amplitudes: lastAmplitudes
      });
    }

    this.arrhythmiaDetected = prematureBeatDetected;

    return {
      detected: this.arrhythmiaDetected,
      count: this.arrhythmiaCount,
      status: this.hasDetectedFirstArrhythmia ? 
        `ARRITMIA DETECTADA|${this.arrhythmiaCount}` : 
        `SIN ARRITMIAS|${this.arrhythmiaCount}`,
      data: { rmssd, rrVariation, prematureBeat: prematureBeatDetected }
    };
  }

  /**
   * Get current arrhythmia status
   */
  getStatus(): string {
    return this.hasDetectedFirstArrhythmia ? 
      `ARRITMIA DETECTADA|${this.arrhythmiaCount}` : 
      `SIN ARRITMIAS|${this.arrhythmiaCount}`;
  }

  /**
   * Get current arrhythmia count
   */
  getCount(): number {
    return this.arrhythmiaCount;
  }
}
