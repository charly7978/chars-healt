
export interface PPGDataPoint {
  time: number;
  value: number;
  isArrhythmia: boolean;
}

export class CircularBuffer {
  private buffer: PPGDataPoint[];
  private maxSize: number;
  private typedBuffer: Float32Array;
  private timeBuffer: Float64Array;
  private currentIndex: number = 0;

  constructor(size: number) {
    this.buffer = [];
    this.maxSize = size;
    this.typedBuffer = new Float32Array(size);
    this.timeBuffer = new Float64Array(size);
  }

  push(point: PPGDataPoint): void {
    // Actualizar TypedArrays para acceso rápido
    this.typedBuffer[this.currentIndex] = point.value;
    this.timeBuffer[this.currentIndex] = point.time;
    this.currentIndex = (this.currentIndex + 1) % this.maxSize;

    this.buffer.push(point);
    if (this.buffer.length > this.maxSize) {
      this.buffer.shift();
    }
  }

  getPoints(): PPGDataPoint[] {
    return this.buffer;
  }

  clear(): void {
    this.buffer = [];
    this.currentIndex = 0;
    this.typedBuffer.fill(0);
    this.timeBuffer.fill(0);
  }

  // Nuevo método para limpiar datos antiguos
  cleanup(olderThan: number): void {
    this.buffer = this.buffer.filter(point => point.time > olderThan);
    
    // Reindexar TypedArrays
    this.typedBuffer.fill(0);
    this.timeBuffer.fill(0);
    this.currentIndex = 0;
    
    this.buffer.forEach((point, index) => {
      this.typedBuffer[index] = point.value;
      this.timeBuffer[index] = point.time;
      this.currentIndex = (index + 1) % this.maxSize;
    });
  }

  // Método para acceso rápido a datos
  getTypedData(): { values: Float32Array; times: Float64Array } {
    return {
      values: this.typedBuffer,
      times: this.timeBuffer
    };
  }
}
