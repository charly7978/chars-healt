
import React, { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowLeftCircle, ArrowRightCircle, Heart } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PPGResultDialogProps {
  isOpen: boolean;
  onClose: () => void;
  signalData: Array<{time: number, value: number, isPeak: boolean}>;
  arrhythmias?: string;
}

const PPGResultDialog = ({ isOpen, onClose, signalData, arrhythmias }: PPGResultDialogProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollPosition, setScrollPosition] = useState(0);
  const MAX_TIME = 30000; // 30 segundos
  const VIEWPORT_WIDTH = 800;
  const TOTAL_WIDTH = 2400; // 3 veces más ancho para mejor detalle
  const CANVAS_HEIGHT = 400;
  
  // Extraer el contador de arritmias del string "SIN ARRITMIAS|0" o "ARRITMIA DETECTADA|3"
  const arrhythmiaCount = arrhythmias ? 
    parseInt(arrhythmias.split("|")[1]) || 0 : 0;

  useEffect(() => {
    if (!canvasRef.current || !isOpen || signalData.length === 0) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Limpiar canvas
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, TOTAL_WIDTH, CANVAS_HEIGHT);

    // Dibujar líneas de grid verticales (cada segundo = 80px)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 30; i++) {
      const x = (TOTAL_WIDTH / 30) * i;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, CANVAS_HEIGHT);
      ctx.stroke();
      
      // Agregar marcadores de tiempo
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.font = '12px monospace';
      ctx.fillText(`${i}s`, x, CANVAS_HEIGHT - 5);
    }

    // Dibujar líneas de grid horizontales
    for (let i = 0; i < 10; i++) {
      const y = (CANVAS_HEIGHT / 9) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(TOTAL_WIDTH, y);
      ctx.stroke();
    }

    // Calcular rango de valores
    const minVal = Math.min(...signalData.map(d => d.value));
    const maxVal = Math.max(...signalData.map(d => d.value));
    const range = maxVal - minVal || 1;

    // Dibujar señal completa
    ctx.beginPath();
    ctx.strokeStyle = '#00ff00';
    ctx.lineWidth = 2;

    signalData.forEach((point, index) => {
      const x = (TOTAL_WIDTH * point.time) / MAX_TIME;
      const normalizedY = (point.value - minVal) / range;
      const y = normalizedY * CANVAS_HEIGHT * 0.8 + CANVAS_HEIGHT * 0.1;
      
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.stroke();

    // Dibujar picos detectados y posibles arritmias
    let lastPeakTime = 0;
    const averageInterval = signalData
      .filter(p => p.isPeak)
      .map((p, i, arr) => i > 0 ? p.time - arr[i-1].time : 0)
      .filter(t => t > 0)
      .reduce((a, b) => a + b, 0) / (signalData.filter(p => p.isPeak).length - 1);

    signalData.forEach((point, index) => {
      if (point.isPeak) {
        const x = (TOTAL_WIDTH * point.time) / MAX_TIME;
        const normalizedY = (point.value - minVal) / range;
        const y = normalizedY * CANVAS_HEIGHT * 0.8 + CANVAS_HEIGHT * 0.1;
        
        // Verificar si este pico podría ser una arritmia
        const interval = point.time - lastPeakTime;
        const isArrhythmia = lastPeakTime > 0 && 
          (interval < averageInterval * 0.7 || interval > averageInterval * 1.3);
        
        // Dibujar círculo para el pico
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, 2 * Math.PI);
        ctx.fillStyle = isArrhythmia ? '#ff0000' : '#ffff00';
        ctx.fill();
        
        // Si es arritmia, agregar indicador visual
        if (isArrhythmia) {
          ctx.fillStyle = 'rgba(255, 0, 0, 0.2)';
          ctx.fillRect(x - 40, 0, 80, CANVAS_HEIGHT);
          
          // Texto "ARRITMIA"
          ctx.save();
          ctx.translate(x, 30);
          ctx.rotate(-Math.PI / 2);
          ctx.fillStyle = '#ff0000';
          ctx.font = 'bold 14px sans-serif';
          ctx.fillText('ARRITMIA', 0, 0);
          ctx.restore();
        }
        
        lastPeakTime = point.time;
      }
    });

  }, [isOpen, signalData, scrollPosition]);

  const handleScroll = () => {
    if (containerRef.current) {
      setScrollPosition(containerRef.current.scrollLeft);
    }
  };

  const scrollTo = (direction: 'left' | 'right') => {
    if (containerRef.current) {
      const newPosition = scrollPosition + (direction === 'left' ? -200 : 200);
      containerRef.current.scrollTo({
        left: newPosition,
        behavior: 'smooth'
      });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-screen-lg w-[95vw] h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Heart className="h-5 w-5" color={arrhythmiaCount > 0 ? 'red' : 'green'} />
              Resultados PPG (30 segundos)
            </div>
            {arrhythmiaCount > 0 ? (
              <span className="text-red-500 text-sm">
                {arrhythmiaCount} arritmia{arrhythmiaCount !== 1 ? 's' : ''} detectada{arrhythmiaCount !== 1 ? 's' : ''}
              </span>
            ) : (
              <span className="text-green-500 text-sm">Sin arritmias detectadas</span>
            )}
          </DialogTitle>
        </DialogHeader>
        
        <div className="flex items-center gap-2 px-4">
          <Button
            variant="outline"
            size="icon"
            onClick={() => scrollTo('left')}
          >
            <ArrowLeftCircle className="h-4 w-4" />
          </Button>
          
          <div 
            ref={containerRef}
            className="flex-1 overflow-x-auto relative bg-black/60 rounded-lg"
            onScroll={handleScroll}
          >
            <canvas
              ref={canvasRef}
              width={TOTAL_WIDTH}
              height={CANVAS_HEIGHT}
              className="h-[400px]"
            />
          </div>
          
          <Button
            variant="outline"
            size="icon"
            onClick={() => scrollTo('right')}
          >
            <ArrowRightCircle className="h-4 w-4" />
          </Button>
        </div>
        
        <div className="px-4 py-2 text-sm text-muted-foreground">
          Desliza horizontalmente para ver toda la señal. Los puntos amarillos indican latidos normales, 
          las zonas rojas marcan posibles arritmias.
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PPGResultDialog;
