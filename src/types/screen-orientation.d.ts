
interface ScreenOrientation {
  lock(orientation: OrientationType): Promise<void>;
  unlock(): void;
  type: string;
  angle: number;
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

interface FullScreen {
  requestFullscreen(): Promise<void>;
  webkitRequestFullscreen(): Promise<void>;
  mozRequestFullScreen(): Promise<void>;
  msRequestFullscreen(): Promise<void>;
}

declare global {
  interface Screen {
    orientation: ScreenOrientation;
  }
  
  interface HTMLElement extends FullScreen {}
  interface Document {
    documentElement: HTMLElement;
    exitFullscreen: () => Promise<void>;
    webkitExitFullscreen: () => Promise<void>;
    mozCancelFullScreen: () => Promise<void>;
    msExitFullscreen: () => Promise<void>;
  }
}

export {};
