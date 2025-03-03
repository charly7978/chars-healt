
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

interface GlucoseInputProps {
  onAddReading: (value: number) => boolean;
}

const GlucoseInput: React.FC<GlucoseInputProps> = ({ onAddReading }) => {
  const [glucoseValue, setGlucoseValue] = useState<string>('');

  const handleAddReading = () => {
    const numValue = parseInt(glucoseValue);
    if (isNaN(numValue) || numValue <= 0 || numValue > 600) {
      toast.error("El valor de glucosa debe estar entre 1 y 600 mg/dL");
      return;
    }
    
    if (onAddReading(numValue)) {
      toast.success(`Lectura de glucosa (${numValue} mg/dL) registrada correctamente`);
      setGlucoseValue('');
    } else {
      toast.error("Error al registrar lectura de glucosa");
    }
  };

  return (
    <div className="flex flex-col space-y-2 p-3 bg-black/30 backdrop-blur-sm rounded-lg">
      <h3 className="text-sm font-medium text-white">Ingresar lectura de glucómetro</h3>
      <div className="flex space-x-2">
        <Input
          type="number"
          placeholder="mg/dL"
          value={glucoseValue}
          onChange={(e) => setGlucoseValue(e.target.value)}
          className="bg-black/50 text-white border-gray-700"
          min="40"
          max="600"
        />
        <Button 
          onClick={handleAddReading}
          className="bg-green-600 hover:bg-green-700 text-white"
        >
          Añadir
        </Button>
      </div>
    </div>
  );
};

export default GlucoseInput;
