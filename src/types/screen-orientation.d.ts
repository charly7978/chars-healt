
interface ScreenOrientation {
  angle: number;
  onchange: ((this: ScreenOrientation, ev: Event) => any) | null;
  type: OrientationType;
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

interface Screen {
  orientation?: {
    angle: number;
    type: string;
    lock?(orientation: OrientationType): Promise<void>;
    unlock?(): void;
  };
}

interface DocumentWithFullscreen extends Document {
  documentElement: HTMLElement & {
    requestFullscreen?: () => Promise<void>;
    webkitRequestFullscreen?: () => Promise<void>;
    mozRequestFullScreen?: () => Promise<void>;
    msRequestFullscreen?: () => Promise<void>;
  };
}

declare global {
  interface Window {
    document: DocumentWithFullscreen;
  }
}

export {};
