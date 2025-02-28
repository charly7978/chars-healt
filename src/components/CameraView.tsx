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
  const [isHighEndDevice, setIsHighEndDevice] = useState(false);
  const retryCountRef = useRef(0);
  const maxRetries = 3;

  // Detectar si estamos en Android y evaluar capacidades del dispositivo
  useEffect(() => {
    const userAgent = navigator.userAgent.toLowerCase();
    const isAndroidDevice = /android/i.test(userAgent);
    setIsAndroid(isAndroidDevice);
    
    // Detectar si es un dispositivo de alta gama basado en núcleos lógicos
    const highEndCores = navigator.hardwareConcurrency || 0;
    const isHighEnd = highEndCores >= 6;
    setIsHighEndDevice(isHighEnd);
    
    console.log("CameraView: Detección de dispositivo", {
      isAndroid: isAndroidDevice,
      cores: highEndCores,
      isHighEnd
    });
  }, []);

  // Función para detener la cámara y liberar recursos
  const stopCamera = useCallback(() => {
    console.log("CameraView: Deteniendo cámara");
    
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
        }, isAndroid ? 100 : 50);
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
    
    // Resetear contador de reintentos
    retryCountRef.current = 0;
  }, [isAndroid]);

  // Función para activar la linterna con reintentos
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
      console.log("CameraView: Linterna activada exitosamente");
      torchEnabledRef.current = true;
      return true;
    } catch (e) {
      console.error("Error activando linterna:", e);
      
      // Reintentar con un breve retraso
      return new Promise<boolean>(resolve => {
        setTimeout(async () => {
          try {
            await videoTrack.applyConstraints({
              advanced: [{ torch: true }]
            });
            console.log("CameraView: Linterna activada en segundo intento");
            torchEnabledRef.current = true;
            resolve(true);
          } catch (e2) {
            console.error("Error en segundo intento de activación de linterna:", e2);
            torchEnabledRef.current = false;
            resolve(false);
          }
        }, 300);
      });
    }
  }, []);

  // Función optimizada para iniciar la cámara
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
      await new Promise(resolve => setTimeout(resolve, isAndroid ? 300 : 50));

      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('La API getUserMedia no está disponible');
      }

      // Configuración de la cámara optimizada para cada plataforma y tipo de dispositivo
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: 'environment',
          width: isHighEndDevice 
            ? { ideal: isAndroid ? 1280 : 1024 } 
            : { ideal: isAndroid ? 960 : 640 },
          height: isHighEndDevice 
            ? { ideal: isAndroid ? 720 : 768 } 
            : { ideal: isAndroid ? 540 : 480 },
          frameRate: { 
            ideal: isHighEndDevice ? 30 : (isAndroid ? 24 : 30),
            min: 20 // Asegurar mínimo 20fps para detección de pulso
          }
        },
        audio: false
      };

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

      // Configurar optimizaciones específicas para la plataforma
      const videoTrack = mediaStream.getVideoTracks()[0];
      if (videoTrack) {
        try {
          // Obtener capacidades del track para optimizaciones
          const capabilities = videoTrack.getCapabilities();
          console.log("CameraView: Capacidades de la cámara:", capabilities);
          
          // Configuraciones optimizadas para fotopletismografía
          const settings: MediaTrackConstraints = {};
          
          // Optimizaciones para exposición y enfoque
          if (capabilities.exposureMode) {
            if (capabilities.exposureMode.includes('manual')) {
              settings.exposureMode = 'manual';
              // Nota: exposureTime no está disponible en todos los dispositivos
              // y no es parte del tipo estándar MediaTrackCapabilities
            } else if (capabilities.exposureMode.includes('continuous')) {
              settings.exposureMode = 'continuous';
            }
          }
          
          // Enfoque fijo para evitar cambios durante la medición
          if (capabilities.focusMode) {
            if (capabilities.focusMode.includes('fixed')) {
              settings.focusMode = 'fixed';
            } else if (capabilities.focusMode.includes('manual')) {
              settings.focusMode = 'manual';
            } else if (capabilities.focusMode.includes('continuous')) {
              settings.focusMode = 'continuous';
            }
          }
          
          // Balance de blancos fijo para mejor detección de rojo
          if (capabilities.whiteBalanceMode) {
            if (capabilities.whiteBalanceMode.includes('manual')) {
              settings.whiteBalanceMode = 'manual';
              // Nota: colorTemperature no está disponible en todos los dispositivos
              // y no es parte del tipo estándar MediaTrackCapabilities
            } else if (capabilities.whiteBalanceMode.includes('continuous')) {
              settings.whiteBalanceMode = 'continuous';
            }
          }
          
          // Aplicar configuraciones si hay alguna disponible
          if (Object.keys(settings).length > 0) {
            await videoTrack.applyConstraints(settings);
            console.log("CameraView: Configuraciones avanzadas aplicadas:", settings);
          }
        } catch (err) {
          console.error("Error aplicando configuraciones avanzadas:", err);
        }
      }

      // Configurar el elemento de video con optimizaciones
      if (videoRef.current) {
        console.log("CameraView: Asignando stream al elemento video");
        
        // Optimizaciones específicas para el elemento video
        videoRef.current.style.willChange = 'transform';
        videoRef.current.style.transform = 'translateZ(0)';
        videoRef.current.style.backfaceVisibility = 'hidden';
        
        // Priorizar calidad sobre velocidad para mejor análisis de color
        videoRef.current.style.imageRendering = isHighEndDevice ? 'auto' : 'pixelated';
        
        videoRef.current.srcObject = mediaStream;
        
        // En Android, esperar a que las optimizaciones se apliquen antes de reproducir
        await new Promise(resolve => setTimeout(resolve, isAndroid ? 100 : 0));
        
        await videoRef.current.play().catch(e => {
          console.error("Error reproduciendo video:", e);
          throw e;
        });
        console.log("CameraView: Video reproduciendo correctamente");
      } else {
        console.error("CameraView: El elemento video no está disponible");
      }

      // Esperar un momento antes de activar la linterna
      await new Promise(resolve => setTimeout(resolve, isAndroid ? 300 : 150));

      // Intentar activar la linterna si estamos monitorizando
      if (videoTrack) {
        const torchEnabled = await enableTorch(videoTrack);
        if (!torchEnabled && isAndroid) {
          // En Android, a veces necesitamos un segundo intento después de un retraso
          setTimeout(async () => {
            if (mountedRef.current && isMonitoring && videoTrack.readyState === 'live') {
              await enableTorch(videoTrack);
            }
          }, 500);
        }
      }

      // Notificar que el stream está listo
      if (onStreamReady && isMonitoring && mountedRef.current) {
        console.log("CameraView: Notificando stream listo");
        onStreamReady(mediaStream);
      }
      
      // Resetear contador de reintentos en caso de éxito
      retryCountRef.current = 0;
    } catch (error) {
      console.error('Error iniciando la cámara:', error);
      setError(`Error iniciando la cámara: ${error instanceof Error ? error.message : String(error)}`);
      
      // Reintentar automáticamente si no hemos excedido el máximo de intentos
      if (retryCountRef.current < maxRetries && mountedRef.current && isMonitoring) {
        retryCountRef.current++;
        console.log(`CameraView: Reintentando iniciar cámara (${retryCountRef.current}/${maxRetries})...`);
        
        setTimeout(() => {
          if (mountedRef.current && isMonitoring) {
            startCamera();
          }
        }, 1000);
      } else {
        stopCamera();
      }
    } finally {
      initializingRef.current = false;
    }
  }, [isMonitoring, onStreamReady, stopCamera, isAndroid, isHighEndDevice, enableTorch]);

  // Efecto para iniciar/detener la cámara cuando cambia isMonitoring
  useEffect(() => {
    console.log("CameraView: isMonitoring cambió a:", isMonitoring);
    
    if (isMonitoring) {
      // Usar un timeout más largo para Android
      const timeoutId = setTimeout(() => {
        startCamera();
      }, isAndroid ? 500 : 100);
      return () => clearTimeout(timeoutId);
    } else {
      stopCamera();
    }
  }, [isMonitoring, startCamera, stopCamera, isAndroid]);

  // Efecto de limpieza al montar/desmontar el componente
  useEffect(() => {
    mountedRef.current = true;
    console.log("CameraView: Componente montado");

    // Asegurarse de que los permisos de la cámara estén disponibles
    navigator.mediaDevices?.getUserMedia({ video: true, audio: false })
      .then(stream => {
        // Solo comprobamos los permisos, detenemos el stream inmediatamente
        stream.getTracks().forEach(track => track.stop());
        console.log("CameraView: Permisos de cámara verificados");
      })
      .catch(err => {
        console.error("CameraView: Error verificando permisos de cámara:", err);
        setError(`Error de permisos: ${err instanceof Error ? err.message : String(err)}`);
      });

    return () => {
      console.log("CameraView: Componente desmontando");
      mountedRef.current = false;
      stopCamera();
    };
  }, [stopCamera]);

  // Efecto para monitorear y recuperar la linterna si se apaga
  useEffect(() => {
    if (!isMonitoring || !streamRef.current) return;
    
    // Verificar periódicamente el estado de la linterna en Android
    // (algunos dispositivos la apagan automáticamente después de un tiempo)
    const torchCheckInterval = setInterval(() => {
      if (isMonitoring && streamRef.current && isAndroid) {
        const videoTrack = streamRef.current.getVideoTracks()[0];
        if (videoTrack && videoTrack.getCapabilities()?.torch && !torchEnabledRef.current) {
          console.log("CameraView: Reactivando linterna que se apagó");
          enableTorch(videoTrack);
        }
      }
    }, 5000);
    
    return () => clearInterval(torchCheckInterval);
  }, [isMonitoring, isAndroid, enableTorch]);

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
          objectFit: 'cover',
          filter: isFingerDetected ? 'brightness(1.1) contrast(1.1)' : 'none' // Mejorar visibilidad cuando hay dedo
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
