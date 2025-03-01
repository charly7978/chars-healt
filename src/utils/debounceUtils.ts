
// Utilidad para antirrebote (debounce) de eventos

/**
 * Crea una versión con antirrebote de una función
 * @param func La función a la que aplicar antirrebote
 * @param wait Tiempo de espera en ms
 * @param immediate Si debe ejecutarse inmediatamente
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number = 300,
  immediate: boolean = false
): (...args: Parameters<T>) => void {
  let timeout: number | null = null;
  
  return function(this: any, ...args: Parameters<T>): void {
    const context = this;
    
    const later = function() {
      timeout = null;
      if (!immediate) func.apply(context, args);
    };
    
    const callNow = immediate && !timeout;
    
    if (timeout !== null) {
      clearTimeout(timeout);
    }
    
    timeout = window.setTimeout(later, wait);
    
    if (callNow) {
      func.apply(context, args);
    }
  };
}

/**
 * Versión de debounce específica para procesamiento de frames de cámara
 * Utiliza requestAnimationFrame para un mejor rendimiento
 */
export function frameDebounce<T extends (...args: any[]) => any>(
  func: T,
  skipFrames: number = 1
): (...args: Parameters<T>) => void {
  let queued = false;
  let frameCount = 0;
  let lastArgs: Parameters<T> | null = null;
  
  return function(this: any, ...args: Parameters<T>): void {
    lastArgs = args;
    
    if (queued) return;
    
    queued = true;
    
    requestAnimationFrame(() => {
      frameCount++;
      
      if (frameCount >= skipFrames && lastArgs) {
        func.apply(this, lastArgs);
        frameCount = 0;
      }
      
      queued = false;
    });
  };
}
