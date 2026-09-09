import AsyncStorage from '@react-native-async-storage/async-storage';

const PERM_PRIMED_KEY = 'perm_primed_v1';

// In-memory cache so navigation gating can read the value synchronously
// and avoid redirect loops after the priming screen completes.
let permPrimed = false;

export async function loadPermPrimed(): Promise<boolean> {
  try {
    const v = await AsyncStorage.getItem(PERM_PRIMED_KEY);
    permPrimed = v === '1';
  } catch {
    permPrimed = false;
  }
  return permPrimed;
}

export function getPermPrimed(): boolean {
  return permPrimed;
}

export async function markPermPrimed(): Promise<void> {
  permPrimed = true;
  try {
    await AsyncStorage.setItem(PERM_PRIMED_KEY, '1');
  } catch {
    // ignore persistence errors; in-memory flag still prevents re-prompt this session
  }
}
