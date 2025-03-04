import { ErrorSeverity } from '../types/signal';

export class ErrorHandler {
  private static instance: ErrorHandler;
  private errors: Array<{
    code: string;
    message: string;
    timestamp: number;
    severity: ErrorSeverity;
  }> = [];
  private errorSubscribers: Array<(error: any) => void> = [];

  private constructor() {
    // Private constructor for singleton pattern
  }

  public static getInstance(): ErrorHandler {
    if (!ErrorHandler.instance) {
      ErrorHandler.instance = new ErrorHandler();
    }
    return ErrorHandler.instance;
  }

  public captureError(code: string, message: string, severity: ErrorSeverity = ErrorSeverity.ERROR): void {
    const error = {
      code,
      message,
      timestamp: Date.now(),
      severity
    };
    this.errors.push(error);
    this.notifySubscribers(error);
    
    // Log to console based on severity
    switch(severity) {
      case ErrorSeverity.INFO:
        console.info(`[INFO] ${code}: ${message}`);
        break;
      case ErrorSeverity.WARNING:
        console.warn(`[WARNING] ${code}: ${message}`);
        break;
      case ErrorSeverity.ERROR:
        console.error(`[ERROR] ${code}: ${message}`);
        break;
      case ErrorSeverity.CRITICAL:
        console.error(`[CRITICAL] ${code}: ${message}`);
        // Maybe trigger crash reporting or other critical error handling
        break;
      default:
        console.log(`[LOG] ${code}: ${message}`);
    }
    
    // Clean up old errors to prevent memory issues
    this.pruneOldErrors();
  }

  public subscribe(callback: (error: any) => void): () => void {
    this.errorSubscribers.push(callback);
    
    // Return unsubscribe function
    return () => {
      this.errorSubscribers = this.errorSubscribers.filter(cb => cb !== callback);
    };
  }
  
  public getRecentErrors(count = 10): Array<any> {
    return this.errors.slice(-count);
  }
  
  public clearErrors(): void {
    this.errors = [];
  }
  
  public getErrorCount(): number {
    return this.errors.length;
  }

  public getSeverityCount(severity: ErrorSeverity): number {
    return this.errors.filter(e => e.severity === severity).length;
  }
  
  public hasCriticalErrors(): boolean {
    return this.errors.some(e => e.severity === ErrorSeverity.CRITICAL);
  }
  
  private notifySubscribers(error: any): void {
    this.errorSubscribers.forEach(callback => {
      try {
        callback(error);
      } catch (e) {
        console.error('Error in error subscriber callback', e);
      }
    });
  }
  
  private pruneOldErrors(): void {
    // Keep only the last 100 errors to prevent memory issues
    if (this.errors.length > 100) {
      this.errors = this.errors.slice(-100);
    }
    
    // Remove errors older than 1 hour
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    this.errors = this.errors.filter(error => error.timestamp >= oneHourAgo);
  }
  
  public logSystemInfo(): void {
    // Use switch for severity comparison
    switch(ErrorSeverity.INFO) {
      case ErrorSeverity.WARNING:
      case ErrorSeverity.ERROR:
      case ErrorSeverity.CRITICAL:
        // This will never execute
        console.log("Unexpected severity level");
        break;
      case ErrorSeverity.INFO:
      default:
        console.log("System information logged with INFO severity");
        break;
    }
  }
}

export default ErrorHandler.getInstance();
