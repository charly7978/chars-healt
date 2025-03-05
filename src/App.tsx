import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { Toaster } from "@/components/ui/toaster";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import { SignalProcessorProvider } from '@/hooks/useSignalProcessorContext';

const App = () => {
  return (
    <SignalProcessorProvider>
      <Router>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
        <Toaster />
      </Router>
    </SignalProcessorProvider>
  );
};

export default App;
