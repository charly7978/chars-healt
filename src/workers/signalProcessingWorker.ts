
// Signal Processing Web Worker
// Handles intensive calculations outside the main thread

// Cache for repetitive calculations
const calculationCache: Record<string, number> = {};

// Function to process signal with caching
function processSignalWithCache(signal: number, timestamp: number): { 
  processedValue: number, 
  peaks: number[], 
  valleys: number[] 
} {
  // Generate cache key based on signal value (rounded to 1 decimal place for better cache hits)
  const cacheKey = `${Math.round(signal * 10) / 10}`;
  
  // Check if we have a cached result
  if (calculationCache[cacheKey] !== undefined) {
    return {
      processedValue: calculationCache[cacheKey],
      peaks: [],
      valleys: []
    };
  }
  
  // Simulate intensive calculation (actual algorithm would go here)
  const processedValue = Math.sin(signal * 0.1) * 50 + signal;
  
  // Store in cache
  calculationCache[cacheKey] = processedValue;
  
  // Limit cache size to prevent memory issues
  const cacheKeys = Object.keys(calculationCache);
  if (cacheKeys.length > 1000) {
    // Remove oldest entries when cache gets too large
    const oldestKeys = cacheKeys.slice(0, 100);
    oldestKeys.forEach(key => {
      delete calculationCache[key];
    });
  }
  
  return {
    processedValue,
    peaks: [],
    valleys: []
  };
}

// Message handler
self.onmessage = (e: MessageEvent) => {
  if (e.data.type === 'process') {
    const result = processSignalWithCache(e.data.signal, e.data.timestamp);
    self.postMessage({
      type: 'result',
      processedValue: result.processedValue,
      originalSignal: e.data.signal,
      timestamp: e.data.timestamp,
      peaks: result.peaks,
      valleys: result.valleys
    });
  } else if (e.data.type === 'clear-cache') {
    // Clear cache on request
    Object.keys(calculationCache).forEach(key => {
      delete calculationCache[key];
    });
    self.postMessage({ type: 'cache-cleared' });
  }
};

// Export empty object to satisfy TypeScript module requirements
export {};
