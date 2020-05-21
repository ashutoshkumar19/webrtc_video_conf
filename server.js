const express = require('express');
const app = express();

const server = require('http').createServer(app);
const io = require('socket.io')(server);

users = [];
socketList = {};

io.on('connection', (socket) => {
  // Add new users and their sockets
  socket.on('login', (username) => {
    try {
      if (users.includes(username)) {
        socket.emit('user_exists', username);
        console.log(`${username} already exists`);
      } else {
        users.push(username);

        socket.username = username;
        socketList[username] = socket;

        console.log('\nNew user added...');
        console.log(users);

        socket.emit('login_success', username);

        // io.emit('get_users', users);
      }
    } catch (error) {
      console.log(error);
    }
  });

  socket.on('candidate', (to_user, candidate) => {
    try {
      if (to_user.length > 0) {
        console.log('candidate found');
        console.log(candidate);

        socketList[to_user].emit('candidate', socket.username, candidate);
      }
    } catch (error) {
      console.log(error);
    }
  });

  // handle createOffer
  socket.on('create_offer', (targetUsername, offer) => {
    try {
      if (users.includes(targetUsername)) {
        console.log(`\ncreateOffer from ${socket.username} to ${targetUsername}`);
        console.log('Offer:');
        console.log(offer);
        socketList[targetUsername].emit('received_offer', socket.username, offer);
      } else {
        console.log(`\n${targetUsername} doesn't exist...!`);
      }
    } catch (error) {
      console.log(error);
    }
  });

  // handle createAnswer
  socket.on('create_answer', (targetUsername, answer) => {
    try {
      if (users.includes(targetUsername)) {
        console.log(`\ncreateAnswer from ${socket.username} to ${targetUsername}`);
        console.log('Answer:');
        console.log(answer);
        socketList[targetUsername].emit('received_answer', socket.username, answer);
      } else {
        console.log(`\n${targetUsername} doesn't exist...!`);
      }
    } catch (error) {
      console.log(error);
    }
  });

  // Send  message
  socket.on('message', (message) => {
    try {
      socket.emit('get_message', socket.username, message);
    } catch (error) {
      console.log(error);
    }
  });

  // Send  message
  socket.on('leave', (to_username) => {
    try {
      socketList[to_username].emit('leave', socket.username);
    } catch (error) {
      console.log(error);
    }
  });

  // Remove socket when client disconnects
  socket.on('disconnect', (data) => {
    console.log(`${socket.username} disconnected`);
    users = users.filter((username) => username !== socket.username);
    delete socketList[socket.username];
  });
});

/***************************************************************************/

app.get('/api', (req, res) => {
  console.log('PING RECEIVED');
  res.send('success');
});

// Serve static assets in production
if (process.env.NODE_ENV === 'production') {
  // Set static folder
  app.use(express.static('client/build'));

  app.get('*', (req, res) => {
    res.sendFile(path.resolve(__dirname, 'client', 'build', 'index.html'));
  });
}

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => console.log(`Server started on port ${PORT}`));

/***************************************************************************/
