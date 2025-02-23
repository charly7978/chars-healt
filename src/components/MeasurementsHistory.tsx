
import React from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

interface Measurement {
  id: string;
  heart_rate: number;
  spo2: number;
  systolic: number;
  diastolic: number;
  arrhythmia_count: number;
  quality: number;
  measured_at: string;
}

interface MeasurementsHistoryProps {
  isOpen: boolean;
  onClose: () => void;
  measurements: Measurement[];
}

const MeasurementsHistory = ({ isOpen, onClose, measurements }: MeasurementsHistoryProps) => {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Historial de Mediciones</DialogTitle>
        </DialogHeader>
        <ScrollArea className="h-[60vh] w-full pr-4">
          <div className="space-y-4">
            {measurements.map((measurement) => (
              <div
                key={measurement.id}
                className="bg-gray-800/20 backdrop-blur-md rounded-lg p-4"
              >
                <div className="flex justify-between items-start mb-2">
                  <span className="text-sm text-gray-400">
                    {format(new Date(measurement.measured_at), "d 'de' MMMM, yyyy HH:mm", { locale: es })}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    measurement.quality > 75 ? 'bg-green-500/20 text-green-300' :
                    measurement.quality > 50 ? 'bg-yellow-500/20 text-yellow-300' :
                    'bg-red-500/20 text-red-300'
                  }`}>
                    Calidad: {measurement.quality}%
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-400">Presión Arterial</p>
                    <p className="text-lg font-semibold">{measurement.systolic}/{measurement.diastolic} mmHg</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-400">Ritmo Cardíaco</p>
                    <p className="text-lg font-semibold">{measurement.heart_rate} BPM</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-400">SpO2</p>
                    <p className="text-lg font-semibold">{measurement.spo2}%</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-400">Arritmias</p>
                    <p className="text-lg font-semibold">{measurement.arrhythmia_count}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};

export default MeasurementsHistory;
