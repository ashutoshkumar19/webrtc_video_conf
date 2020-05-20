module.exports = {
  //creating our RTCPeerConnection object
  createRTCPeerConnection: async function (socket) {
    var configuration = {
      iceServers: [
        {
          urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'],
        },
      ],
      iceCandidatePoolSize: 10,
    };
    let peerConnection = null;

    peerConnection = new RTCPeerConnection(configuration);
    console.log('RTCPeerConnection object was created');
    console.log(peerConnection);

    //setup ice handling
    peerConnection.onicecandidate = function (event) {
      if (event.candidate) {
        //when the browser finds an ice candidate we send it to another peer
        socket.emit('candidate', event.candidate);
      } else {
        console.log('All ICE candidates have been sent');
      }
    };

    return peerConnection;
  },

  //create an offer
  makeOffer: async function (socket, peerConnection, targetUsername) {
    peerConnection
      .createOffer()
      .then(function (offer) {
        return peerConnection.setLocalDescription(offer);
      })
      .then(function () {
        socket.emit('create_offer', targetUsername, peerConnection.localDescription);
      })
      .catch(function (error) {
        console.log(error);
      });
  },
};
