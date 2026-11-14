export function micConstraints(s) {
  const audio = {
    noiseSuppression: !!s.noiseSuppression,
    echoCancellation: !!s.echoCancellation,
    autoGainControl: !!s.autoGain,
    channelCount: 1,
  };
  if (s.micId) audio.deviceId = { exact: s.micId };
  return { audio, video: false };
}

export async function getMic(settings) {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('Microphone access is not available here');
  try {
    return await navigator.mediaDevices.getUserMedia(micConstraints(settings));
  } catch (e) {
    if (e.name === 'OverconstrainedError' || e.name === 'NotFoundError') {
      // saved device is gone: fall back to the system default
      try { return await navigator.mediaDevices.getUserMedia(micConstraints({ ...settings, micId: '' })); }
      catch (e2) { throw friendlyMicError(e2); }
    }
    throw friendlyMicError(e);
  }
}

function friendlyMicError(e) {
  if (e.name === 'NotAllowedError' || e.name === 'SecurityError') {
    return new Error('Microphone permission was denied. Allow it in system settings and try again.');
  }
  if (e.name === 'NotFoundError') return new Error('No microphone found');
  return new Error(e.message || 'Could not open the microphone');
}

/** Ask once for permission so device labels become visible, then release the mic. */
export async function unlockDeviceLabels() {
  const s = await getMic({ micId: '', noiseSuppression: false, echoCancellation: false, autoGain: false });
  s.getTracks().forEach((t) => t.stop());
}

export async function listDevices() {
  if (!navigator.mediaDevices?.enumerateDevices) return { mics: [], speakers: [] };
  const all = await navigator.mediaDevices.enumerateDevices();
  return {
    mics: all.filter((d) => d.kind === 'audioinput'),
    speakers: all.filter((d) => d.kind === 'audiooutput'),
  };
}

export const canSelectSpeaker = () =>
  typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype;
