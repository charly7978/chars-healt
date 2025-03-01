interface PPGDataPoint {
  time: number;
  value: number;
  isArrhythmia: boolean;
}

export class CircularBuffer {
  private buffer: PPGDataPoint[];
  private maxSize: number;

  constructor(size: number) {
    this.buffer = [];
    this.maxSize = size;
  }

  push(point: PPGDataPoint): void {
    this.buffer.push(point);
    if (this.buffer.length > this.maxSize) {
      this.buffer.shift();
    }
  }

  getPoints(): PPGDataPoint[] {
    return [...this.buffer];
  }

  // Función auxiliar para marcar un punto como arritmia
  markArrhythmia(index: number, isArrhythmia: boolean = true): void {
    // Asegurarse de que el índice es válido
    if (index >= 0 && index < this.buffer.length) {
      this.buffer[index].isArrhythmia = isArrhythmia;
    }
  }

  // Marcar el último punto añadido como arritmia
  markLastAsArrhythmia(isArrhythmia: boolean = true): void {
    if (this.buffer.length > 0) {
      this.buffer[this.buffer.length - 1].isArrhythmia = isArrhythmia;
    }
  }

  clear(): void {
    this.buffer = [];
  }
}

export type { PPGDataPoint };
