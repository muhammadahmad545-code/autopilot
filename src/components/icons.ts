import BatteryMedium from 'lucide-react-native/icons/battery-medium';
import Leaf from 'lucide-react-native/icons/leaf';
import Speech from 'lucide-react-native/icons/speech';
import BellRing from 'lucide-react-native/icons/bell-ring';
import Clock from 'lucide-react-native/icons/clock';
import Flashlight from 'lucide-react-native/icons/flashlight';
import Headphones from 'lucide-react-native/icons/headphones';
import LockOpen from 'lucide-react-native/icons/lock-open';
import MoonStar from 'lucide-react-native/icons/moon-star';
import PlugZap from 'lucide-react-native/icons/plug-zap';
import RotateCw from 'lucide-react-native/icons/rotate-cw';
import Smartphone from 'lucide-react-native/icons/smartphone';
import Sun from 'lucide-react-native/icons/sun';
import Volume2 from 'lucide-react-native/icons/volume-2';
import Vibrate from 'lucide-react-native/icons/vibrate';
import Wifi from 'lucide-react-native/icons/wifi';
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
  powerSave: Leaf,
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
  speak: Speech,
};
