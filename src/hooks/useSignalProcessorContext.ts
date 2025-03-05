
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

export const SignalProcessorProvider: React.FC<{
  children: ReactNode;
  value: SignalProcessorContextType;
}> = ({ children, value }) => {
  return (
    <SignalProcessorContext.Provider value={value}>
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
