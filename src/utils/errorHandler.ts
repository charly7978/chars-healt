// Error handling utility for consistent error management across the application
import { toast } from 'sonner';

export enum ErrorSeverity {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical'
}

export interface ErrorOptions {
  title?: string;
  description?: string;
  severity?: ErrorSeverity;
  showToast?: boolean;
  logToConsole?: boolean;
  logToServer?: boolean;
  errorCode?: string;
  context?: Record<string, any>;
}

const DEFAULT_OPTIONS: ErrorOptions = {
  title: 'An error occurred',
  description: 'Please try again later',
  severity: ErrorSeverity.ERROR,
  showToast: true,
  logToConsole: true,
  logToServer: false,
  errorCode: 'UNKNOWN_ERROR'
};

export function handleError(error: Error | string, options: ErrorOptions = {}): void {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const errorMessage = typeof error === 'string' ? error : error.message;
  const errorObj = typeof error === 'string' ? new Error(error) : error;
  
  // Format the error message
  const title = opts.title || 'Error';
  const description = opts.description || errorMessage;
  const severity = opts.severity || ErrorSeverity.ERROR;
  const errorCode = opts.errorCode || 'UNKNOWN_ERROR';
  
  // Log to console if enabled
  if (opts.logToConsole) {
    if ([ErrorSeverity.INFO].includes(severity)) {
      console.info(`[${errorCode}] ${title}: ${description}`, opts.context || {});
    } else if (severity === ErrorSeverity.WARNING) {
      console.warn(`[${errorCode}] ${title}: ${description}`, errorObj, opts.context || {});
    } else {
      console.error(`[${errorCode}] ${title}: ${description}`, errorObj, opts.context || {});
    }
  }
  
  // Show toast notification if enabled
  if (opts.showToast) {
    if (severity === ErrorSeverity.INFO) {
      toast.info(description, {
        id: errorCode,
        description: opts.context ? JSON.stringify(opts.context) : undefined
      });
    } else if (severity === ErrorSeverity.WARNING) {
      toast.warning(description, {
        id: errorCode,
        description: opts.context ? JSON.stringify(opts.context) : undefined
      });
    } else if (severity === ErrorSeverity.CRITICAL) {
      toast.error(description, {
        id: errorCode,
        description: opts.context ? JSON.stringify(opts.context) : undefined,
        duration: 10000 // Longer duration for critical errors
      });
    } else {
      toast.error(description, {
        id: errorCode,
        description: opts.context ? JSON.stringify(opts.context) : undefined
      });
    }
  }
  
  // Log to server if enabled
  if (opts.logToServer) {
    // Implementation for server logging would go here
    // This could use an API call to a logging service
    const logData = {
      errorCode,
      title,
      description,
      severity,
      timestamp: new Date().toISOString(),
      context: opts.context || {},
      stack: errorObj.stack
    };
    
    // Example server logging implementation
    try {
      // This would be replaced with actual API call
      // fetch('/api/log', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify(logData)
      // });
      console.log('Would log to server:', logData);
    } catch (logError) {
      console.error('Failed to log error to server:', logError);
    }
  }
}

export function createErrorHandler(defaultOptions: ErrorOptions = {}) {
  return (error: Error | string, options: ErrorOptions = {}) => {
    handleError(error, { ...defaultOptions, ...options });
  };
}
