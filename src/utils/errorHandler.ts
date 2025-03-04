import { toast } from 'sonner';

export enum ErrorSeverity {
    INFO = 'info',
    WARNING = 'warning',
    ERROR = 'error',
    CRITICAL = 'critical'
}

interface ErrorDetails {
    message: string;
    severity: ErrorSeverity;
    code?: string;
    timestamp?: number;
    metadata?: any;
}

const logErrorToConsole = (errorDetails: ErrorDetails) => {
    const { message, severity, code, timestamp, metadata } = errorDetails;
    const logEntry = `[${severity.toUpperCase()}] ${message} ${code ? `(Code: ${code})` : ''} ${timestamp ? `(Timestamp: ${timestamp})` : ''} ${metadata ? `(Metadata: ${JSON.stringify(metadata)})` : ''}`;

    switch (severity) {
        case ErrorSeverity.CRITICAL:
            console.error(logEntry);
            break;
        case ErrorSeverity.ERROR:
            console.error(logEntry);
            break;
        case ErrorSeverity.WARNING:
            console.warn(logEntry);
            break;
        case ErrorSeverity.INFO:
            console.info(logEntry);
            break;
        default:
            console.log(logEntry);
    }
};

const displayToastNotification = (errorDetails: ErrorDetails) => {
    const { message, severity } = errorDetails;

    switch (severity) {
        case ErrorSeverity.CRITICAL:
            toast.error(message, { duration: 10000 });
            break;
        case ErrorSeverity.ERROR:
            toast.error(message, { duration: 5000 });
            break;
        case ErrorSeverity.WARNING:
            toast.warn(message, { duration: 3000 });
            break;
        case ErrorSeverity.INFO:
            toast.message(message, { duration: 2000 });
            break;
        default:
            toast(message, { duration: 2000 });
    }
};

export const handleError = (errorDetails: ErrorDetails) => {
    logErrorToConsole(errorDetails);
    displayToastNotification(errorDetails);

    const { severity } = errorDetails;

    // Reemplazar la comparación directa con un switch statement
    switch (severity) {
      case ErrorSeverity.WARNING:
      case ErrorSeverity.ERROR:
      case ErrorSeverity.CRITICAL:
        // Lógica para manejo de errores críticos
        break;
      case ErrorSeverity.INFO:
        // Lógica para manejo de información
        break;
      default:
        // Manejo predeterminado
        break;
    }
};

export const throwError = (message: string, severity: ErrorSeverity, code?: string, metadata?: any): never => {
    const errorDetails: ErrorDetails = {
        message,
        severity,
        code,
        timestamp: Date.now(),
        metadata
    };

    handleError(errorDetails);
    throw new Error(message);
};
