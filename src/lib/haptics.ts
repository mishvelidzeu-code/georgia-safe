import * as Haptics from 'expo-haptics';

// One place for every vibration in the app, so the same kind of action always
// feels the same. Each call is fire-and-forget and swallows its error: haptics
// are unavailable on some Android devices and in the simulator, and a missing
// buzz must never break the action it was decorating.
//
// Used sparingly on purpose. Buzzing on every tap trains people to ignore it,
// which matters here — the one vibration that has to land is the SOS button.

/** Light tick — opening a sheet, tapping a pin, picking an option. */
export function tapFeedback(): void {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

/** Firmer tick — a deliberate mode change, like picking up a draggable button. */
export function selectFeedback(): void {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
}

/** Heavy — the SOS button. Confirms through a pocket, in the dark, in a panic. */
export function alertFeedback(): void {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
}

/** Something completed: review sent, car saved, submission approved. */
export function successFeedback(): void {
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}

/** Something failed or was rejected — paired with the on-screen message. */
export function errorFeedback(): void {
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
}
