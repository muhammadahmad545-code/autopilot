import { NativeModule, requireNativeModule } from 'expo';

export type PermissionKey = 'notifications' | 'doNotDisturb' | 'writeSettings' | 'exactAlarms' | 'batteryUnrestricted';
export type PermissionState = Record<PermissionKey, boolean>;

export interface ActionResult {
  action: string;
  error: string | null;
}

type Events = {
  onRun: (event: { entry: string }) => void;
};

declare class AutopilotEngineModule extends NativeModule<Events> {
  setRules(json: string): void;
  setPaused(paused: boolean): void;
  isPaused(): boolean;
  getLog(): string;
  clearLog(): void;
  runNow(ruleJson: string): ActionResult[];
  nextAlarm(): number | null;
  getPermissions(): PermissionState;
  openPermission(which: PermissionKey | 'app'): boolean;
  refresh(): void;
}

export default requireNativeModule<AutopilotEngineModule>('AutopilotEngine');
