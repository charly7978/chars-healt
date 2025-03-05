
import { createContext, useContext, ReactNode, useState } from 'react';
import { SignalProcessor } from '@/types/signal';

interface SignalProcessorContextType {
  processor: SignalProcessor | null;
  setProcessor: (processor: SignalProcessor | null) => void;
}

const SignalProcessorContext = createContext<SignalProcessorContextType | undefined>(undefined);

export const SignalProcessorProvider = ({ children }: { children: ReactNode }) => {
  const [processor, setProcessor] = useState<SignalProcessor | null>(null);

  return (
    <SignalProcessorContext.Provider value={{ processor, setProcessor }}>
      {children}
    </SignalProcessorContext.Provider>
  );
};

export const useSignalProcessorContext = () => {
  const context = useContext(SignalProcessorContext);
  if (context === undefined) {
    throw new Error('useSignalProcessorContext must be used within a SignalProcessorProvider');
  }
  return context;
};
