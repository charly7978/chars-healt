
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

declare global {
  interface Screen {
    orientation: ScreenOrientation;
  }
}

export {};
