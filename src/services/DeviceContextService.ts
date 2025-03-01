// Service to detect device context (ambient light, device state, etc.)

// Interface for device context
export interface DeviceContext {
  ambientLight: 'low' | 'medium' | 'high' | 'unknown';
  batteryLevel: number;
  batterySaving: boolean;
  deviceIdle: boolean;
  lastActivity: number; // timestamp
  isBackgrounded: boolean;
}

class DeviceContextService {
  private context: DeviceContext = {
    ambientLight: 'unknown',
    batteryLevel: 100,
    batterySaving: false,
    deviceIdle: false,
    lastActivity: Date.now(),
    isBackgrounded: false
  };
  
  private ambientLightReadings: number[] = [];
  private batteryAPI: any = null;
  private visibilityChangeHandler: () => void;
  private idleTimeout: number | null = null;
  private readonly IDLE_THRESHOLD_MS = 30000; // 30 seconds
  
  constructor() {
    // Initialize visibility change detection
    this.visibilityChangeHandler = this.handleVisibilityChange.bind(this);
    document.addEventListener('visibilitychange', this.visibilityChangeHandler);
    
    // Initialize user activity detection
    document.addEventListener('touchstart', this.resetIdleTimer.bind(this), { passive: true });
    document.addEventListener('click', this.resetIdleTimer.bind(this), { passive: true });
    
    // Try to initialize battery detection
    this.initBatteryAPI();
    
    // Start idle detection
    this.resetIdleTimer();
    
    console.log("DeviceContextService: Service initialized");
  }
  
  private async initBatteryAPI() {
    try {
      if ('getBattery' in navigator) {
        this.batteryAPI = await (navigator as any).getBattery();
        
        if (this.batteryAPI) {
          // Update initial values
          this.context.batteryLevel = this.batteryAPI.level * 100;
          this.context.batterySaving = this.batteryAPI.charging ? false : (this.batteryLevel < 20);
          
          // Set up event listeners
          this.batteryAPI.addEventListener('levelchange', () => {
            this.context.batteryLevel = this.batteryAPI.level * 100;
            this.context.batterySaving = this.batteryAPI.charging ? false : (this.batteryLevel < 20);
            console.log(`DeviceContextService: Battery level changed to ${this.context.batteryLevel}%`);
          });
        }
      }
    } catch (error) {
      console.error("DeviceContextService: Error initializing Battery API", error);
    }
  }
  
  public get batteryLevel(): number {
    return this.context.batteryLevel;
  }
  
  public get isBatterySavingMode(): boolean {
    return this.context.batterySaving;
  }
  
  public get isDeviceIdle(): boolean {
    return this.context.deviceIdle;
  }
  
  public get isBackgrounded(): boolean {
    return this.context.isBackgrounded;
  }
  
  public get ambientLight(): string {
    return this.context.ambientLight;
  }
  
  // Process ambient light data from camera frames
  public processAmbientLight(imageData: ImageData): void {
    // Simple algorithm to estimate ambient light from image data
    const data = imageData.data;
    const pixelCount = data.length / 4;
    let totalBrightness = 0;
    
    // Sample every 20th pixel for performance
    for (let i = 0; i < data.length; i += 80) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      
      // Calculate perceived brightness using relative luminance formula
      const brightness = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      totalBrightness += brightness;
    }
    
    const averageBrightness = totalBrightness / (pixelCount / 20);
    
    // Add to readings array and keep only last 5 readings
    this.ambientLightReadings.push(averageBrightness);
    if (this.ambientLightReadings.length > 5) {
      this.ambientLightReadings.shift();
    }
    
    // Calculate average from recent readings
    const avgRecentBrightness = this.ambientLightReadings.reduce((a, b) => a + b, 0) / 
                              this.ambientLightReadings.length;
    
    // Classify ambient light
    if (avgRecentBrightness < 40) {
      this.context.ambientLight = 'low';
    } else if (avgRecentBrightness < 120) {
      this.context.ambientLight = 'medium';
    } else {
      this.context.ambientLight = 'high';
    }
  }
  
  private handleVisibilityChange(): void {
    if (document.hidden) {
      this.context.isBackgrounded = true;
      console.log("DeviceContextService: App moved to background");
    } else {
      this.context.isBackgrounded = false;
      console.log("DeviceContextService: App moved to foreground");
      this.resetIdleTimer();
    }
  }
  
  private resetIdleTimer(): void {
    this.context.deviceIdle = false;
    this.context.lastActivity = Date.now();
    
    if (this.idleTimeout !== null) {
      window.clearTimeout(this.idleTimeout);
    }
    
    this.idleTimeout = window.setTimeout(() => {
      this.context.deviceIdle = true;
      console.log("DeviceContextService: Device is now idle");
    }, this.IDLE_THRESHOLD_MS);
  }
  
  public cleanUp(): void {
    document.removeEventListener('visibilitychange', this.visibilityChangeHandler);
    document.removeEventListener('touchstart', this.resetIdleTimer);
    document.removeEventListener('click', this.resetIdleTimer);
    
    if (this.idleTimeout !== null) {
      window.clearTimeout(this.idleTimeout);
      this.idleTimeout = null;
    }
    
    // Clear any held references
    this.ambientLightReadings = [];
    this.batteryAPI = null;
    
    console.log("DeviceContextService: Service cleaned up");
  }
}

// Create a singleton instance
const deviceContextService = new DeviceContextService();
export default deviceContextService;
