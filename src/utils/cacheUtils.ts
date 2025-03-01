
// Utilidad para caché de resultados
type CacheKey = string;
type CacheValue = any;
type CacheExpiry = number;

// Cache para almacenar resultados de cálculos intensivos
class ResultCache {
  private cache: Map<CacheKey, { value: CacheValue, expiry: CacheExpiry }> = new Map();
  
  // Guardar un valor en caché con tiempo de expiración opcional
  set(key: CacheKey, value: CacheValue, ttlMs: number = 30000): void {
    const expiry = Date.now() + ttlMs;
    this.cache.set(key, { value, expiry });
    
    // Limpieza automática después del TTL
    setTimeout(() => {
      this.delete(key);
    }, ttlMs);
  }
  
  // Obtener un valor de la caché
  get(key: CacheKey): CacheValue | null {
    const cached = this.cache.get(key);
    
    if (!cached) return null;
    
    // Verificar si el valor ha expirado
    if (cached.expiry < Date.now()) {
      this.delete(key);
      return null;
    }
    
    return cached.value;
  }
  
  // Eliminar un valor de la caché
  delete(key: CacheKey): void {
    this.cache.delete(key);
  }
  
  // Limpiar toda la caché
  clear(): void {
    this.cache.clear();
  }
}

// Crear una instancia global de la caché
export const resultCache = new ResultCache();

// Función para crear versiones cacheadas de funciones costosas
export function cached<T extends (...args: any[]) => any>(
  fn: T, 
  keyFn: (...args: Parameters<T>) => string = (...args) => JSON.stringify(args),
  ttlMs: number = 30000
): (...args: Parameters<T>) => ReturnType<T> {
  return (...args: Parameters<T>): ReturnType<T> => {
    const key = keyFn(...args);
    const cached = resultCache.get(key);
    
    if (cached !== null) {
      return cached as ReturnType<T>;
    }
    
    const result = fn(...args);
    resultCache.set(key, result, ttlMs);
    return result;
  };
}
