
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useSignalProcessor } from './useSignalProcessor';
import { ProcessedSignal } from '../types/signal';

// Interface for the context state
interface SignalProcessorContextType {
  isProcessing: boolean;
  lastSignal: ProcessedSignal | null;
  error: any;
  startProcessing: () => void;
  stopProcessing: () => void;
  processFrame: (imageData: ImageData) => void;
  cleanMemory: () => void;
}

// Create the context with a default value
const SignalProcessorContext = createContext<SignalProcessorContextType | null>(null);

// Context provider component
export const SignalProcessorProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const {
    isProcessing, 
    lastSignal, 
    error,
    startProcessing, 
    stopProcessing, 
    processFrame,
    cleanMemory
  } = useSignalProcessor();

  // Provide the context values to all children
  return (
    <SignalProcessorContext.Provider
      value={{
        isProcessing,
        lastSignal,
        error,
        startProcessing,
        stopProcessing,
        processFrame,
        cleanMemory
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
