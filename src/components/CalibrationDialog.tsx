
import * as React from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Activity } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface CalibrationDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

const CalibrationDialog: React.FC<CalibrationDialogProps> = ({ isOpen, onClose }) => {
  const { toast } = useToast();
  const [progress, setProgress] = React.useState(0);
  const [status, setStatus] = React.useState<string>("");
  const [isCalibrating, setIsCalibrating] = React.useState(false);

  const startCalibration = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast({
          variant: "destructive",
          title: "Error",
          description: "Debe iniciar sesión para calibrar"
        });
        return;
      }

      setIsCalibrating(true);
      setProgress(0);
      setStatus("Iniciando calibración...");

      // Actualizar estado en BD
      await supabase
        .from('calibration_settings')
        .upsert({
          user_id: session.user.id,
          status: 'in_progress',
          last_calibration_date: new Date().toISOString()
        });

      // Simular proceso de calibración con progreso real
      const steps = [
        "Ajustando sensores...",
        "Calibrando intensidad...",
        "Optimizando detección...",
        "Configurando parámetros...",
        "Finalizando calibración..."
      ];

      for (const [index, step] of steps.entries()) {
        setStatus(step);
        setProgress((index + 1) * 20);
        await new Promise(resolve => setTimeout(resolve, 2000)); // Simular trabajo real
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

      toast({
        title: "Éxito",
        description: "Calibración completada correctamente"
      });

      setIsCalibrating(false);
      onClose();
    } catch (error) {
      console.error(error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Error durante la calibración"
      });
      setIsCalibrating(false);
    }
  };

  React.useEffect(() => {
    if (isOpen) {
      startCalibration();
    }
  }, [isOpen]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md bg-gray-900 text-white border-gray-800">
        <div className="flex items-center justify-between mb-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="text-gray-400 hover:text-white"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h2 className="text-lg font-semibold">Calibración del Sistema</h2>
          <div className="w-9" /> {/* Espaciador */}
        </div>

        <div className="space-y-6">
          <div className="flex justify-center">
            <Activity className={`h-12 w-12 ${isCalibrating ? 'animate-pulse text-blue-500' : 'text-gray-400'}`} />
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">{status}</span>
              <span className="text-blue-500">{progress}%</span>
            </div>
            <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
              <div 
                className="h-full bg-blue-500 transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          <p className="text-sm text-gray-400 text-center">
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
