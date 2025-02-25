import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { Button } from "../components/ui/button";
import { Label } from "../components/ui/label";
import { Input } from "../components/ui/input";

interface CalibrationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const CalibrationDialog: React.FC<CalibrationDialogProps> = ({
  open,
  onOpenChange
}) => {
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    console.log('Form submitted');
    onOpenChange(false);
  };

  const handleCalibrationChange = (e: React.FormEvent<HTMLInputElement>) => {
    console.log('Calibration value changed', e.currentTarget.value);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Calibration Settings</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="minRed" className="text-right">
                Min Red:
              </Label>
              <Input type="number" id="minRed" defaultValue="80" className="col-span-3" onChange={handleCalibrationChange} />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="maxRed" className="text-right">
                Max Red:
              </Label>
              <Input type="number" id="maxRed" defaultValue="245" className="col-span-3" onChange={handleCalibrationChange} />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="stabilityWindow" className="text-right">
                Stability Window:
              </Label>
              <Input type="number" id="stabilityWindow" defaultValue="5" className="col-span-3" onChange={handleCalibrationChange} />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="minStabilityCount" className="text-right">
                Min Stability Count:
              </Label>
              <Input type="number" id="minStabilityCount" defaultValue="3" className="col-span-3" onChange={handleCalibrationChange} />
            </div>
          </div>
          <Button type="submit">Save changes</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default CalibrationDialog;
