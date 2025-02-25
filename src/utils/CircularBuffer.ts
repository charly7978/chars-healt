/**
 * CircularBuffer - Implementación de un buffer circular para series temporales
 * Utilizado para almacenar y procesar valores de señales PPG y métricas derivadas
 */
export class CircularBuffer<T = number> {
  private buffer: T[];
  private _size: number;
  private _capacity: number;
  private _head: number;
  private _tail: number;
  private _isFull: boolean;

  /**
   * Constructor para un buffer circular
   * @param capacity - Capacidad máxima del buffer
   */
  constructor(capacity: number) {
    if (capacity <= 0) {
      throw new Error('La capacidad debe ser mayor que cero');
    }
    
    this._capacity = Math.floor(capacity);
    this.buffer = new Array<T>(this._capacity);
    this._size = 0;
    this._head = 0;
    this._tail = 0;
    this._isFull = false;
  }

  /**
   * Añade un valor al buffer
   * Si el buffer está lleno, sobrescribe el valor más antiguo
   * @param value - Valor a añadir
   * @returns El valor sobrescrito, si existe
   */
  public add(value: T): T | undefined {
    let overwritten: T | undefined = undefined;
    
    if (this._isFull) {
      overwritten = this.buffer[this._tail];
    }
    
    this.buffer[this._tail] = value;
    this._tail = (this._tail + 1) % this._capacity;
    
    if (this._isFull) {
      this._head = (this._head + 1) % this._capacity;
    } else {
      this._size++;
      if (this._size === this._capacity) {
        this._isFull = true;
      }
    }
    
    return overwritten;
  }

  /**
   * Obtiene un valor del buffer en una posición específica
   * @param index - Índice del valor a obtener (0 = más reciente)
   * @returns El valor en la posición especificada o undefined si el índice es inválido
   */
  public get(index: number): T | undefined {
    if (index < 0 || index >= this._size) {
      return undefined;
    }
    
    const bufferIndex = (this._tail - 1 - index + this._capacity) % this._capacity;
    return this.buffer[bufferIndex];
  }

  /**
   * Obtiene el valor más reciente en el buffer
   * @returns El valor más reciente o undefined si el buffer está vacío
   */
  public getMostRecent(): T | undefined {
    if (this.isEmpty()) {
      return undefined;
    }
    
    const index = (this._tail - 1 + this._capacity) % this._capacity;
    return this.buffer[index];
  }

  /**
   * Obtiene el valor más antiguo en el buffer
   * @returns El valor más antiguo o undefined si el buffer está vacío
   */
  public getOldest(): T | undefined {
    if (this.isEmpty()) {
      return undefined;
    }
    
    return this.buffer[this._head];
  }

  /**
   * Verifica si el buffer está vacío
   * @returns true si el buffer está vacío, false en caso contrario
   */
  public isEmpty(): boolean {
    return this._size === 0;
  }

  /**
   * Verifica si el buffer está lleno
   * @returns true si el buffer está lleno, false en caso contrario
   */
  public isFull(): boolean {
    return this._isFull;
  }

  /**
   * Obtiene todos los valores del buffer como un array
   * @param mostRecentFirst - true para ordenar con el más reciente primero, false para el más antiguo primero
   * @returns Array con todos los valores en el buffer
   */
  public getValues(mostRecentFirst: boolean = false): T[] {
    if (this.isEmpty()) {
      return [];
    }
    
    const result: T[] = [];
    
    if (mostRecentFirst) {
      let index = (this._tail - 1 + this._capacity) % this._capacity;
      
      for (let i = 0; i < this._size; i++) {
        result.push(this.buffer[index]);
        index = (index - 1 + this._capacity) % this._capacity;
      }
    } else {
      let index = this._head;
      
      for (let i = 0; i < this._size; i++) {
        result.push(this.buffer[index]);
        index = (index + 1) % this._capacity;
      }
    }
    
    return result;
  }

  /**
   * Calcula el promedio de los valores en el buffer
   * @returns Promedio de los valores o undefined si el buffer está vacío
   */
  public average(): number | undefined {
    if (this.isEmpty() || typeof this.buffer[0] !== 'number') {
      return undefined;
    }
    
    let sum = 0;
    let count = 0;
    
    for (let i = 0; i < this._size; i++) {
      const index = (this._head + i) % this._capacity;
      const value = this.buffer[index] as unknown as number;
      
      if (!isNaN(value)) {
        sum += value;
        count++;
      }
    }
    
    return count > 0 ? sum / count : undefined;
  }

  /**
   * Calcula el valor máximo en el buffer
   * @returns Valor máximo o undefined si el buffer está vacío
   */
  public max(): number | undefined {
    if (this.isEmpty() || typeof this.buffer[0] !== 'number') {
      return undefined;
    }
    
    let max = Number.NEGATIVE_INFINITY;
    
    for (let i = 0; i < this._size; i++) {
      const index = (this._head + i) % this._capacity;
      const value = this.buffer[index] as unknown as number;
      
      if (!isNaN(value) && value > max) {
        max = value;
      }
    }
    
    return max !== Number.NEGATIVE_INFINITY ? max : undefined;
  }

  /**
   * Calcula el valor mínimo en el buffer
   * @returns Valor mínimo o undefined si el buffer está vacío
   */
  public min(): number | undefined {
    if (this.isEmpty() || typeof this.buffer[0] !== 'number') {
      return undefined;
    }
    
    let min = Number.POSITIVE_INFINITY;
    
    for (let i = 0; i < this._size; i++) {
      const index = (this._head + i) % this._capacity;
      const value = this.buffer[index] as unknown as number;
      
      if (!isNaN(value) && value < min) {
        min = value;
      }
    }
    
    return min !== Number.POSITIVE_INFINITY ? min : undefined;
  }

  /**
   * Calcula la mediana de los valores en el buffer
   * @returns Mediana o undefined si el buffer está vacío
   */
  public median(): number | undefined {
    if (this.isEmpty() || typeof this.buffer[0] !== 'number') {
      return undefined;
    }
    
    const values = this.getValues()
      .filter(v => !isNaN(v as unknown as number))
      .map(v => v as unknown as number)
      .sort((a, b) => a - b);
    
    if (values.length === 0) {
      return undefined;
    }
    
    const mid = Math.floor(values.length / 2);
    
    if (values.length % 2 === 0) {
      return (values[mid - 1] + values[mid]) / 2;
    } else {
      return values[mid];
    }
  }

  /**
   * Limpia el buffer, eliminando todos los valores
   */
  public clear(): void {
    this._size = 0;
    this._head = 0;
    this._tail = 0;
    this._isFull = false;
  }

  /**
   * Obtiene el tamaño actual del buffer
   * @returns Número de elementos en el buffer
   */
  public get size(): number {
    return this._size;
  }

  /**
   * Obtiene la capacidad máxima del buffer
   * @returns Capacidad máxima del buffer
   */
  public get capacity(): number {
    return this._capacity;
  }
}
