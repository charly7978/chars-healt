
interface ScreenOrientationLockType {
  lock(orientation: OrientationLockType): Promise<void>;
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
    orientation: ScreenOrientationLockType;
  }
}

export {};
