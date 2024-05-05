const express = require('express');
const path = require('path');
const http = require('http');
const socketio = require('socket.io');
const axios = require('axios');
const bodyParser = require('body-parser'); 
const { Profanity, ProfanityOptions } = require('@2toad/profanity');

const app = express();
const server = http.createServer(app);
const io = socketio(server);
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({ extended: true })); 

let player1 = null;
let player2 = null;

app.get('/homepage', function (req, res) {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.post('/homepage', function (req, res) { 
  const { username } = req.body;
  if (!player1) {
    player1 = username;
    res.json({ redirectUrl: '/draw' });
  } else if (!player2) {
    player2 = username;
    res.json({ redirectUrl: '/display' });
  } else {
    res.status(400).send('Game is full');
  }
});

app.get('/', function (req, res) {
  res.redirect('/draw');
});

app.get('/draw', function (req, res) {
  res.sendFile(__dirname + '/draw.html');
});

app.get('/display', function (req, res) {
  res.sendFile(__dirname + '/display.html');
});

const options = new ProfanityOptions();
options.wholeWord = true; // adjust options as necessary
options.grawlix = '*****';

const profanityFilter = new Profanity(options);

// Initialize the dictionary API
const API_KEY = '2f813304-ff2f-4e72-89a8-363b6ab13040'; // Replace with your Merriam-Webster API key
async function getSynonyms(targetWord) {
  const url = `https://www.dictionaryapi.com/api/v3/references/thesaurus/json/${encodeURIComponent(targetWord)}?key=${API_KEY}`;

  try {
    const response = await axios.get(url);
    const entries = response.data;

    if (!entries.length || !entries[0].meta) {
      console.error(`No synonyms found for the target word: ${targetWord}`);
      return [];
    }

    const synonyms = entries[0].meta.syns.flat();
    return synonyms;
  } catch (error) {
    console.error('Error fetching synonyms:', error);
    return [];
  }
}

async function checkSynonym(targetWord, guess) {
  const synonyms = await getSynonyms(targetWord);
  return synonyms.includes(guess.toLowerCase());
}

// Define word categories
const wordCategories = {
  verbs: ['run', 'jump', 'eat', 'sleep', 'write'],
  nouns: ['apple', 'car', 'house', 'tree', 'book'],
  easy: ['sun', 'moon', 'star', 'dog', 'cat'],
  hard: ['elephant', 'ocean', 'mountain', 'universe', 'galaxy'],
};

let randomWord = 'apple';

let currentWord = '';
let timer = 0;

io.on('connection', function (socket) {
  socket.on('categorySelection', async function (category) {
    const words = wordCategories[category];
    const randomIndex = Math.floor(Math.random() * words.length);
    currentWord = words[randomIndex];
    console.log('Selected word:', currentWord);

    // Log all synonyms to the console
    const synonyms = await getSynonyms(currentWord);
    console.log('Synonyms:', synonyms);

    io.emit('wordSelection', currentWord);
    timer = setTimeout(() => {
      console.log("Time is up! (Switching turns in 3 seconds.)");
      io.emit('chat message', "Time is up! (Switching turns in 3 seconds.)");
      currentWord = '';
      setTimeout(() => {
        io.sockets.emit('switchRoles');
      }, 3000);
    }, 5000);
  });

  socket.on('mdown', (obj) => {
    socket.broadcast.emit('mdown', obj);
  });

  socket.on('mmove', (obj) => {
    socket.broadcast.emit('mmove', obj);
  });

  socket.on('image', (obj) => {
    socket.broadcast.emit('image', obj);
  });

  socket.on('chat message', async function (msg) {
    let processedMessage = msg;
    let feedback = '';

    // Check for profanity
    if (profanityFilter.exists(msg)) {
      processedMessage = profanityFilter.censor(msg);
    }

    // Check if it's a correct guess or synonym
    if (currentWord && msg.toLowerCase() === currentWord.toLowerCase()) {
      feedback = 'Correct guess! (Switching turns in 3 seconds.)';
      clearTimeout(timer);
      currentWord = '';
      setTimeout(() => {
        io.sockets.emit('switchRoles');
      }, 3000);
    } else if (currentWord && (await checkSynonym(currentWord, msg))) {
      feedback = 'You guessed a synonym!';
    } else {
      feedback = 'Wrong guess!';
    }

    const finalMessage = `${processedMessage} (${feedback})`;
    io.emit('chat message', finalMessage);
  });

  socket.on('colorChange', function (color) {
    console.log('Received color:', color);
    io.emit('colorChange', color);
  });

  socket.on('widthChange', function (width) {
    console.log('Received stroke:', width);
    io.emit('widthChange', width);
  });

  socket.on('eraser', function () {
    io.emit('eraser');
  });

  socket.on('clearCanvas', function () {
    io.emit('clearCanvas');
  });
});

server.listen(3000, function () {
  console.log('listening on *:3000');
});
