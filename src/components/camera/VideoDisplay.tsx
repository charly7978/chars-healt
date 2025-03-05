
import React from 'react';

interface VideoDisplayProps {
  videoRef: React.RefObject<HTMLVideoElement>;
  isMonitoring: boolean;
  isAndroid: boolean;
}

const VideoDisplay: React.FC<VideoDisplayProps> = ({ videoRef, isMonitoring, isAndroid }) => {
  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted
      className={`absolute top-0 left-0 min-w-full min-h-full w-auto h-auto z-0 object-cover ${!isMonitoring ? 'hidden' : ''}`}
      style={{
        transform: 'translateZ(0)', // Hardware acceleration
        WebkitBackfaceVisibility: 'hidden',
        backfaceVisibility: 'hidden',
        willChange: isAndroid ? 'transform' : 'auto',
      }}
    />
  );
};

export default VideoDisplay;
