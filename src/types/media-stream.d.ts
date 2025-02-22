
interface MediaTrackCapabilities {
  torch?: boolean;
  exposureMode?: string;
  exposureTime?: number;
  brightness?: number;
  contrast?: number;
}

interface MediaTrackConstraintSet {
  torch?: boolean;
  exposureMode?: 'manual' | 'auto';
  exposureTime?: number;
  brightness?: number;
  contrast?: number;
}

declare class ImageCapture {
  constructor(track: MediaStreamTrack);
  grabFrame(): Promise<ImageBitmap>;
  takePhoto(): Promise<Blob>;
}
