module.exports = {
  // Querying media devices
  getConnectedDevices: async function (type) {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((device) => device.kind === type);
  },

  // Local playback
  playVideoFromCamera: async function (element) {
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
      const allMediaStream = mediaStream.getTracks();
      console.log(allMediaStream);

      const videoElement = document.querySelector(element);
      videoElement.srcObject = mediaStream;
    } catch (error) {
      console.error('Error opening video camera.', error);
    }
  },

  // Capture display media
  captureDisplayMedia: async function (element) {
    try {
      const constraints = {
        video: {
          cursor: 'always' | 'motion' | 'never',
          displaySurface: 'application' | 'browser' | 'monitor' | 'window',
        },
      };
      const displayMediaStream = await navigator.mediaDevices.getDisplayMedia(
        constraints
      );
      const displayMediaElement = document.querySelector(element);
      displayMediaElement.srcObject = displayMediaStream;
    } catch (error) {
      console.error('Error capturing display media.', error);
    }
  },
};
