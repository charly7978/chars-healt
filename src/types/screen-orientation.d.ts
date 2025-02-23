
interface ScreenOrientation {
  angle: number;
  onchange: ((this: ScreenOrientation, ev: Event) => any) | null;
  type: OrientationType;
  lock(orientation: OrientationType): Promise<void>;
  unlock(): void;
}

type OrientationType = 
  | 'any'
  | 'natural'
  | 'landscape'
  | 'portrait'
  | 'portrait-primary'
  | 'portrait-secondary'
  | 'landscape-primary'
  | 'landscape-secondary';

interface FullscreenAPI {
  requestFullscreen(): Promise<void>;
}

interface WebKitFullscreenAPI {
  webkitRequestFullscreen(): Promise<void>;
}

interface MozFullScreenAPI {
  mozRequestFullScreen(): Promise<void>;
}

interface MSFullscreenAPI {
  msRequestFullscreen(): Promise<void>;
}

type FullscreenElement = FullscreenAPI & WebKitFullscreenAPI & MozFullScreenAPI & MSFullscreenAPI;

declare global {
  interface Screen {
    orientation: ScreenOrientation;
  }
  
  interface HTMLElement extends Partial<FullscreenElement> {}
  
  interface Document {
    documentElement: HTMLElement;
  }
}

export {};
