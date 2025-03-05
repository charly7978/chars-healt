
import React, { createContext, useContext, ReactNode, useState } from 'react';
import { ProcessedSignal } from '../types/signal';

// Define the context type
interface SignalProcessorContextType {
  lastProcessedSignal: ProcessedSignal | null;
  updateSignal: (signal: ProcessedSignal) => void;
  resetSignal: () => void;
}

// Create context with default values
const SignalProcessorContext = createContext<SignalProcessorContextType>({
  lastProcessedSignal: null,
  updateSignal: () => {},
  resetSignal: () => {},
});

// Provider component
export const SignalProcessorProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [lastProcessedSignal, setLastProcessedSignal] = useState<ProcessedSignal | null>(null);

  const updateSignal = (signal: ProcessedSignal) => {
    setLastProcessedSignal(signal);
  };

  const resetSignal = () => {
    setLastProcessedSignal(null);
  };

  return (
    <SignalProcessorContext.Provider
      value={{
        lastProcessedSignal,
        updateSignal,
        resetSignal,
      }}
    >
      {children}
    </SignalProcessorContext.Provider>
  );
};

// Custom hook to use the context
export const useSignalProcessorContext = () => {
  const context = useContext(SignalProcessorContext);
  if (!context) {
    throw new Error('useSignalProcessorContext must be used within a SignalProcessorProvider');
  }
  return context;
};
