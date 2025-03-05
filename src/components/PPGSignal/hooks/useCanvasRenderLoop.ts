
import { useEffect, useRef } from 'react';
import { SIGNAL_PROCESSING } from '../constants/CanvasConstants';

/**
 * Hook to handle the animation frame loop for canvas rendering
 * with performance optimizations
 */
export const useCanvasRenderLoop = (renderCallback: () => void) => {
  const animationFrameRef = useRef<number>();
  const lastRenderTimeRef = useRef<number>(0);
  
  useEffect(() => {
    const renderLoop = () => {
      const currentTime = performance.now();
      const timeSinceLastRender = currentTime - lastRenderTimeRef.current;

      if (timeSinceLastRender >= SIGNAL_PROCESSING.FRAME_TIME) {
        renderCallback();
        lastRenderTimeRef.current = currentTime;
      }

      animationFrameRef.current = requestAnimationFrame(renderLoop);
    };

    // Start the render loop
    animationFrameRef.current = requestAnimationFrame(renderLoop);

    // Clean up animation frame on unmount
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [renderCallback]);

  return null;
};
