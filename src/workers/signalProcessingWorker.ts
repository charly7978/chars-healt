// Web worker for offloading intensive signal processing

// Signal processing worker designed to handle calculation-intensive tasks

// Constants for signal processing
const CACHE_SIZE = 20;

// Cache structure to avoid recalculating same values
type CacheItem = {
  input: any;
  result: any;
  timestamp: number;
};

// Keep a simple LRU cache
const calculationCache: CacheItem[] = [];

// Process raw signal data
function processSignalData(data: number[], params: any) {
  // Example processing function that could be computationally intensive
  // In a real implementation, this would contain complex algorithms
  const result = {
    min: Math.min(...data),
    max: Math.max(...data),
    mean: data.reduce((sum, val) => sum + val, 0) / data.length,
    processed: data.map(val => Math.sqrt(Math.abs(val))),
    timestamp: Date.now()
  };
  
  return result;
}

// Find cached result for input if available
function findCachedResult(input: any): any | null {
  const stringifiedInput = JSON.stringify(input);
  
  for (const item of calculationCache) {
    if (JSON.stringify(item.input) === stringifiedInput) {
      return item.result;
    }
  }
  
  return null;
}

// Add result to cache
function cacheResult(input: any, result: any): void {
  // Remove oldest cache item if cache is full
  if (calculationCache.length >= CACHE_SIZE) {
    calculationCache.shift();
  }
  
  calculationCache.push({
    input,
    result,
    timestamp: Date.now()
  });
}

// Clear cache
function clearCache(): void {
  calculationCache.length = 0;
}

// Main message handler
self.onmessage = (event) => {
  const { type, data, params, timestamp } = event.data;
  
  switch (type) {
    case 'process-signal':
      // Check if we have a cached result
      const cachedResult = findCachedResult({ data, params });
      
      if (cachedResult) {
        // Return cached result if available
        self.postMessage({ 
          type: 'result', 
          result: cachedResult,
          fromCache: true,
          timestamp 
        });
      } else {
        // Process data and cache result
        const result = processSignalData(data, params);
        cacheResult({ data, params }, result);
        
        self.postMessage({ 
          type: 'result', 
          result,
          fromCache: false,
          timestamp 
        });
      }
      break;
      
    case 'clear-cache':
      // Clear the calculation cache
      clearCache();
      self.postMessage({ type: 'cache-cleared' });
      break;
      
    default:
      console.error('Unknown message type:', type);
  }
};
