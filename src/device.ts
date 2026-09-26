type Device = { userAgent?: string; platform?: string; maxTouchPoints?: number; deviceMemory?: number; userAgentData?: { mobile?: boolean } };

// Coarse device RAM is not free memory. Never probe by allocating large buffers.
export function modelBlockReason(device: Device): string | undefined {
  if (device.userAgentData?.mobile || /Android|iPhone|iPad|iPod|Mobile/i.test(device.userAgent || '')
      || (/Mac/i.test(device.platform || device.userAgent || '') && (device.maxTouchPoints || 0) > 1)) {
    return 'This experimental model is disabled on phones and tablets because loading it can crash the browser tab. Try a desktop computer; the example and source remain available.';
  }
  if (typeof device.deviceMemory === 'number' && Number.isFinite(device.deviceMemory) && device.deviceMemory > 0 && device.deviceMemory <= 4) {
    return 'This browser reports 4 GB RAM or less. Model loading is disabled to reduce the risk of a tab crash. Use a desktop with at least 8 GB RAM.';
  }
}
