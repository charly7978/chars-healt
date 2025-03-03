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
