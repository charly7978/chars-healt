
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { SignalProcessor } from '../modules/SignalProcessor';

// Define the shape of the context
interface SignalProcessorContextType {
  processor: SignalProcessor | null;
  isInitialized: boolean;
  initializeProcessor: () => void;
  resetProcessor: () => void;
}

// Create the context with a default value
const SignalProcessorContext = createContext<SignalProcessorContextType>({
  processor: null,
  isInitialized: false,
  initializeProcessor: () => {},
  resetProcessor: () => {}
});

// Provider component
export const SignalProcessorProvider = ({ children }: { children: ReactNode }) => {
  const [processor, setProcessor] = useState<SignalProcessor | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  // Initialize the processor
  const initializeProcessor = () => {
    if (!processor) {
      try {
        console.log('Initializing SignalProcessor...');
        const newProcessor = new SignalProcessor();
        setProcessor(newProcessor);
        setIsInitialized(true);
        console.log('SignalProcessor initialized successfully');
      } catch (error) {
        console.error('Failed to initialize SignalProcessor:', error);
      }
    } else {
      console.log('SignalProcessor already initialized');
    }
  };

  // Reset the processor
  const resetProcessor = () => {
    if (processor) {
      try {
        processor.reset();
        console.log('SignalProcessor reset successfully');
      } catch (error) {
        console.error('Failed to reset SignalProcessor:', error);
      }
    }
  };

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (processor) {
        try {
          console.log('Cleaning up SignalProcessor resources');
          processor.reset();
          setProcessor(null);
          setIsInitialized(false);
        } catch (error) {
          console.error('Error during SignalProcessor cleanup:', error);
        }
      }
    };
  }, [processor]);

  return (
    <SignalProcessorContext.Provider
      value={{
        processor,
        isInitialized,
        initializeProcessor,
        resetProcessor
      }}
    >
      {children}
    </SignalProcessorContext.Provider>
  );
};

// Custom hook to use the signal processor context
export const useSignalProcessorContext = () => {
  const context = useContext(SignalProcessorContext);
  if (context === undefined) {
    throw new Error('useSignalProcessorContext must be used within a SignalProcessorProvider');
  }
  return context;
};
