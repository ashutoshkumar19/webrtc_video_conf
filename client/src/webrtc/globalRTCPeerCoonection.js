let peerConnection = null;
let dataChannel = null;
let connectedUser = null;

// Get connected devices
export const getConnectedDevices = async (type) => {
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter((device) => device.kind === type);
};

// Get Media streams
export const getMediaStream = async () => {
  try {
    {
      /*
      var desktopConstraints = {
        video: {
          mandatory: {
            maxWidth: 800,
            maxHeight: 600,
          },
        },
        audio: { echoCancellation: true },
      };

      var mobileConstraints = {
        video: {
          mandatory: {
            maxWidth: 480,
            maxHeight: 320,
          },
        },
        audio: { echoCancellation: true },
      };
      //if a user is using a mobile browser
      if (/Android|iPhone|iPad/i.test(navigator.userAgent)) {
        var constraints = mobileConstraints;
      } else {
        var constraints = desktopConstraints;
      }
    */
    }
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

// Capture display media
export const captureDisplayMedia = async () => {
  try {
    const constraints = {
      video: {
        cursor: 'always' | 'motion' | 'never',
        displaySurface: 'application' | 'browser' | 'monitor' | 'window',
      },
    };
    const displayMediaStream = await navigator.mediaDevices.getDisplayMedia(constraints);
    // const displayMediaElement = document.querySelector(element);
    // displayMediaElement.srcObject = displayMediaStream;
    return displayMediaStream;
  } catch (error) {
    console.error('Error capturing display media.', error);
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
