
/**
 * Type definitions for our Web Worker implementation
 */

interface ProcessRequestMessage {
  type: 'process';
  signal: number;
  timestamp: number;
}

interface ClearCacheMessage {
  type: 'clear-cache';
}

interface ProcessResultMessage {
  type: 'result';
  processedValue: number;
  originalSignal: number;
  timestamp: number;
  peaks: number[];
  valleys: number[];
}

interface CacheClearedMessage {
  type: 'cache-cleared';
}

type WorkerMessage = ProcessRequestMessage | ClearCacheMessage;
type WorkerResponse = ProcessResultMessage | CacheClearedMessage;

// Extend Window interface to include possible gc() function
interface Window {
  gc?: () => void;
}
