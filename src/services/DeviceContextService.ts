
/**
 * Service for device context information like battery status, ambient light, etc.
 */
class DeviceContextService {
  private _isBatterySavingMode: boolean = false;
  private _ambientLight: 'low' | 'medium' | 'high' = 'medium';
  private _batteryLevel: number = 100;
  private _isCharging: boolean = false;

  constructor() {
    this.initBatteryMonitoring();
    this.initAmbientLightDetection();
  }

  private initBatteryMonitoring() {
    try {
      if ('getBattery' in navigator) {
        // Use the modern Battery API
        (navigator as any).getBattery?.().then((battery: any) => {
          if (battery) {
            this._batteryLevel = battery.level * 100;
            this._isCharging = battery.charging;
            this._isBatterySavingMode = battery.level < 0.2 && !battery.charging;
            
            // Set up event listeners
            battery.addEventListener('levelchange', () => {
              this._batteryLevel = battery.level * 100;
              this._isBatterySavingMode = battery.level < 0.2 && !battery.charging;
            });
            
            battery.addEventListener('chargingchange', () => {
              this._isCharging = battery.charging;
              this._isBatterySavingMode = battery.level < 0.2 && !battery.charging;
            });
          }
        }).catch((err: any) => {
          console.warn('Battery API error:', err);
        });
      }
      
      // Check if device has power saving mode enabled (only works on some platforms)
      if ('powerSaveMode' in navigator) {
        this._isBatterySavingMode = (navigator as any).powerSaveMode;
      }
    } catch (error) {
      console.warn('Battery monitoring initialization error:', error);
    }
  }

  private initAmbientLightDetection() {
    try {
      // Try to use the AmbientLightSensor API if available
      if (typeof window !== 'undefined' && 'AmbientLightSensor' in window) {
        try {
          const sensor = new (window as any).AmbientLightSensor();
          sensor.addEventListener('reading', () => {
            const lux = sensor.illuminance;
            if (lux < 50) {
              this._ambientLight = 'low';
            } else if (lux < 1000) {
              this._ambientLight = 'medium';
            } else {
              this._ambientLight = 'high';
            }
          });
          sensor.start();
        } catch (error) {
          console.warn('AmbientLightSensor error:', error);
          this._ambientLight = 'medium'; // Default to medium
        }
      } else {
        // Fallback: use time of day as a simple heuristic for ambient light
        const hour = new Date().getHours();
        if (hour < 6 || hour > 20) {
          this._ambientLight = 'low';
        } else if (hour < 8 || hour > 18) {
          this._ambientLight = 'medium';
        } else {
          this._ambientLight = 'high';
        }
      }
    } catch (error) {
      console.warn('Ambient light detection initialization error:', error);
      this._ambientLight = 'medium'; // Default to medium
    }
  }
  
  // Public getters
  get isBatterySavingMode(): boolean {
    return this._isBatterySavingMode;
  }
  
  get ambientLight(): 'low' | 'medium' | 'high' {
    return this._ambientLight;
  }
  
  get batteryLevel(): number {
    return this._batteryLevel;
  }
  
  get isCharging(): boolean {
    return this._isCharging;
  }
}

// Create a singleton instance
const deviceContextService = new DeviceContextService();
export default deviceContextService;
