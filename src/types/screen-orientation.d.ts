
interface ScreenOrientationType {
  lock?(orientation: OrientationLockType): Promise<void>;
  unlock?(): void;
  type?: string;
  angle?: number;
}

type OrientationLockType = 
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
    orientation?: ScreenOrientationType;
  }
}

export {};
