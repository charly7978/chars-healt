import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";

interface PPGResultDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  spo2: number | null;
  heartRate: number | null;
}

const PPGResultDialog: React.FC<PPGResultDialogProps> = ({ open, onOpenChange, spo2, heartRate }) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>PPG Results</DialogTitle>
        </DialogHeader>
        {spo2 !== null && heartRate !== null ? (
          <>
            <p>SpO2: {spo2.toFixed(1)}%</p>
            <p>Heart Rate: {heartRate.toFixed(0)} bpm</p>
          </>
        ) : (
          <p>Processing...</p>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default PPGResultDialog;
