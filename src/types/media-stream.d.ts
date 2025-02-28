
interface MediaTrackCapabilities {
  torch?: boolean;
  exposureMode?: string[];
  focusMode?: string[];
  whiteBalanceMode?: string[];
  exposureCompensation?: {
    max: number;
    min: number;
    step: number;
  };
  zoom?: {
    max: number;
    min: number;
    step: number;
  };
}

interface MediaTrackConstraintSet {
  torch?: boolean;
  exposureMode?: string;
  focusMode?: string;
  whiteBalanceMode?: string;
  exposureCompensation?: number;
  zoom?: number;
}

declare class ImageCapture {
  constructor(track: MediaStreamTrack);
  grabFrame(): Promise<ImageBitmap>;
  takePhoto(): Promise<Blob>;
}
