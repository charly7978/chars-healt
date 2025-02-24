
interface HTMLElement {
  webkitRequestFullscreen?: () => Promise<void>;
  mozRequestFullScreen?: () => Promise<void>;
  msRequestFullscreen?: () => Promise<void>;
}

interface ScreenOrientation {
  lock?: (orientation: 'portrait' | 'landscape') => Promise<void>;
}
