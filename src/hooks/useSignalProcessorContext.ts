
import React, { createContext, useContext, ReactNode } from 'react';
import { ProcessedSignal } from '../types/signal';

interface SignalProcessorContextType {
  processor: any | null;
  lastSignal: ProcessedSignal | null;
  isProcessing: boolean;
  startProcessing: () => void;
  stopProcessing: () => void;
  processFrame: (imageData: ImageData) => void;
}

const SignalProcessorContext = createContext<SignalProcessorContextType | null>(null);

interface SignalProcessorProviderProps {
  children: ReactNode;
}

export const SignalProcessorProvider: React.FC<SignalProcessorProviderProps> = ({ children }) => {
  // Create a simple initial context that will be properly initialized in useSignalProcessor
  const contextValue: SignalProcessorContextType = {
    processor: null,
    lastSignal: null,
    isProcessing: false,
    startProcessing: () => console.log('Signal processor not initialized'),
    stopProcessing: () => console.log('Signal processor not initialized'),
    processFrame: () => console.log('Signal processor not initialized')
  };

  return (
    <SignalProcessorContext.Provider value={contextValue}>
      {children}
    </SignalProcessorContext.Provider>
  );
};

export const useSignalProcessorContext = (): SignalProcessorContextType => {
  const context = useContext(SignalProcessorContext);
  if (!context) {
    throw new Error('useSignalProcessorContext must be used within a SignalProcessorProvider');
  }
  return context;
};
