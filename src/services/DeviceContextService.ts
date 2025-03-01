/**
 * Servicio simplificado para proporcionar información sobre el contexto del dispositivo
 * Esta versión no depende de Capacitor y usa APIs web estándar
 */
class DeviceContextService {
  private _isBackgrounded: boolean = false;
  private _isBatterySavingMode: boolean = false;
  private _isDeviceIdle: boolean = false;
  private _ambientLight: 'low' | 'medium' | 'high' = 'medium';
  private userActivityTimestamp: number = Date.now();
  private activityCheckInterval: number | null = null;
  private batteryCheckInterval: number | null = null;
  
  constructor() {
    this.initService();
  }

  /**
   * Inicializa el servicio y configura listeners para eventos relevantes
   */
  private initService(): void {
    // Detectar cuando la app pasa a segundo plano
    document.addEventListener('visibilitychange', () => {
      this._isBackgrounded = document.visibilityState === 'hidden';
      console.log(`DeviceContextService: App ${this._isBackgrounded ? 'en segundo plano' : 'en primer plano'}`);
    });

    // Monitorear actividad del usuario
    const updateActivityTimestamp = () => {
      this.userActivityTimestamp = Date.now();
      this._isDeviceIdle = false;
    };

    // Eventos para detectar actividad
    ['click', 'touchstart', 'mousemove', 'keypress'].forEach(eventType => {
      window.addEventListener(eventType, updateActivityTimestamp, { passive: true });
    });

    // Verificar inactividad periódicamente
    this.activityCheckInterval = window.setInterval(() => {
      const idleThresholdMs = 60000; // 1 minuto
      this._isDeviceIdle = (Date.now() - this.userActivityTimestamp) > idleThresholdMs;
    }, 10000);

    // Verificar estado de batería si la API está disponible
    if ('getBattery' in navigator) {
      this.checkBatteryStatus();
      this.batteryCheckInterval = window.setInterval(() => {
        this.checkBatteryStatus();
      }, 60000); // Verificar cada minuto
    }

    console.log("DeviceContextService: Servicio inicializado");
  }

  /**
   * Verifica el estado de la batería usando la API Battery
   */
  private async checkBatteryStatus(): Promise<void> {
    try {
      // @ts-ignore - La API getBattery puede no estar definida en todos los navegadores
      const battery = await navigator.getBattery();
      
      // Considerar modo de ahorro de batería si está por debajo del 20% o está cargando lentamente
      this._isBatterySavingMode = battery.level < 0.2 || (battery.charging && battery.chargingTime > 3600);
      
      // Configurar listeners para cambios en el estado de la batería
      battery.addEventListener('levelchange', () => {
        this._isBatterySavingMode = battery.level < 0.2;
        console.log(`DeviceContextService: Nivel de batería cambiado a ${battery.level * 100}%`);
      });
      
      console.log(`DeviceContextService: Estado de batería - Nivel: ${battery.level * 100}%, Cargando: ${battery.charging}`);
    } catch (error) {
      console.error("DeviceContextService: Error al acceder al estado de la batería", error);
      this._isBatterySavingMode = false;
    }
  }

  /**
   * Procesa la luz ambiental basada en los datos de la imagen
   * @param imageData Datos de imagen de la cámara para estimar la luz ambiental
   */
  public processAmbientLight(imageData: ImageData): void {
    try {
      // Algoritmo simple para estimar la luz ambiental basado en el brillo promedio
      const data = imageData.data;
      let totalBrightness = 0;
      
      // Muestrear 1 de cada 50 píxeles para rendimiento
      for (let i = 0; i < data.length; i += 200) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        // Fórmula de brillo perceptual: 0.299R + 0.587G + 0.114B
        totalBrightness += 0.299 * r + 0.587 * g + 0.114 * b;
      }
      
      const avgBrightness = totalBrightness / (data.length / 200);
      
      // Clasificar la luz ambiental en categorías
      if (avgBrightness < 40) {
        this._ambientLight = 'low';
      } else if (avgBrightness < 120) {
        this._ambientLight = 'medium';
      } else {
        this._ambientLight = 'high';
      }
    } catch (error) {
      console.error("DeviceContextService: Error procesando luz ambiental", error);
      this._ambientLight = 'medium'; // Valor predeterminado en caso de error
    }
  }

  /**
   * Limpia los recursos del servicio
   */
  public cleanup(): void {
    if (this.activityCheckInterval !== null) {
      clearInterval(this.activityCheckInterval);
      this.activityCheckInterval = null;
    }
    
    if (this.batteryCheckInterval !== null) {
      clearInterval(this.batteryCheckInterval);
      this.batteryCheckInterval = null;
    }
    
    console.log("DeviceContextService: Recursos liberados");
  }

  // Getters públicos
  get isBackgrounded(): boolean {
    return this._isBackgrounded;
  }

  get isBatterySavingMode(): boolean {
    return this._isBatterySavingMode;
  }

  get isDeviceIdle(): boolean {
    return this._isDeviceIdle;
  }

  get ambientLight(): 'low' | 'medium' | 'high' {
    return this._ambientLight;
  }
}

// Exportar una única instancia del servicio
const deviceContextService = new DeviceContextService();
export default deviceContextService;
