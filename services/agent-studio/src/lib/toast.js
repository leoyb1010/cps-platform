// Existing one-argument notifications stay successful; callers explicitly mark
// failures. Never infer status from translated text.
export function createToast(message, variant = 'success') {
  return { message: String(message), variant: variant === 'error' ? 'error' : 'success' };
}
export function expireToast(current, notification) {
  return current === notification ? null : current;
}
