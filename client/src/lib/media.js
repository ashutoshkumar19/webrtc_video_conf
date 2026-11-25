export const getMedia = async (audio = true, video = true) => {
  return navigator.mediaDevices.getUserMedia({ audio, video });
};

export const setTrackEnabled = (stream, kind, enabled) => {
  if (!stream) return;
  stream.getTracks().forEach((track) => {
    if (track.kind === kind) {
      track.enabled = enabled;
    }
  });
};

export const stopStream = (stream) => {
  if (!stream) return;
  stream.getTracks().forEach((track) => track.stop());
};

export const isDeviceAccessDenied = (err) => {
  return err && err.name === 'NotAllowedError';
};
