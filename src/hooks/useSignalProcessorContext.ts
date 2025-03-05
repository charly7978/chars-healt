
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { PPGSignalProcessor } from '../modules/SignalProcessor';
import { ProcessedSignal } from '../types/signal';

// Define context type
interface SignalProcessorContextType {
  processor: PPGSignalProcessor | null;
  lastSignal: ProcessedSignal | null;
  isProcessing: boolean;
  startProcessing: () => void;
  stopProcessing: () => void;
}

// Create context with default values
const SignalProcessorContext = createContext<SignalProcessorContextType>({
  processor: null,
  lastSignal: null,
  isProcessing: false,
  startProcessing: () => {},
  stopProcessing: () => {},
});

// Provider props type
interface SignalProcessorProviderProps {
  children: ReactNode;
}

// Provider component
export const SignalProcessorProvider: React.FC<SignalProcessorProviderProps> = ({ children }) => {
  const [processor, setProcessor] = useState<PPGSignalProcessor | null>(null);
  const [lastSignal, setLastSignal] = useState<ProcessedSignal | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // Initialize signal processor on mount
  useEffect(() => {
    const newProcessor = new PPGSignalProcessor();
    
    newProcessor.onSignalReady = (signal: ProcessedSignal) => {
      setLastSignal(signal);
    };
    
    newProcessor.initialize().catch(error => {
      console.error("Error initializing signal processor:", error);
    });
    
    setProcessor(newProcessor);
    
    return () => {
      if (newProcessor) {
        newProcessor.stop();
        newProcessor.onSignalReady = null;
      }
    };
  }, []);

  // Actions
  const startProcessing = () => {
    if (processor) {
      processor.start();
      setIsProcessing(true);
    }
  };

  const stopProcessing = () => {
    if (processor) {
      processor.stop();
      setIsProcessing(false);
      setLastSignal(null);
    }
  };

  return (
    <SignalProcessorContext.Provider 
      value={{ 
        processor, 
        lastSignal, 
        isProcessing, 
        startProcessing, 
        stopProcessing 
      }}
    >
      {children}
    </SignalProcessorContext.Provider>
  );
};

// Custom hook for using the context
export const useSignalProcessorContext = () => {
  const context = useContext(SignalProcessorContext);
  
  if (!context) {
    throw new Error('useSignalProcessorContext must be used within a SignalProcessorProvider');
  }
  
  return context;
};
