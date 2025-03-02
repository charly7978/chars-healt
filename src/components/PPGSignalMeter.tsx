import React, { useEffect, useRef, useCallback, useState } from 'react';
import { Fingerprint } from 'lucide-react';
import { CircularBuffer, PPGDataPoint } from '../utils/CircularBuffer';

interface PPGSignalMeterProps {
  value: number;
  quality: number;
  isFingerDetected: boolean;
  onStartMeasurement: () => void;
  onReset: () => void;
  arrhythmiaStatus?: string;
  rawArrhythmiaData?: {
    timestamp: number;
    rmssd: number;
    rrVariation: number;
  } | null;
}

const PPGSignalMeter = ({ 
  value, 
  quality, 
  isFingerDetected,
  onStartMeasurement,
  onReset,
  arrhythmiaStatus,
  rawArrhythmiaData
}: PPGSignalMeterProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bufferRef = useRef<CircularBuffer>(new CircularBuffer(300)); // 10 segundos a 30 fps
  const [lastHighestPoint, setLastHighestPoint] = useState(0);
  const [isAscending, setIsAscending] = useState(false);
  const [lastBeepTime, setLastBeepTime] = useState(0);
  const [arrhythmiaCount, setArrhythmiaCount] = useState(0);
  const [showArrhythmiaAlert, setShowArrhythmiaAlert] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const heartSoundRef = useRef<AudioBuffer | null>(null);
  
  // Variables para seguimiento de fase ascendente
  const lastValuesRef = useRef<number[]>([]);
  const MIN_BEEP_INTERVAL_MS = 600; // Mínimo tiempo entre beeps en ms
  const RISING_EDGE_THRESHOLD = 0.03; // Umbral para detectar fase ascendente
  const MAX_VALUES_HISTORY = 5; // Número de valores para detectar tendencia
  
  // Para cargar el sonido real de monitor cardíaco
  useEffect(() => {
    // Crear contexto de audio una sola vez
    if (!audioContextRef.current) {
      try {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        
        // Cargar el sonido real de monitor cardíaco
        fetch("https://assets.mixkit.co/active_storage/sfx/2429/2429-preview.mp3")
          .then(response => {
            if (!response.ok) {
              throw new Error("Error al cargar el sonido");
            }
            return response.arrayBuffer();
          })
          .then(arrayBuffer => {
            if (audioContextRef.current) {
              return audioContextRef.current.decodeAudioData(arrayBuffer);
            }
            throw new Error("Contexto de audio no disponible");
          })
          .then(audioBuffer => {
            heartSoundRef.current = audioBuffer;
            console.log("Sonido de monitor cardíaco cargado correctamente");
          })
          .catch(error => {
            console.error("Error cargando el sonido real:", error);
          });
      } catch (error) {
        console.error("Error creando contexto de audio:", error);
      }
    }
    
    return () => {
      // Limpiar contexto de audio al desmontar
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close().catch(console.error);
      }
    };
  }, []);
  
  // Función para reproducir el sonido del monitor
  const playHeartSound = useCallback((volume = 0.9) => {
    const now = Date.now();
    
    // Verificar tiempo mínimo entre beeps
    if (now - lastBeepTime < MIN_BEEP_INTERVAL_MS) {
      return;
    }
    
    setLastBeepTime(now);
    
    if (!audioContextRef.current) return;
    
    try {
      // Si tenemos el sonido de monitor cardíaco, usarlo
      if (heartSoundRef.current) {
        const source = audioContextRef.current.createBufferSource();
        const gainNode = audioContextRef.current.createGain();
        
        source.buffer = heartSoundRef.current;
        source.connect(gainNode);
        gainNode.connect(audioContextRef.current.destination);
        
        // Ajustar volumen según la calidad de la señal
        gainNode.gain.value = Math.min(1.0, Math.max(0.3, volume * Math.min(1.0, quality * 1.5)));
        
        source.start();
      } else {
        // Sonido de respaldo: beep sintético
        const oscillator = audioContextRef.current.createOscillator();
        const gainNode = audioContextRef.current.createGain();
        
        oscillator.type = 'sine';
        oscillator.frequency.value = 880;
        oscillator.connect(gainNode);
        gainNode.connect(audioContextRef.current.destination);
        
        gainNode.gain.value = Math.min(0.9, volume * Math.min(1.0, quality));
        
        oscillator.start();
        oscillator.stop(audioContextRef.current.currentTime + 0.08);
      }
    } catch (error) {
      console.error("Error reproduciendo sonido:", error);
    }
  }, [lastBeepTime, quality]);
  
  // Monitorear detección de arritmias
  useEffect(() => {
    if (!arrhythmiaStatus) return;
    
    const [status, countStr] = arrhythmiaStatus.split('|');
    const count = parseInt(countStr || '0', 10);
    
    // Si se detectó una nueva arritmia, mostrar alerta
    if (count > arrhythmiaCount) {
      setArrhythmiaCount(count);
      setShowArrhythmiaAlert(true);
      
      // Ocultar alerta después de 3 segundos
      setTimeout(() => {
        setShowArrhythmiaAlert(false);
      }, 3000);
    }
  }, [arrhythmiaStatus, arrhythmiaCount]);
  
  // Función principal para dibujar la forma de onda
  const drawWaveform = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Obtener dimensiones reales del canvas
    const width = canvas.width;
    const height = canvas.height;
    
    // Crear un fondo con gradiente
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, '#000811');
    gradient.addColorStop(1, '#001a2c');
    
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    
    // Dibujar líneas de cuadrícula
    ctx.strokeStyle = 'rgba(0, 255, 0, 0.2)';
    ctx.lineWidth = 1;
    
    // Líneas horizontales
    const horizontalLines = 5;
    for (let i = 1; i < horizontalLines; i++) {
      const y = (i / horizontalLines) * height;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    
    // Líneas verticales
    const verticalLines = 10;
    for (let i = 1; i < verticalLines; i++) {
      const x = (i / verticalLines) * width;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    
    // Obtener los puntos del buffer
    const points = bufferRef.current.getPoints();
    if (points.length === 0) return;
    
    // Dibujar la forma de onda del PPG
    ctx.beginPath();
    
    // Iniciar el camino en el primer punto
    const firstPoint = points[0];
    const firstX = 0;
    const firstY = height - (firstPoint.value * height * 0.8);
    ctx.moveTo(firstX, firstY);
    
    // Calcular el ancho de cada segmento
    const segmentWidth = width / (points.length - 1);
    
    // Actualizar el último valor más alto
    let currentHighestPoint = Math.max(...points.map(p => p.value));
    
    // Procesar los valores para detección de fase ascendente
    const latestValue = points[points.length - 1].value;
    lastValuesRef.current.push(latestValue);
    
    // Mantener un tamaño fijo en el array
    if (lastValuesRef.current.length > MAX_VALUES_HISTORY) {
      lastValuesRef.current.shift();
    }
    
    // Detectar fase ascendente analizando tendencia
    if (lastValuesRef.current.length >= 3) {
      const values = lastValuesRef.current;
      const len = values.length;
      
      // Calcular derivada aproximada (velocidad de cambio)
      const derivative = (values[len-1] - values[len-3]) / 2;
      
      // Determinar si estamos en fase ascendente
      const wasAscending = isAscending;
      const newIsAscending = derivative > RISING_EDGE_THRESHOLD;
      
      // Reproducir sonido en la fase ascendente (borde ascendente)
      if (newIsAscending && !wasAscending && isFingerDetected && quality > 0.4) {
        // Estamos en el borde ascendente del pico - REPRODUCIR SONIDO AQUÍ
        playHeartSound(Math.min(1.0, currentHighestPoint * 2));
      }
      
      // Actualizar estado de fase ascendente
      setIsAscending(newIsAscending);
    }
    
    // Actualizar el punto más alto
    setLastHighestPoint(currentHighestPoint);
    
    // Dibujar cada punto con un estilo específico según sus propiedades
    for (let i = 1; i < points.length; i++) {
      const point = points[i];
      const x = i * segmentWidth;
      const y = height - (point.value * height * 0.8);
      
      // Si este punto es una arritmia, marcarlo de manera especial
      if (point.isArrhythmia) {
        // Cambiar color para puntos de arritmia
        ctx.lineTo(x, y);
        ctx.stroke();
        
        // Marcar punto de arritmia
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#ff3333';
        ctx.fill();
        
        // Continuar la línea
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.strokeStyle = '#3cff00';
      } else {
        // Línea normal
        ctx.lineTo(x, y);
      }
    }
    
    // Establecer el estilo de la línea principal
    ctx.strokeStyle = quality > 0.5 ? '#3cff00' : 'rgba(60, 255, 0, 0.7)';
    ctx.lineWidth = 2;
    ctx.stroke();
    
  }, [isFingerDetected, quality, playHeartSound, isAscending]);
  
  // Añadir nuevos puntos al buffer y dibujar
  useEffect(() => {
    // Solo procesar cuando se detecta el dedo
    if (isFingerDetected) {
      const timestamp = Date.now();
      
      // Obtener estado de arritmia si está disponible
      let isArrhythmiaPoint = false;
      if (arrhythmiaStatus && arrhythmiaStatus.includes("ARRITMIA DETECTADA")) {
        // Si tenemos datos crudos y están cerca del timestamp actual (< 500ms)
        if (rawArrhythmiaData && 
            Math.abs(rawArrhythmiaData.timestamp - timestamp) < 500) {
          isArrhythmiaPoint = true;
        }
      }
      
      // Añadir el nuevo punto al buffer
      bufferRef.current.push({
        time: timestamp,
        value: value,
        isArrhythmia: isArrhythmiaPoint
      });
      
      // Dibujar la forma de onda
      drawWaveform();
    }
  }, [value, isFingerDetected, drawWaveform, arrhythmiaStatus, rawArrhythmiaData]);
  
  // Limpiar buffer cuando se reinicia
  useEffect(() => {
    if (!isFingerDetected) {
      bufferRef.current.clear();
      lastValuesRef.current = [];
      setIsAscending(false);
      drawWaveform();
    }
  }, [isFingerDetected, drawWaveform]);
  
  return (
    <div className="relative w-full aspect-[2/1] bg-black rounded-xl overflow-hidden shadow-lg">
      {/* Canvas para la forma de onda */}
      <canvas 
        ref={canvasRef}
        className="w-full h-full"
        width={600}
        height={300}
      />
      
      {/* Capa de sombreado cuando no se detecta el dedo */}
      {!isFingerDetected && (
        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm flex flex-col items-center justify-center">
          <Fingerprint size={48} className="text-medical-blue mb-4" />
          <p className="text-white text-center px-4">
            Coloca tu dedo índice sobre la cámara trasera
          </p>
          <button
            onClick={onStartMeasurement}
            className="mt-4 bg-medical-blue text-white px-4 py-2 rounded-lg"
          >
            Iniciar medición
          </button>
        </div>
      )}
      
      {/* Indicador de calidad de señal */}
      {isFingerDetected && (
        <div className="absolute top-2 right-2 flex items-center gap-2">
          <div className={`h-2 w-2 rounded-full ${quality > 0.7 ? 'bg-green-500' : quality > 0.4 ? 'bg-yellow-500' : 'bg-red-500'}`}></div>
          <span className="text-xs text-white">
            {quality > 0.7 ? 'Señal óptima' : quality > 0.4 ? 'Señal aceptable' : 'Señal débil'}
          </span>
        </div>
      )}
      
      {/* Indicador de arritmias */}
      {isFingerDetected && arrhythmiaCount > 0 && (
        <div className="absolute top-2 left-2 flex items-center">
          <div className="bg-red-500/80 text-white text-xs font-bold px-2 py-1 rounded">
            Arritmias: {arrhythmiaCount}
          </div>
        </div>
      )}
      
      {/* Alerta de arritmia detectada */}
      {showArrhythmiaAlert && (
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 
                        bg-red-500/90 text-white px-4 py-2 rounded-lg 
                        animate-pulse shadow-lg">
          ¡ARRITMIA DETECTADA!
        </div>
      )}
      
      {/* Botón de reset */}
      {isFingerDetected && (
        <button
          onClick={onReset}
          className="absolute bottom-2 right-2 bg-gray-700/70 text-white text-xs px-2 py-1 rounded"
        >
          Reiniciar
        </button>
      )}
    </div>
  );
};

export default PPGSignalMeter;
