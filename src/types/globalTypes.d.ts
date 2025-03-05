
import { HeartBeatProcessor } from '../modules/HeartBeatProcessor';

declare global {
  interface Window {
    heartBeatProcessor?: HeartBeatProcessor;
    gc?: () => void;
  }
}

export {};
