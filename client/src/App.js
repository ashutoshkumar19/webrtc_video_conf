import React, { useState, useEffect } from 'react';
import io from 'socket.io-client';
import axios from 'axios';

import './styles/App.scss';

import MainComponent from './components/MainComponent';

import { getConnectedDevices } from './webrtc/globalRTCPeerConnection';

// const socket = io.connect('http://localhost:5000');
const socket = io.connect('/');

const App = () => {
  const initialState = {
    videoDevices: [],
    audioDevices: [],
  };
  const [deviceList, setDeviceList] = useState(initialState);
  const { videoDevices, audioDevices } = deviceList;

  // Ping Heroku server at fixed interval to stop it from sleeping
  useEffect(() => {
    setInterval(() => {
      pingServer();
    }, 300000);
  }, []);
  const pingServer = () => {
    const res = axios.get('/api');
    console.log(res);
  };

  // Get all Audio & Video devices
  const getAllDevices = () => {
    getConnectedDevices('videoinput').then(
      function (videoDevices) {
        var videoObj = Promise.resolve(videoDevices);
        videoObj.then(
          function (v) {
            console.log('Cameras found:', v[0]);
            // console.log(v.length);
            setDeviceList((prevState) => ({ ...prevState, videoDevices: v[0] }));
          },
          function () {}
        );
      },
      function () {}
    );
    getConnectedDevices('audioinput').then(
      function (audioDevices) {
        var audioObj = Promise.resolve(audioDevices);
        audioObj.then(
          function (a) {
            console.log('Audio device found:', a[0]);
            // console.log(a.length);
            setDeviceList((prevState) => ({ ...prevState, audioDevices: a[0] }));
          },
          function () {}
        );
      },
      function () {}
    );
  };

  useEffect(() => {
    getAllDevices();
  }, []);

  return (
    <div className='App'>
      <div className='available-devices'>
        <h4>Video Devices</h4>
        {videoDevices ? `${JSON.stringify(videoDevices)}` : 'No video device found'}

        <h4>Audio Devices</h4>
        {audioDevices ? `${JSON.stringify(audioDevices)}` : 'No audio device found'}
      </div>

      <MainComponent socket={socket} />
    </div>
  );
};

export default App;
