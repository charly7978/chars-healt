import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { ImmersiveMode } from './utils/immersiveMode';

// Inicializar el modo inmersivo
const initializeApp = async () => {
  try {
    // Renderizar la aplicación primero para mejorar la percepción de velocidad
    createRoot(document.getElementById("root")!).render(<App />);
    
    // Inicializar el modo inmersivo con nuestra utilidad
    await ImmersiveMode.initialize();
    
    // Función simplificada para activar inmediatamente el modo inmersivo
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
        if (elem.requestFullscreen) {
          try {
            await elem.requestFullscreen();
          } catch (e) {
            console.warn('Fullscreen attempt failed:', e);
          }
        }
      } catch (error) {
        console.error('Immersive mode activation error:', error);
      }
    };

    // Activar modo inmersivo al cargar
    activateImmersiveMode();

    // También intentar activarlo en el primer evento de interacción
    document.addEventListener('click', activateImmersiveMode, { once: true });
    document.addEventListener('touchstart', activateImmersiveMode, { once: true });
  } catch (error) {
    console.error('Error initializing app:', error);
  }
};

// Iniciar la aplicación
initializeApp();
