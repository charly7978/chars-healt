
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { PPGSignalProcessor } from '../modules/SignalProcessor';
import { ProcessedSignal, ProcessingError } from '../types/signal';

interface SignalProcessorContextProps {
  processor: PPGSignalProcessor | null;
  lastSignal: ProcessedSignal | null;
  error: ProcessingError | null;
  isProcessing: boolean;
  startProcessing: () => void;
  stopProcessing: () => void;
  cleanMemory: () => void;
}

const SignalProcessorContext = createContext<SignalProcessorContextProps | null>(null);

export const useSignalProcessorContext = () => {
  const context = useContext(SignalProcessorContext);
  if (!context) {
    throw new Error('useSignalProcessorContext must be used within a SignalProcessorProvider');
  }
  return context;
};

interface SignalProcessorProviderProps {
  children: ReactNode;
}

export const SignalProcessorProvider: React.FC<SignalProcessorProviderProps> = ({ children }) => {
  const [processor, setProcessor] = useState<PPGSignalProcessor | null>(null);
  const [lastSignal, setLastSignal] = useState<ProcessedSignal | null>(null);
  const [error, setError] = useState<ProcessingError | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    // Initialize the processor
    const newProcessor = new PPGSignalProcessor();
    
    newProcessor.onSignalReady = (signal: ProcessedSignal) => {
      setLastSignal(signal);
      setError(null);
    };

    newProcessor.onError = (processingError: ProcessingError) => {
      console.error("Signal processing error:", processingError);
      setError(processingError);
    };

    // Initialize the processor
    newProcessor.initialize().catch(err => {
      console.error("Failed to initialize signal processor:", err);
    });

    setProcessor(newProcessor);

    // Cleanup
    return () => {
      if (newProcessor) {
        newProcessor.stop();
        newProcessor.onSignalReady = null;
        newProcessor.onError = null;
      }
      setProcessor(null);
    };
  }, []);

  const startProcessing = () => {
    if (processor) {
      setIsProcessing(true);
      processor.start();
    }
  };

  const stopProcessing = () => {
    if (processor) {
      processor.stop();
      setIsProcessing(false);
    }
  };

  const cleanMemory = () => {
    setLastSignal(null);
    setError(null);
    
    // Force garbage collection hint
    if (typeof window !== 'undefined' && (window as any).gc) {
      try {
        (window as any).gc();
      } catch (e) {
        console.log("Garbage collection unavailable");
      }
    }
  };

  return (
    <SignalProcessorContext.Provider
      value={{
        processor,
        lastSignal,
        error,
        isProcessing,
        startProcessing,
        stopProcessing,
        cleanMemory
      }}
    >
      {children}
    </SignalProcessorContext.Provider>
  );
};
