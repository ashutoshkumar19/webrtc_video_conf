import React, { useState, useEffect, Fragment } from 'react';

import {
  getMediaStream,
  updateRTCPeerConnection,
  getRTCPeerConnection,
  updateDataChannel,
  getDataChannel,
  updateConnectedUser,
  getConnectedUser,
  captureDisplayMedia,
} from '../webrtc/globalRTCPeerCoonection';

const MainComponent = ({ socket }) => {
  const [formData, setFormData] = useState({
    myUsername: '',
    otherUsername: '',
    message: '',
  });
  const { myUsername, otherUsername, message } = formData;

  const [chat, setChat] = useState([]);

  const onChange = (e) => {
    const value = e.target.value;
    if (/^[a-zA-Z0-9_]*[a-zA-Z0-9]*$/i.test(value) && value.length <= 10) {
      setFormData({ ...formData, [e.target.name]: value });
    }
  };

  const login = (e) => {
    e.preventDefault();
    if (myUsername.length >= 3) {
      socket.emit('login', myUsername);
    } else {
      alert('Username must be atleast 3 characters long..!');
    }
  };

  useEffect(() => {
    document.getElementById('hangUpBtn').disabled = true;

    socket.on('user_exists', (username) => {
      console.log(`${username} already exists..!\nPlease choose another username`);
      alert(`${username} already exists..!\nPlease choose another username`);
      setFormData({ ...formData, myUsername: '' });
      document.getElementById('myUsername').focus();
    });

    socket.on('login_success', (username) => {
      console.log(`Login success for: ${username}`);
      document.getElementById('myUsername').disabled = true;
      document.getElementById('loginBtn').disabled = true;

      // captureDisplayMedia().then(
      //   function (displayMediaStream) {
      //     const displayMediaElement = document.querySelector('video#localDisplayMedia');
      //     displayMediaElement.srcObject = displayMediaStream;
      //   },
      //   function () {}
      // );

      getMediaStream().then(
        function (mediaStream) {
          const localVideoElement = document.querySelector('video#localVideo');
          const remoteVideoElement = document.querySelector('video#remoteVideo');
          localVideoElement.srcObject = mediaStream;
          // console.log(mediaStream);

          let stream = mediaStream;

          var configuration = {
            iceServers: [
              {
                urls: ['turn:numb.viagenie.ca'],
                credential: 'muazkh',
                username: 'webrtc@live.com',
              },
              {
                urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'],
              },
            ],
            iceCandidatePoolSize: 10,
          };

          let myPeerConnection = new RTCPeerConnection(configuration);

          console.log('RTCPeerConnection object was created');

          // setup stream listening
          myPeerConnection.addStream(stream);

          //when a remote user adds stream to the peer connection, we display it
          myPeerConnection.onaddstream = function (event) {
            remoteVideoElement.srcObject = event.stream;
          };

          //setup ice handling
          myPeerConnection.onicecandidate = function (event) {
            if (event.candidate) {
              //when the browser finds an ice candidate we send it to another peer
              socket.emit('candidate', getConnectedUser(), event.candidate);
            } else {
              console.log('All ICE candidates have been sent');
            }
          };

          myPeerConnection.ondatachannel = function (event) {
            var receiveChannel = event.channel;
            receiveChannel.onmessage = function (event) {
              let data = JSON.parse(event.data);
              console.log('ondatachannel message:', data.message);
              console.log('from:', data.username);
              setChat((prevChat) => [
                ...prevChat,
                { message: data.message, username: data.username },
              ]);
            };
          };

          updateRTCPeerConnection(myPeerConnection);
          console.log('After Login: ');
          console.log(getRTCPeerConnection());

          openDataChannel();
        },
        function (error) {
          console.log(error);
        }
      );
    });

    //when we got ice candidate from another user
    socket.on('candidate', (from_username, candidate) => {
      try {
        // if (candidate.candidate.length > 0) {
        console.log('Candidate found:');
        console.log(candidate);

        let myPeerConnection = getRTCPeerConnection();
        myPeerConnection.addIceCandidate(new RTCIceCandidate(candidate));

        updateRTCPeerConnection(myPeerConnection);
        console.log('After candidate: ');
        console.log(getRTCPeerConnection());
        // }
      } catch (error) {
        console.log(error);
      }
    });

    //when somebody sends the offer
    socket.on('received_offer', (from_username, offer) => {
      document.getElementById('otherUsername').disabled = true;
      document.getElementById('callBtn').disabled = true;
      document.getElementById('hangUpBtn').disabled = false;

      console.log(`Received Offer from ${from_username}`);
      console.log('Offer: ');
      console.log(offer);

      updateConnectedUser(from_username);

      let myPeerConnection = getRTCPeerConnection();

      myPeerConnection.setRemoteDescription(new RTCSessionDescription(offer));

      myPeerConnection.createAnswer(
        function (answer) {
          myPeerConnection.setLocalDescription(answer);
          updateRTCPeerConnection(myPeerConnection);
          console.log('After Create Answer: ');
          console.log(getRTCPeerConnection());
          socket.emit('create_answer', from_username, answer);
        },
        function (error) {
          console.log(error);
        }
      );
    });

    //when somebody accepts the offer and sends answer
    socket.on('received_answer', (from_username, answer) => {
      // if (from_username === connectedUser) {
      document.getElementById('otherUsername').disabled = true;
      document.getElementById('callBtn').disabled = true;
      document.getElementById('hangUpBtn').disabled = false;

      console.log(`Received Answer from ${from_username}`);

      updateConnectedUser(from_username);

      let myPeerConnection = getRTCPeerConnection();

      myPeerConnection.setRemoteDescription(new RTCSessionDescription(answer));

      updateRTCPeerConnection(myPeerConnection);
      console.log('After Received Answer: ');
      console.log(getRTCPeerConnection());
    });

    // When call is closed
    socket.on('leave', (from_username) => {
      let connectedUser = getConnectedUser();
      if (from_username === connectedUser) {
        closeConnection();
      }
    });
  }, []);

  //creating data channel
  const openDataChannel = () => {
    var dataChannelOptions = {
      reliable: false,
    };

    let myPeerConnection = getRTCPeerConnection();
    let dataChannel = myPeerConnection.createDataChannel('myDataChannel');

    dataChannel.onmessage = function (event) {
      console.log('Got message:', event.data);
    };

    dataChannel.onopen = function () {
      console.log('datachannel open');
    };

    dataChannel.onclose = function () {
      console.log('datachannel close');
    };

    dataChannel.onerror = function (error) {
      console.log('Error:', error);
    };

    updateDataChannel(dataChannel);
    console.log(getDataChannel());
  };

  // Handle establishConnection
  const establishConnection = (e) => {
    e.preventDefault();
    if (otherUsername.length >= 3) {
      let myPeerConnection = getRTCPeerConnection();

      //make an offer
      myPeerConnection.createOffer(
        function (offer) {
          myPeerConnection.setLocalDescription(offer);
          updateRTCPeerConnection(myPeerConnection);
          console.log('After Create Offer: ');
          console.log(getRTCPeerConnection());
          socket.emit('create_offer', otherUsername, offer);
        },
        function (error) {
          console.log(error);
        }
      );
    } else {
      alert('otherUsername must be atleast 3 characters long..!');
    }
  };

  // Handle closeConnection
  const closeConnection = () => {
    try {
      document.getElementById('otherUsername').disabled = false;
      document.getElementById('callBtn').disabled = false;
      document.getElementById('hangUpBtn').disabled = true;

      updateConnectedUser(null);
      // remoteVideo.src = null;

      let myPeerConnection = getRTCPeerConnection();
      myPeerConnection.close();
      myPeerConnection.onicecandidate = null;
      myPeerConnection.onaddstream = null;
      // const remoteVideoElement = document.querySelector('video#remoteVideo');
      // remoteVideoElement.srcObject = null;
      updateRTCPeerConnection(myPeerConnection);
      console.log(getRTCPeerConnection());
    } catch (error) {
      console.log(error);
    }
  };

  const handleCloseConnection = (e) => {
    // e.preventDefault();
    try {
      let connectedUser = getConnectedUser();
      if (connectedUser.length > 0) {
        socket.emit('leave', otherUsername);
        closeConnection();
      }
    } catch (error) {
      console.log(error);
    }
  };

  // Send message
  const sendMessage = (e) => {
    e.preventDefault();
    let messageText = message.trim();
    let connectedUser = getConnectedUser();
    if (messageText.length !== 0 && connectedUser !== null) {
      let dataChannel = getDataChannel();
      console.log(dataChannel.readyState);
      if (dataChannel.readyState === 'open') {
        try {
          let obj = {
            message: messageText,
            username: myUsername,
          };
          dataChannel.send(JSON.stringify(obj));
          console.log(`Sent message: ${messageText}`);
        } catch (error) {
          console.log(error);
        }
      }
    }
  };

  return (
    <Fragment>
      <div className='videoContainer'>
        <div className='localVideoContainer'>
          <video id='localVideo' autoPlay playsInline controls />
        </div>
        <div className='remoteVideoContainer'>
          <video id='remoteVideo' autoPlay playsInline controls />
        </div>
      </div>

      {/* <div className='audioContainer'>
        <div className='localAudioContainer'>
          <p>Local Audio:</p>
          <audio id='localAudio' autoPlay controls />
        </div>
        <div className='remoteAudioContainer'>
          <p>Remote Audio:</p>
          <audio id='remoteAudio' autoPlay controls />
        </div>
      </div>

      <div className='localDisplayMediaContainer'>
        <video id='localDisplayMedia' autoPlay playsInline controls />
      </div> */}

      <div className='btn-container'>
        <form className='form-container' onSubmit={(e) => login(e)}>
          <input
            name='myUsername'
            type='text'
            id='myUsername'
            value={myUsername}
            onChange={(e) => onChange(e)}
          />
          <button id='loginBtn'>Login</button>
        </form>

        <div className='form-container'>
          <input
            name='otherUsername'
            type='text'
            id='otherUsername'
            value={otherUsername}
            onChange={(e) => onChange(e)}
          />
          <button id='callBtn' onClick={(e) => establishConnection(e)}>
            Establish connection
          </button>
          <button id='hangUpBtn' onClick={(e) => handleCloseConnection(e)}>
            Hang Up
          </button>
        </div>
      </div>

      <div className='msgForm-container'>
        <form className='msgForm' onSubmit={(e) => sendMessage(e)}>
          <input
            name='message'
            type='text'
            id='msgInput'
            value={message}
            onChange={(e) =>
              setFormData({ ...formData, [e.target.name]: e.target.value })
            }
          />
          <button id='sendMsgBtn'>Send message</button>
        </form>
      </div>

      {chat.length > 0 && (
        <div className='chatList'>
          {chat.map((chat, index) => {
            return (
              <div key={index} className='chat'>
                <span className='username'>{chat.username}: </span>
                <span className='message'>{chat.message}</span>
              </div>
            );
          })}
        </div>
      )}
    </Fragment>
  );
};

export default MainComponent;
