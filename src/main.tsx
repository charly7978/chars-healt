
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// Función para activar inmediatamente el modo inmersivo al cargar la página
const activateImmersiveMode = async () => {
  try {
    // Fijar viewport para evitar zoom y scroll
    const viewport = document.querySelector('meta[name=viewport]');
    if (viewport) {
      viewport.setAttribute('content', 
        'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover'
      );
    }

    // Bloquear orientación a vertical
    if (screen.orientation?.lock) {
      try {
        await screen.orientation.lock('portrait');
      } catch (e) {
        console.warn('Orientation lock failed:', e);
      }
    }

    // Intentar entrar en pantalla completa inmediatamente
    const elem = document.documentElement;
    const methods = [
      elem.requestFullscreen?.bind(elem),
      elem.webkitRequestFullscreen?.bind(elem),
      elem.mozRequestFullScreen?.bind(elem),
      elem.msRequestFullscreen?.bind(elem)
    ];

    for (const method of methods) {
      if (method) {
        try {
          await method();
          break;
        } catch (e) {
          console.warn('Fullscreen attempt failed:', e);
          continue;
        }
      }
    }

    // Modo inmersivo para Android si está disponible
    if (navigator.userAgent.includes("Android")) {
      if ((window as any).AndroidFullScreen?.immersiveMode) {
        try {
          await (window as any).AndroidFullScreen.immersiveMode();
        } catch (e) {
          console.warn('Android immersive mode failed:', e);
        }
      }
    }
  } catch (error) {
    console.error('Immersive mode activation error:', error);
  }
};

// Activar modo inmersivo al cargar
activateImmersiveMode();

// También intentar activarlo en el primer evento de interacción para navegadores que requieren interacción
const activateOnFirstInteraction = () => {
  activateImmersiveMode();
  // Remover event listeners después del primer intento
  document.removeEventListener('click', activateOnFirstInteraction);
  document.removeEventListener('touchstart', activateOnFirstInteraction);
};

document.addEventListener('click', activateOnFirstInteraction, { once: true });
document.addEventListener('touchstart', activateOnFirstInteraction, { once: true });

// Intentar nuevamente después de un breve retraso (para algunos navegadores móviles)
setTimeout(activateImmersiveMode, 500);

createRoot(document.getElementById("root")!).render(<App />);
