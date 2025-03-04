import { ProcessedSignal, ProcessingError } from '../types/signal';

export class AdvancedSignalProcessor {
  private currentROI: { x: number; y: number; width: number; height: number } | null = null;

  constructor() {
    console.log("AdvancedSignalProcessor initialized");
  }

  public processFrame(imageData: ImageData): ProcessedSignal | ProcessingError {
    try {
      const { width, height, data } = imageData;

      // 1. Detect Finger (Simplified - just check if enough red)
      const isFingerDetected = this.detectFinger(data);

      // 2. Region of Interest (Simplified - center 50x50 area)
      if (!this.currentROI) {
        this.currentROI = this.getROI(width, height);
      }

      // 3. Extract Signal (Simplified - average red value in ROI)
      const { red, green, blue } = this.extractSignalFromROI(imageData, this.currentROI);

      // 4. Filter Signal (Simple moving average)
      const filteredValue = this.applySimpleMovingAverage(red);

      // 5. Quality Assessment (Simple - based on red intensity)
      const signalQuality = Math.min(100, Math.max(0, red / 2.55));

      // 6. Peak Detection (Placeholder - always false for now)
      const isPeak = false;

      const processedSignal: ProcessedSignal = {
        timestamp: Date.now(),
        rawValue: red,
        filteredValue: filteredValue,
        quality: signalQuality,
        fingerDetected: isFingerDetected,
        roi: this.currentROI,
        isPeak: isPeak,
        // Make sure we use a valid Uint8ClampedArray without custom properties
        rawPixelData: new Uint8ClampedArray(imageData.data)
      };

      return processedSignal;

    } catch (error: any) {
      console.error("Error processing frame:", error);
      return {
        code: "FRAME_PROCESSING_ERROR",
        message: error.message || "Failed to process frame",
        timestamp: Date.now()
      };
    }
  }

  private detectFinger(data: Uint8ClampedArray): boolean {
    let redPixels = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] > 100) { // Simple threshold
        redPixels++;
      }
    }
    return redPixels > data.length / 100; // At least 1% red pixels
  }

  private getROI(width: number, height: number): { x: number; y: number; width: number; height: number } {
    const roiWidth = 50;
    const roiHeight = 50;
    const x = Math.floor((width - roiWidth) / 2);
    const y = Math.floor((height - roiHeight) / 2);
    return { x, y, width: roiWidth, height: roiHeight };
  }

  private extractSignalFromROI(imageData: ImageData, roi: { x: number; y: number; width: number; height: number }): { red: number; green: number; blue: number } {
    let totalRed = 0;
    let totalGreen = 0;
    let totalBlue = 0;
    let pixelCount = 0;

    for (let y = roi.y; y < roi.y + roi.height; y++) {
      for (let x = roi.x; x < roi.x + roi.width; x++) {
        const index = (y * imageData.width + x) * 4;
        totalRed += imageData.data[index];
        totalGreen += imageData.data[index + 1];
        totalBlue += imageData.data[index + 2];
        pixelCount++;
      }
    }

    const avgRed = Math.floor(totalRed / pixelCount);
    const avgGreen = Math.floor(totalGreen / pixelCount);
    const avgBlue = Math.floor(totalBlue / pixelCount);

    return { red: avgRed, green: avgGreen, blue: avgBlue };
  }

  private signalBuffer: number[] = [];
  private applySimpleMovingAverage(value: number, windowSize: number = 10): number {
    this.signalBuffer.push(value);
    if (this.signalBuffer.length > windowSize) {
      this.signalBuffer.shift();
    }

    let sum = 0;
    for (let i = 0; i < this.signalBuffer.length; i++) {
      sum += this.signalBuffer[i];
    }

    return Math.floor(sum / this.signalBuffer.length);
  }
}
