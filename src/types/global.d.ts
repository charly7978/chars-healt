// Define interfaces para AudioContext y tipos relacionados si faltaran
interface Window {
  webkitAudioContext: typeof AudioContext;
}

interface AudioContext {
  resume(): Promise<void>;
}

// Define tipos para ImageData si fueran necesarios
interface ImageData {
  data: Uint8ClampedArray;
  width: number;
  height: number;
} 