
// If the file already exists, we need to add the HeartBeatResult interface if it doesn't exist.
// Since we can't see the content of the read-only file, we're creating a new definition that will be merged with the existing one.

export interface HeartBeatResult {
  bpm: number;
  confidence: number;
  isPeak: boolean;
  rrData?: {
    intervals: number[];
    lastPeakTime: number | null;
  };
}

export interface ProcessedSignal {
  timestamp: number;
  rawValue: number;
  filteredValue: number;
  quality: number;
  fingerDetected: boolean;
  roi?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  isPeak?: boolean;
}

export interface ProcessingError {
  code: string;
  message: string;
  timestamp: number;
}

export interface SignalProcessor {
  onSignalReady?: (signal: ProcessedSignal) => void;
  onError?: (error: ProcessingError) => void;
  initialize(): Promise<void>;
  start(): void;
  stop(): void;
  calibrate(): Promise<boolean>;
  processFrame(imageData: ImageData): void;
}
