
import { useState, useEffect, useCallback, useRef } from 'react';
import { ProcessedSignal, ProcessingError } from '../types/signal';

export const useSignalProcessor = () => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastSignal, setLastSignal] = useState<ProcessedSignal | null>(null);
  const [error, setError] = useState<ProcessingError | null>(null);
  
  // Referencias para Web Worker y limpieza de memoria
  const workerRef = useRef<Worker | null>(null);
  const signalBufferRef = useRef<ProcessedSignal[]>([]);
  const maxBufferSize = 50; // Limitar buffer para evitar fugas de memoria
  
  // Control de gc manual
  const lastGCTime = useRef<number>(Date.now());
  const gcInterval = 15000; // 15 segundos entre limpiezas de memoria

  // Inicialización del Web Worker
  useEffect(() => {
    console.log("useSignalProcessor: Creando Web Worker para procesamiento");
    
    // Crear Web Worker
    try {
      const worker = new Worker(new URL('../workers/signalWorker.ts', import.meta.url), { type: 'module' });
      
      worker.onmessage = (event) => {
        const { type, signal, error: workerError } = event.data;
        
        switch (type) {
          case 'ready':
            console.log("useSignalProcessor: Web Worker listo");
            break;
            
          case 'signalProcessed':
            if (signal) {
              // Almacenar señal en buffer con control de tamaño
              signalBufferRef.current.push(signal);
              if (signalBufferRef.current.length > maxBufferSize) {
                // Eliminar señales antiguas para conservar memoria
                signalBufferRef.current = signalBufferRef.current.slice(-maxBufferSize);
              }
              
              // Actualizar estado con la última señal
              setLastSignal(signal);
              setError(null);
            }
            break;
            
          case 'error':
            console.error("useSignalProcessor: Error en Web Worker:", workerError);
            setError({
              code: 'WORKER_ERROR',
              message: workerError?.message || 'Error en el procesamiento de señal',
              timestamp: Date.now()
            });
            break;
        }
      };
      
      worker.onerror = (err) => {
        console.error("useSignalProcessor: Error en Web Worker:", err);
        setError({
          code: 'WORKER_ERROR',
          message: err.message || 'Error en Web Worker',
          timestamp: Date.now()
        });
      };
      
      workerRef.current = worker;
    } catch (err) {
      console.error("useSignalProcessor: Error creando Web Worker:", err);
      setError({
        code: 'WORKER_INIT_ERROR',
        message: 'No se pudo inicializar el procesador de señal',
        timestamp: Date.now()
      });
    }
    
    return () => {
      console.log("useSignalProcessor: Limpiando Web Worker");
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
      // Limpiar buffer al desmontar
      signalBufferRef.current = [];
    };
  }, []);

  // Limpieza periódica de memoria
  useEffect(() => {
    if (!isProcessing) return;
    
    const memoryCleanupInterval = setInterval(() => {
      const now = Date.now();
      if (now - lastGCTime.current > gcInterval) {
        console.log("useSignalProcessor: Limpieza de memoria programada");
        
        // Limpiar buffers y forzar gc si está disponible
        signalBufferRef.current = signalBufferRef.current.slice(-10);
        
        if (typeof window !== 'undefined' && (window as any).gc) {
          try {
            (window as any).gc();
          } catch (e) {
            // Ignorar errores de gc
          }
        }
        
        lastGCTime.current = now;
      }
    }, 5000);
    
    return () => {
      clearInterval(memoryCleanupInterval);
    };
  }, [isProcessing]);

  const startProcessing = useCallback(() => {
    console.log("useSignalProcessor: Iniciando procesamiento");
    
    if (!workerRef.current) {
      console.error("useSignalProcessor: No hay Web Worker disponible");
      setError({
        code: 'NO_WORKER',
        message: 'Procesador de señal no disponible',
        timestamp: Date.now()
      });
      return;
    }
    
    setIsProcessing(true);
    workerRef.current.postMessage({ type: 'initialize' });
    
    // Limpiar buffer al iniciar
    signalBufferRef.current = [];
    lastGCTime.current = Date.now();
  }, []);

  const stopProcessing = useCallback(() => {
    console.log("useSignalProcessor: Deteniendo procesamiento");
    
    if (workerRef.current) {
      workerRef.current.postMessage({ type: 'stop' });
    }
    
    setIsProcessing(false);
    
    // Limpieza agresiva de memoria al detener
    setTimeout(() => {
      // Esperar un poco para asegurar que todas las operaciones pendientes terminen
      signalBufferRef.current = [];
      if (typeof window !== 'undefined' && (window as any).gc) {
        try {
          console.log("useSignalProcessor: Forzando GC después de detener");
          (window as any).gc();
        } catch (e) {
          // Ignorar errores de gc
        }
      }
    }, 500);
  }, []);

  const calibrate = useCallback(async () => {
    try {
      console.log("useSignalProcessor: Iniciando calibración");
      
      if (!workerRef.current) {
        throw new Error("No hay Web Worker disponible");
      }
      
      // Promesa para manejar respuesta asíncrona del worker
      const calibrationPromise = new Promise<boolean>((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          reject(new Error("Timeout en calibración"));
        }, 5000);
        
        const messageHandler = (event: MessageEvent) => {
          if (event.data.type === 'calibrated') {
            clearTimeout(timeoutId);
            workerRef.current?.removeEventListener('message', messageHandler);
            resolve(event.data.success);
          }
        };
        
        workerRef.current?.addEventListener('message', messageHandler);
        workerRef.current?.postMessage({ type: 'calibrate' });
      });
      
      const success = await calibrationPromise;
      console.log("useSignalProcessor: Calibración exitosa:", success);
      return success;
    } catch (error) {
      console.error("useSignalProcessor: Error de calibración:", error);
      setError({
        code: 'CALIBRATION_ERROR',
        message: 'Error durante la calibración',
        timestamp: Date.now()
      });
      return false;
    }
  }, []);

  const processFrame = useCallback((imageData: ImageData) => {
    if (!isProcessing || !workerRef.current) {
      return;
    }
    
    try {
      // Compresión de datos: reducir resolución si es muy grande
      let compressedImageData = imageData;
      const width = imageData.width;
      const height = imageData.height;
      
      // Si la resolución es alta, comprimir los datos
      if (width * height > 100000) { // e.g., más de 320x320
        const scaleFactor = 0.5;
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        if (ctx) {
          canvas.width = width * scaleFactor;
          canvas.height = height * scaleFactor;
          
          // Crear un ImageBitmap para renderizado más eficiente
          createImageBitmap(imageData).then(bitmap => {
            ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
            bitmap.close(); // Liberar recursos
            
            compressedImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            
            // Enviar al worker
            workerRef.current?.postMessage({ 
              type: 'processFrame', 
              data: { imageData: compressedImageData } 
            });
            
            // Limpiar y liberar referencias
            canvas.width = 0;
            canvas.height = 0;
          });
        } else {
          // Fallback si no se puede comprimir
          workerRef.current?.postMessage({ 
            type: 'processFrame', 
            data: { imageData } 
          });
        }
      } else {
        // Enviar directamente si la resolución es aceptable
        workerRef.current?.postMessage({ 
          type: 'processFrame', 
          data: { imageData } 
        });
      }
    } catch (err) {
      console.error("useSignalProcessor: Error enviando frame al worker:", err);
    }
  }, [isProcessing]);

  const handleError = useCallback((code: string, message: string): void => {
    console.error("useSignalProcessor: Error", code, message);
    const error: ProcessingError = {
      code,
      message,
      timestamp: Date.now()
    };
    setError(error);
  }, []);

  return {
    isProcessing,
    lastSignal,
    error,
    startProcessing,
    stopProcessing,
    calibrate,
    processFrame
  };
};
