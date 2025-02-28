
import React, { useRef, useEffect, useState, useCallback } from 'react';

interface CameraViewProps {
  onStreamReady?: (stream: MediaStream) => void;
  isMonitoring: boolean;
  isFingerDetected?: boolean;
  signalQuality?: number;
}

const CameraView = ({
  onStreamReady,
  isMonitoring,
  isFingerDetected = false,
  signalQuality = 0,
}: CameraViewProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mountedRef = useRef(true);
  const initializingRef = useRef(false);
  const torchEnabledRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [isAndroid, setIsAndroid] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const retryCountRef = useRef(0);
  const maxRetries = 3;
  const androidStreamTimeoutRef = useRef<number | null>(null);

  // Detectar plataforma
  useEffect(() => {
    const userAgent = navigator.userAgent.toLowerCase();
    setIsAndroid(/android/i.test(userAgent));
    setIsIOS(/iphone|ipad|ipod/.test(userAgent));
  }, []);

  // Función optimizada para detener la cámara y liberar recursos
  const stopCamera = useCallback(() => {
    console.log("CameraView: Deteniendo cámara");
    
    // Limpiar cualquier timeout pendiente
    if (androidStreamTimeoutRef.current) {
      clearTimeout(androidStreamTimeoutRef.current);
      androidStreamTimeoutRef.current = null;
    }
    
    if (streamRef.current) {
      const tracks = streamRef.current.getTracks();
      tracks.forEach(track => {
        // Primero desactivar la linterna si está disponible
        if (track.getCapabilities()?.torch && torchEnabledRef.current) {
          try {
            console.log("CameraView: Desactivando linterna");
            track.applyConstraints({
              advanced: [{ torch: false }]
            }).catch(err => console.error("Error desactivando linterna:", err));
            torchEnabledRef.current = false;
          } catch (err) {
            console.error("Error desactivando linterna:", err);
          }
        }
        
        // Esperar un momento antes de detener la pista (ayuda con Android)
        setTimeout(() => {
          try {
            if (track.readyState === 'live') {
              console.log("CameraView: Deteniendo track de video");
              track.stop();
            }
          } catch (err) {
            console.error("Error deteniendo track:", err);
          }
        }, isAndroid ? 200 : 50);
      });

      streamRef.current = null;
    }

    // Limpiar el video element
    if (videoRef.current) {
      try {
        videoRef.current.pause();
        videoRef.current.srcObject = null;
      } catch (err) {
        console.error("Error limpiando video element:", err);
      }
    }
    
    retryCountRef.current = 0;
  }, [isAndroid]);

  // Función optimizada para activar la linterna
  const enableTorch = useCallback(async (videoTrack: MediaStreamTrack) => {
    if (!videoTrack || !videoTrack.getCapabilities()?.torch) {
      console.log("CameraView: Linterna no disponible en este dispositivo");
      return false;
    }
    
    try {
      console.log("CameraView: Intentando activar linterna");
      await videoTrack.applyConstraints({
        advanced: [{ torch: true }]
      });
      console.log("CameraView: Linterna activada");
      torchEnabledRef.current = true;
      return true;
    } catch (e) {
      console.error("Error configurando linterna:", e);
      return false;
    }
  }, []);

  // Función optimizada para iniciar la cámara con configuraciones específicas por plataforma
  const startCamera = useCallback(async () => {
    if (!mountedRef.current || initializingRef.current) return;
    if (!isMonitoring) {
      console.log("CameraView: No iniciando cámara porque isMonitoring es false");
      return;
    }
    
    initializingRef.current = true;
    console.log("CameraView: Iniciando cámara (intento #" + (retryCountRef.current + 1) + ")");
    setError(null);
    
    try {
      // Asegurarse de que cualquier stream previo está detenido
      stopCamera();
      
      // Esperar un momento para que los recursos se liberen (especialmente en Android)
      await new Promise(resolve => setTimeout(resolve, isAndroid ? 500 : isIOS ? 200 : 50));

      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('La API getUserMedia no está disponible');
      }

      // Configuraciones optimizadas por plataforma
      let constraints: MediaStreamConstraints;
      
      if (isAndroid) {
        // Configuración optimizada para Android
        constraints = {
          video: {
            facingMode: 'environment',
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 30, min: 20 }
          },
          audio: false
        };
      } else if (isIOS) {
        // Configuración optimizada para iOS
        constraints = {
          video: {
            facingMode: 'environment',
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 30 }
          },
          audio: false
        };
      } else {
        // Configuración para otros dispositivos
        constraints = {
          video: {
            facingMode: 'environment',
            width: { ideal: 640 },
            height: { ideal: 480 },
            frameRate: { ideal: 30 }
          },
          audio: false
        };
      }

      // Intentar obtener acceso a la cámara
      console.log("CameraView: Solicitando acceso a la cámara con constraints:", constraints);
      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      console.log("CameraView: Acceso a la cámara concedido, tracks:", mediaStream.getTracks().length);
      
      if (!mountedRef.current || !isMonitoring) {
        console.log("CameraView: Componente desmontado o no monitorizando, liberando stream");
        mediaStream.getTracks().forEach(track => track.stop());
        initializingRef.current = false;
        return;
      }

      streamRef.current = mediaStream;
      const videoTrack = mediaStream.getVideoTracks()[0];

      // Configurar optimizaciones específicas para cada plataforma
      if (videoTrack) {
        try {
          // Obtener capacidades del track
          const capabilities = videoTrack.getCapabilities();
          console.log("CameraView: Capacidades del track:", capabilities);
          
          // Aplicar configuraciones óptimas según la plataforma
          if (isAndroid) {
            // Configuraciones específicas para Android
            const settings: any = {};
            
            if (capabilities.exposureMode && capabilities.exposureMode.includes('continuous')) {
              settings.exposureMode = 'continuous';
            }
            
            if (capabilities.focusMode && capabilities.focusMode.includes('continuous')) {
              settings.focusMode = 'continuous';
            }
            
            if (capabilities.whiteBalanceMode && capabilities.whiteBalanceMode.includes('continuous')) {
              settings.whiteBalanceMode = 'continuous';
            }
            
            if (Object.keys(settings).length > 0) {
              await videoTrack.applyConstraints({ advanced: [settings] });
              console.log("CameraView: Optimizaciones para Android aplicadas", settings);
            }
          } else if (isIOS) {
            // Algunas configuraciones específicas para iOS
            const settings: any = {};
            
            if (capabilities.exposureMode) {
              settings.exposureMode = 'continuous';
            }
            
            if (capabilities.focusMode) {
              settings.focusMode = 'continuous';
            }
            
            if (Object.keys(settings).length > 0) {
              await videoTrack.applyConstraints({ advanced: [settings] });
              console.log("CameraView: Optimizaciones para iOS aplicadas", settings);
            }
          }
        } catch (err) {
          console.error("Error aplicando optimizaciones para la plataforma:", err);
        }
      }

      // Configurar el elemento de video con optimizaciones
      if (videoRef.current) {
        console.log("CameraView: Asignando stream al elemento video");
        
        // Optimizaciones específicas para el elemento video
        videoRef.current.style.willChange = 'transform';
        videoRef.current.style.transform = 'translateZ(0)';
        videoRef.current.style.backfaceVisibility = 'hidden';
        
        // Configuraciones adicionales para mejorar rendimiento
        videoRef.current.playsInline = true;
        videoRef.current.muted = true;
        videoRef.current.autoplay = true;
        
        // Asignar stream
        videoRef.current.srcObject = mediaStream;
        
        // En Android, esperar a que las optimizaciones se apliquen antes de reproducir
        await new Promise(resolve => setTimeout(resolve, isAndroid ? 100 : isIOS ? 50 : 0));
        
        try {
          await videoRef.current.play();
          console.log("CameraView: Video reproduciendo correctamente");
        } catch (e) {
          console.error("Error reproduciendo video:", e);
          throw e;
        }
      } else {
        console.error("CameraView: El elemento video no está disponible");
      }

      // Android puede necesitar más tiempo para estabilizar la cámara antes de activar la linterna
      if (isAndroid) {
        androidStreamTimeoutRef.current = window.setTimeout(async () => {
          if (videoTrack && isMonitoring && mountedRef.current && !torchEnabledRef.current) {
            console.log("CameraView: Retrasando activación de linterna para Android");
            await enableTorch(videoTrack);
          }
          androidStreamTimeoutRef.current = null;
        }, 300);
      } else {
        // Para iOS y otros, intentar activar la linterna inmediatamente
        await new Promise(resolve => setTimeout(resolve, isIOS ? 200 : 100));
      }

      // Intentar activar la linterna si estamos monitorizando
      if (videoTrack && isMonitoring) {
        await enableTorch(videoTrack);
      }

      // Notificar que el stream está listo
      if (onStreamReady && isMonitoring && mountedRef.current) {
        console.log("CameraView: Notificando stream listo");
        onStreamReady(mediaStream);
      }
      
      // Resetear contador de intentos
      retryCountRef.current = 0;
    } catch (error) {
      console.error('Error iniciando la cámara:', error);
      setError(`Error iniciando la cámara: ${error instanceof Error ? error.message : String(error)}`);
      
      // Intentar nuevamente si no hemos alcanzado el máximo de intentos
      if (retryCountRef.current < maxRetries && mountedRef.current && isMonitoring) {
        retryCountRef.current++;
        console.log(`CameraView: Reintentando iniciar cámara (${retryCountRef.current}/${maxRetries})...`);
        setTimeout(() => {
          if (mountedRef.current && isMonitoring) {
            initializingRef.current = false;
            startCamera();
          }
        }, 1500); // Aumentar el tiempo de espera entre intentos para Android
      } else {
        stopCamera();
      }
    } finally {
      initializingRef.current = false;
    }
  }, [isMonitoring, onStreamReady, stopCamera, isAndroid, isIOS, enableTorch]);

  // Efecto para iniciar/detener la cámara cuando cambia isMonitoring
  useEffect(() => {
    console.log("CameraView: isMonitoring cambió a:", isMonitoring);
    
    if (isMonitoring) {
      // Usar un timeout más largo para Android
      const timeoutId = setTimeout(() => {
        startCamera();
      }, isAndroid ? 800 : isIOS ? 400 : 100);
      return () => clearTimeout(timeoutId);
    } else {
      stopCamera();
    }
  }, [isMonitoring, startCamera, stopCamera, isAndroid, isIOS]);

  // Efecto de limpieza al montar/desmontar el componente
  useEffect(() => {
    mountedRef.current = true;
    console.log("CameraView: Componente montado");
    
    return () => {
      console.log("CameraView: Componente desmontando");
      mountedRef.current = false;
      
      if (androidStreamTimeoutRef.current) {
        clearTimeout(androidStreamTimeoutRef.current);
        androidStreamTimeoutRef.current = null;
      }
      
      stopCamera();
    };
  }, [stopCamera]);

  // Efecto para reintentar activar la linterna si la calidad de la señal es buena pero no se detecta el dedo
  useEffect(() => {
    if (isMonitoring && streamRef.current && !isFingerDetected && signalQuality > 0) {
      const videoTrack = streamRef.current.getVideoTracks()[0];
      if (videoTrack && !torchEnabledRef.current) {
        console.log("CameraView: Reintentando activar linterna debido a señal detectada");
        enableTorch(videoTrack);
      }
    }
  }, [isMonitoring, isFingerDetected, signalQuality, enableTorch]);

  return (
    <>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className={`absolute top-0 left-0 min-w-full min-h-full w-auto h-auto z-0 object-cover ${!isMonitoring ? 'hidden' : ''}`}
        style={{
          transform: 'translateZ(0)', // Hardware acceleration
          WebkitBackfaceVisibility: 'hidden',
          backfaceVisibility: 'hidden',
          willChange: isAndroid ? 'transform' : 'auto',
        }}
      />
      {error && (
        <div className="absolute top-0 left-0 z-50 bg-red-500/80 text-white p-2 text-sm font-medium rounded m-2">
          {error}
        </div>
      )}
    </>
  );
};

export default React.memo(CameraView);
