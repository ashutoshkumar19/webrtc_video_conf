let peerConnection = null;
let dataChannel = null;
let connectedUser = null;

export const getMediaStream = async () => {
  try {
    const constraints = {
      video: true,
      audio: {
        echoCancellation: true,
      },
    };
    const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
    // const allMediaStream = mediaStream.getTracks();
    // console.log(allMediaStream);
    return mediaStream;
  } catch (error) {
    console.error('Error opening video camera.', error);
  }
};

// Update RTCPeerConnection
export const updateRTCPeerConnection = (newPeerConnection) => {
  try {
    peerConnection = newPeerConnection;
  } catch (error) {
    console.log(error);
  }
};
// Get RTCPeerConnection
export const getRTCPeerConnection = () => {
  return peerConnection;
};

// Update dataChannel
export const updateDataChannel = (newDataChannel) => {
  try {
    dataChannel = newDataChannel;
  } catch (error) {
    console.log(error);
  }
};
// Get dataChannel
export const getDataChannel = () => {
  return dataChannel;
};

// Update connectedUser
export const updateConnectedUser = (username) => {
  try {
    connectedUser = username;
  } catch (error) {
    console.log(error);
  }
};
// Get connectedUser
export const getConnectedUser = () => {
  return connectedUser;
};
