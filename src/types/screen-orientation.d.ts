
interface ScreenOrientation {
  lock(orientation: 'any' | 'natural' | 'landscape' | 'portrait' | 'portrait-primary' | 'portrait-secondary' | 'landscape-primary' | 'landscape-secondary'): Promise<void>;
  unlock(): void;
  type: string;
  angle: number;
}

declare global {
  interface Screen {
    orientation: ScreenOrientation;
  }
}

export {};
