
import React, { useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RotateCcw } from "lucide-react";

interface PPGResultDialogProps {
  isOpen: boolean;
  onClose: () => void;
  signalData: Array<{time: number, value: number, isPeak: boolean}>;
}

const PPGResultDialog = ({ isOpen, onClose, signalData }: PPGResultDialogProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current || !isOpen || signalData.length === 0) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Grid más preciso y profesional
    const drawGrid = () => {
      // Grid menor (1mm)
      ctx.strokeStyle = 'rgba(0, 127, 0, 0.2)';
      ctx.lineWidth = 0.5;
      for (let i = 0; i < canvas.width; i += 5) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, canvas.height);
        ctx.stroke();
      }
      for (let i = 0; i < canvas.height; i += 5) {
        ctx.beginPath();
        ctx.moveTo(0, i);
        ctx.lineTo(canvas.width, i);
        ctx.stroke();
      }

      // Grid mayor (5mm)
      ctx.strokeStyle = 'rgba(0, 127, 0, 0.5)';
      ctx.lineWidth = 1;
      for (let i = 0; i < canvas.width; i += 25) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, canvas.height);
        ctx.stroke();
      }
      for (let i = 0; i < canvas.height; i += 25) {
        ctx.beginPath();
        ctx.moveTo(0, i);
        ctx.lineTo(canvas.width, i);
        ctx.stroke();
      }
    };

    drawGrid();

    // Dibujar señal con mejor calidad
    const minVal = Math.min(...signalData.map(d => d.value));
    const maxVal = Math.max(...signalData.map(d => d.value));
    const range = maxVal - minVal || 1;

    // Suavizar la señal
    ctx.beginPath();
    ctx.strokeStyle = '#00ff00';
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    signalData.forEach((point, index) => {
      const x = (canvas.width * index) / signalData.length;
      const y = canvas.height - ((point.value - minVal) / range * canvas.height * 0.8 + canvas.height * 0.1);
      
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }

      if (point.isPeak) {
        ctx.save();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    });
    ctx.stroke();

  }, [isOpen, signalData]);

  if (!isOpen) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-black/90 p-4 border-t border-green-800 transition-all duration-300 ease-in-out">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-green-400">
          <RotateCcw className="h-4 w-4" />
          <span className="text-sm font-medium">Review Mode (30s)</span>
        </div>
        <button 
          onClick={onClose}
          className="text-green-400 hover:text-green-300 text-sm"
        >
          Close
        </button>
      </div>
      <canvas
        ref={canvasRef}
        width={800}
        height={200}
        className="w-full h-[150px] object-contain"
      />
    </div>
  );
};

export default PPGResultDialog;
