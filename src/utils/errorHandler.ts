
// The issue is at line 100, where there's a comparison error with ErrorSeverity.INFO
// Let's fix this by ensuring the type comparison is correct

export enum ErrorSeverity {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical'
}

export enum ErrorCategory {
  SENSOR = 'sensor',
  PROCESSING = 'processing',
  CALCULATION = 'calculation',
  DEVICE = 'device',
  NETWORK = 'network',
  AUTHENTICATION = 'authentication',
  AUTHORIZATION = 'authorization',
  VALIDATION = 'validation',
  SYSTEM = 'system'
}

export interface ErrorDetails {
  errorCode: string;
  message: string;
  severity: ErrorSeverity;
  category: ErrorCategory;
  timestamp: number;
  context?: Record<string, any>;
  retryable?: boolean;
}

class ErrorHandler {
  private static instance: ErrorHandler;
  private errors: ErrorDetails[] = [];
  private errorCallbacks: ((error: ErrorDetails) => void)[] = [];

  private constructor() {
    // Private constructor for singleton
  }

  public static getInstance(): ErrorHandler {
    if (!ErrorHandler.instance) {
      ErrorHandler.instance = new ErrorHandler();
    }
    return ErrorHandler.instance;
  }

  public registerErrorCallback(callback: (error: ErrorDetails) => void): void {
    this.errorCallbacks.push(callback);
  }

  public reportError(error: ErrorDetails): void {
    this.errors.push(error);
    this.errorCallbacks.forEach(callback => callback(error));
    
    // Log to console based on severity
    switch (error.severity) {
      case ErrorSeverity.INFO:
        console.info(`[${error.category}] ${error.message}`);
        break;
      case ErrorSeverity.WARNING:
        console.warn(`[${error.category}] ${error.message}`);
        break;
      case ErrorSeverity.ERROR:
      case ErrorSeverity.CRITICAL:
        console.error(`[${error.category}] ${error.message}`);
        
        // For critical errors, we might want to show a modal or toast
        if (error.severity === ErrorSeverity.CRITICAL) {
          // Add critical error handling here
          this.handleCriticalError(error);
        }
        break;
    }
  }

  public getErrors(
    severity?: ErrorSeverity, 
    category?: ErrorCategory,
    limit?: number
  ): ErrorDetails[] {
    let filteredErrors = [...this.errors];
    
    if (severity) {
      // Fix: change comparison to use exact value matching instead of type comparison
      filteredErrors = filteredErrors.filter(e => e.severity === severity);
    }
    
    if (category) {
      filteredErrors = filteredErrors.filter(e => e.category === category);
    }
    
    if (limit && limit > 0) {
      return filteredErrors.slice(-limit);
    }
    
    return filteredErrors;
  }

  public clearErrors(): void {
    this.errors = [];
  }

  private handleCriticalError(error: ErrorDetails): void {
    // Add critical error handling logic here
    // For example, save current application state, show modal, etc.
    console.error('CRITICAL ERROR HANDLER:', error);
    
    // You might want to send these to a monitoring system
    if (window.navigator.onLine) {
      // Send to error reporting service
      try {
        // Mock sending to error reporting
        setTimeout(() => {
          console.log('Error sent to monitoring service:', error);
        }, 100);
      } catch (e) {
        console.error('Failed to send error to monitoring service', e);
      }
    } else {
      // Queue for later
      const queuedErrors = localStorage.getItem('queuedErrors');
      try {
        const parsed = queuedErrors ? JSON.parse(queuedErrors) : [];
        parsed.push(error);
        localStorage.setItem('queuedErrors', JSON.stringify(parsed));
      } catch (e) {
        console.error('Failed to queue error for later reporting', e);
      }
    }
  }
}

export default ErrorHandler.getInstance();
