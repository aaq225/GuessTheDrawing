var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);

app.get('/', function(req, res){
  res.redirect('/draw');
});

app.get('/draw', function(req, res){
  res.sendFile(__dirname + '/draw.html');
});

app.get('/display', function(req, res){
  res.sendFile(__dirname + '/display.html');
});

let displaysocket = null;
// Define an array of word categories

const wordCategories = {
  verbs: ['run', 'jump', 'eat', 'sleep', 'write'],
  nouns: ['apple', 'car', 'house', 'tree', 'book'],
  easy: ['sun', 'moon', 'star', 'dog', 'cat'],
  hard: ['elephant', 'ocean', 'mountain', 'universe', 'galaxy']
};

// Handle category selection from the drawer
io.on('connection', function(socket){
  socket.on('categorySelection', function(category) {
    // Get a random word from the selected category
    const words = wordCategories[category];
    const randomIndex = Math.floor(Math.random() * words.length);
    const randomWord = words[randomIndex];
    console.log("Received word:", randomWord);
    // Emit the randomly selected word to the drawer
    io.emit('wordSelection', randomWord);
  });
});

io.on('connection', function(socket){

  

  socket.on('mdown', (obj) => {
    socket.broadcast.emit('mdown', obj);
  });

  socket.on('mmove', (obj) => {
    socket.broadcast.emit('mmove', obj);
  });
      
  socket.on('image', (obj) => {
    socket.broadcast.emit('image', obj);
  });

  socket.on('chat message', function(msg){
    console.log("Received message:", msg);
    io.emit('chat message', msg);
    // if(msg) // synonym checking
    // {
    //   io.emit('chat message', "Your guess was close!");
    // }
  });

  // Broadcast stroke color changes to all clients
  socket.on('colorChange', function(color){
    console.log("Received color:", color);
    io.emit('colorChange', color);
  });

  // Broadcast stroke width changes to all clients
  socket.on('widthChange', function(width){
    console.log("Received stroke:", width);
    io.emit('widthChange', width);
  });

  // Broadcast eraser mode to all clients
  socket.on('eraser', function(){
    io.emit('eraser');
  });

  socket.on('clearCanvas', function(){
    io.emit('clearCanvas');
});

  // socket.on('undoStroke', function(){
  //     io.emit('undoStroke');
  // });
});



http.listen(3000, function(){
  console.log('listening on *:3000');
});
