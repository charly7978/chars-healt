import { toast } from 'sonner';
import { ErrorSeverity } from '../types/error';

export const handleError = (error: Error | string, severity: ErrorSeverity = ErrorSeverity.ERROR, context?: string): void => {
  const errorMessage = typeof error === 'string' ? error : error.message;

  if (context) {
    console.error(`[${context}] ${errorMessage}`);
  } else {
    console.error(errorMessage);
  }

  switch (severity) {
    case ErrorSeverity.INFO:
      console.info(`[INFO] ${errorMessage}`);
      toast(errorMessage, { position: 'bottom-right', duration: 5000 });
      break;
    case ErrorSeverity.WARNING:
      console.warn(`[WARNING] ${errorMessage}`);
      toast.warning(errorMessage, { position: 'bottom-right', duration: 5000 });
      break;
    case ErrorSeverity.ERROR:
      console.error(`[ERROR] ${errorMessage}`);
      toast.error(errorMessage, { position: 'bottom-right', duration: 5000 });
      break;
    case ErrorSeverity.CRITICAL:
      console.error(`[CRITICAL] ${errorMessage}`);
      toast.error(errorMessage, { position: 'bottom-right', duration: 8000 });
      break;
    default:
      console.error(`[UNKNOWN_SEVERITY] ${errorMessage}`);
      toast.error(errorMessage, { position: 'bottom-right', duration: 5000 });
  }

  // Additional error logging or recovery logic can be added here
};

export const logError = (error: Error | string, context?: string): void => {
  const errorMessage = typeof error === 'string' ? error : error.message;
  console.error(`[LOG] ${context ? `[${context}] ` : ''}${errorMessage}`);
};
