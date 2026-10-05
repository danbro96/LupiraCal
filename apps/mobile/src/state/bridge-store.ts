import { PermissionsAndroid } from 'react-native';
import { create } from 'zustand';
import type { BridgeState } from '../../modules/lupira-bridge/src';
import { LupiraBridge } from '../../modules/lupira-bridge/src';
import { logDebug } from '@danbro96/lupira-expo-diagnostics/log';
import { BRIDGE_ENABLED_KEY } from '../sync/bridge';
import { readMeta, writeMeta } from '../sync/meta';

/** The Android-integration preference and its lifecycle. Flags persist in the sync kernel's meta table (the sync
 *  layer must read `bridge.enabled` and can't import state/). Everything here is idempotent — enable() doubles
 *  as repair. */

const PROMPTED_KEY = 'bridge.prompted';

const RUNTIME_PERMISSIONS = [
  PermissionsAndroid.PERMISSIONS.READ_CALENDAR,
  PermissionsAndroid.PERMISSIONS.WRITE_CALENDAR,
  PermissionsAndroid.PERMISSIONS.READ_CONTACTS,
  PermissionsAndroid.PERMISSIONS.WRITE_CONTACTS,
];

type BridgePref = {
  loaded: boolean;
  enabled: boolean;
  prompted: boolean;
  permissionsOk: boolean;
  status: BridgeState | null;
};

type BridgeActions = {
  /** Hydrate flags + status; when enabled, re-assert permissions and the account (self-repair). */
  init(): Promise<void>;
  refreshStatus(): Promise<void>;
  /** Request permissions → ensure account → first publish. Returns false when permissions were denied. */
  enable(): Promise<boolean>;
  /** Removes the Android account — the OS purges the published calendar + contacts. */
  disable(): Promise<void>;
  markPrompted(): Promise<void>;
};

export const useBridge = create<BridgePref & BridgeActions>((set, get) => ({
  loaded: false,
  enabled: false,
  prompted: false,
  permissionsOk: true,
  status: null,

  init: async () => {
    try {
      const enabled = (await readMeta(BRIDGE_ENABLED_KEY)) === '1';
      const prompted = (await readMeta(PROMPTED_KEY)) === '1';
      set({ enabled, prompted, loaded: true });
      if (enabled) {
        const granted = await checkPermissions();
        set({ permissionsOk: granted });
        if (granted) {
          try {
            await LupiraBridge.ensureAccount();
          } catch (e) {
            logDebug('bridge', `account repair failed: ${String(e)}`);
          }
        }
      }
      await get().refreshStatus();
    } catch (e) {
      logDebug('bridge', `init failed: ${String(e)}`);
      set({ loaded: true });   // never leave the store un-hydrated — the prompt logic keys off it
    }
  },

  refreshStatus: async () => {
    try {
      set({ status: await LupiraBridge.getBridgeState() });
    } catch {
      set({ status: null });
    }
  },

  enable: async () => {
    const result = await PermissionsAndroid.requestMultiple(RUNTIME_PERMISSIONS);
    const granted = Object.values(result).every((v) => v === PermissionsAndroid.RESULTS.GRANTED);
    if (!granted) {
      set({ permissionsOk: false });
      await get().markPrompted();
      return false;
    }
    await LupiraBridge.ensureAccount();
    await LupiraBridge.bridgeSyncNow();   // first publish — stock apps populate immediately
    await persistFlag(BRIDGE_ENABLED_KEY, true);
    set({ enabled: true, permissionsOk: true, prompted: true });
    await persistFlag(PROMPTED_KEY, true);
    await get().refreshStatus();
    logDebug('bridge', 'integration enabled');
    return true;
  },

  disable: async () => {
    try {
      await LupiraBridge.removeAccount();
    } catch (e) {
      logDebug('bridge', `removeAccount failed: ${String(e)}`);
    }
    await persistFlag(BRIDGE_ENABLED_KEY, false);
    set({ enabled: false });
    await get().refreshStatus();
    logDebug('bridge', 'integration disabled — account removed');
  },

  markPrompted: async () => {
    await persistFlag(PROMPTED_KEY, true);
    set({ prompted: true });
  },
}));

async function persistFlag(key: string, value: boolean): Promise<void> {
  await writeMeta(key, value ? '1' : '0');
}

async function checkPermissions(): Promise<boolean> {
  for (const p of RUNTIME_PERMISSIONS) {
    if (!(await PermissionsAndroid.check(p))) return false;
  }
  return true;
}
