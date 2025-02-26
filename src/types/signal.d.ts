import { HeartBeatProcessor } from '../modules/HeartBeatProcessor';

export interface ProcessedSignal {
  timestamp: number;
  rawValue: number;
  filteredValue: number;
  quality: number;
  fingerDetected: boolean;
  redValue?: number;
  roi?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface ProcessingError {
  code: string;
  message: string;
  timestamp: number;
}

export interface SignalProcessor {
  initialize: () => Promise<boolean>;
  start: () => void;
  stop: () => void;
  calibrate: () => void;
  onSignalReady?: (signal: ProcessedSignal) => void;
  onError?: (error: Error) => void;
  processFrame(imageData: ImageData): void;
}

declare global {
  interface Window {
    heartBeatProcessor: HeartBeatProcessor;
  }
}
