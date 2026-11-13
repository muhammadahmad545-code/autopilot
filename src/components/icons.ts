import { BatteryMedium, BellRing, Clock, Flashlight, Headphones, LockOpen, MoonStar, PlugZap, RotateCw, Smartphone, Sun, Volume2, Vibrate, Wifi } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import type { ActionType, TriggerType } from '../lib/types';

export const TRIGGER_ICONS: Record<TriggerType, LucideIcon> = {
  time: Clock,
  prayer: MoonStar,
  charging: PlugZap,
  battery: BatteryMedium,
  headphones: Headphones,
  wifi: Wifi,
  unlock: LockOpen,
};

export const ACTION_ICONS: Record<ActionType, LucideIcon> = {
  ringer: Vibrate,
  dnd: MoonStar,
  mediaVolume: Volume2,
  ringVolume: BellRing,
  brightness: Sun,
  flashlight: Flashlight,
  notify: BellRing,
  vibrate: Smartphone,
  autoRotate: RotateCw,
};
