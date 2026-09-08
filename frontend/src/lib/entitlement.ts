// Bridge so the non-React API client can read the current RevenueCat entitlement.
// Source of truth remains the RevenueCat SDK (client-side); this only mirrors it.
let _premium = false;

export function setPremium(v: boolean) {
  _premium = v;
}

export function isPremium(): boolean {
  return _premium;
}
