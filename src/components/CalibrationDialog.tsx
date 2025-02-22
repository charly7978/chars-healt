
import * as React from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Activity } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface CalibrationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCalibrationStart: () => void;
  onCalibrationEnd: () => void;
}

const CalibrationDialog: React.FC<CalibrationDialogProps> = ({ 
  isOpen, 
  onClose,
  onCalibrationStart,
  onCalibrationEnd
}) => {
  const [progress, setProgress] = React.useState(0);
  const [status, setStatus] = React.useState<string>("");
  const [isCalibrating, setIsCalibrating] = React.useState(false);

  const startCalibration = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        return;
      }

      setIsCalibrating(true);
      onCalibrationStart();
      setProgress(0);
      setStatus("Iniciando calibración...");

      await supabase
        .from('calibration_settings')
        .upsert({
          user_id: session.user.id,
          status: 'in_progress',
          last_calibration_date: new Date().toISOString()
        });

      const calibrationSteps = [
        { name: "Ajustando sensores...", duration: 3000 },
        { name: "Calibrando intensidad de luz...", duration: 3000 },
        { name: "Optimizando detección de pulso...", duration: 4000 },
        { name: "Ajustando filtros de señal...", duration: 3000 },
        { name: "Configurando parámetros finales...", duration: 2000 }
      ];

      for (const [index, step] of calibrationSteps.entries()) {
        setStatus(step.name);
        setProgress((index * 100) / calibrationSteps.length);
        await new Promise(resolve => setTimeout(resolve, step.duration));
      }

      await supabase
        .from('calibration_settings')
        .update({
          status: 'completed',
          is_active: true,
          stability_threshold: 5.0,
          quality_threshold: 0.8,
          perfusion_index: 0.06
        })
        .eq('user_id', session.user.id);

      setProgress(100);

      setTimeout(() => {
        setIsCalibrating(false);
        onCalibrationEnd();
        onClose();
      }, 1000);

    } catch (error) {
      console.error("Error durante la calibración:", error);
      setIsCalibrating(false);
      onCalibrationEnd();
    }
  };

  React.useEffect(() => {
    if (isOpen) {
      startCalibration();
    }
  }, [isOpen]);

  return (
    <Dialog open={isOpen} onOpenChange={() => onClose()}>
      <DialogContent className="sm:max-w-md">
        <div className="flex items-center justify-between mb-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h2 className="text-lg font-semibold">Calibración del Sistema</h2>
          <div className="w-9" />
        </div>

        <div className="space-y-6">
          <div className="flex justify-center">
            <Activity className={`h-12 w-12 ${isCalibrating ? 'animate-pulse text-blue-500' : 'text-gray-400'}`} />
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>{status}</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <div className="h-2 bg-gray-200 rounded-full">
              <div 
                className="h-full bg-blue-500 rounded-full transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          <p className="text-sm text-gray-500 text-center">
            {isCalibrating 
              ? "Por favor, espere mientras se completa la calibración..."
              : "Calibración completada"
            }
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CalibrationDialog;
