
declare global {
  interface Window {
    screen?: {
      orientation?: {
        lock(orientation: 'portrait' | 'landscape'): Promise<void>;
        unlock(): void;
        type: string;
        angle: number;
      };
    };
  }
}

export {};
