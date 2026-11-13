import { useCallback, useEffect, useState } from 'react';
import { AppState, PermissionsAndroid, Platform } from 'react-native';
import type { PermissionState } from '../../modules/autopilot-engine';
import { Engine, readPermissions } from './engine';

export type FullPermissions = PermissionState & { location: boolean };

async function hasLocation(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  const fine = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
  if (!fine) return false;
  if (Number(Platform.Version) < 29) return true;
  return PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACCESS_BACKGROUND_LOCATION);
}

/** Wi-Fi names are location data on Android, so matching a network by name needs location access. */
export async function requestLocation(): Promise<boolean> {
  const fine = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION, {
    title: 'Allow reading Wi-Fi names',
    message: 'Android treats Wi-Fi network names as location data. Autopilot only reads the name of the network you are on, on this phone.',
    buttonPositive: 'Continue',
  });
  if (fine !== PermissionsAndroid.RESULTS.GRANTED) return false;
  if (Number(Platform.Version) < 29) return true;
  const background = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_BACKGROUND_LOCATION);
  return background === PermissionsAndroid.RESULTS.GRANTED;
}

export async function requestNotifications(): Promise<boolean> {
  if (Platform.OS !== 'android' || Number(Platform.Version) < 33) return true;
  const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
  return result === PermissionsAndroid.RESULTS.GRANTED;
}

/** Live view of every permission Autopilot can use, refreshed when the user returns from Settings. */
export function usePermissions(): [FullPermissions | null, () => void] {
  const [state, setState] = useState<FullPermissions | null>(null);
  const reload = useCallback(() => {
    const base = readPermissions();
    if (!base) return;
    hasLocation()
      .then((location) => setState({ ...base, location }))
      .catch(() => setState({ ...base, location: false }));
  }, []);
  useEffect(() => {
    reload();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') {
        reload();
        try {
          Engine.refresh();
        } catch {
          // Engine unavailable; the status card will show it.
        }
      }
    });
    return () => sub.remove();
  }, [reload]);
  return [state, reload];
}
