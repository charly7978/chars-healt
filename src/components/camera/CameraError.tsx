
import React from 'react';

interface CameraErrorProps {
  error: string | null;
}

const CameraError: React.FC<CameraErrorProps> = ({ error }) => {
  if (!error) return null;
  
  return (
    <div className="absolute top-0 left-0 z-50 bg-red-500/80 text-white p-2 text-sm font-medium rounded m-2">
      {error}
    </div>
  );
};

export default CameraError;
