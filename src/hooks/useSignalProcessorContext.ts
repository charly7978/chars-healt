
import { createContext, useContext, ReactNode, useState, useEffect } from 'react';
import { useSignalProcessor } from './useSignalProcessor';
import { ProcessedSignal, ProcessingError } from '../types/signal';

type SignalProcessorContextType = {
  isProcessing: boolean;
  lastSignal: ProcessedSignal | null;
  error: ProcessingError | null;
  startProcessing: () => void;
  stopProcessing: () => void;
  calibrate: () => Promise<boolean>;
  processFrame: (imageData: ImageData) => void;
  cleanMemory: () => void;
};

const SignalProcessorContext = createContext<SignalProcessorContextType | null>(null);

export const SignalProcessorProvider = ({ children }: { children: ReactNode }) => {
  const signalProcessor = useSignalProcessor();
  
  return (
    <SignalProcessorContext.Provider value={signalProcessor}>
      {children}
    </SignalProcessorContext.Provider>
  );
};

export const useSignalProcessorContext = () => {
  const context = useContext(SignalProcessorContext);
  if (context === null) {
    throw new Error('useSignalProcessorContext must be used within a SignalProcessorProvider');
  }
  return context;
};
