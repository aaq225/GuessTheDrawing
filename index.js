const express = require('express');
const path = require('path');
const http = require('http');
const socketio = require('socket.io');
const axios = require('axios');
const bodyParser = require('body-parser');
const { Profanity, ProfanityOptions } = require('@2toad/profanity');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = socketio(server);
app.use(express.static(path.join(__dirname, 'public')));
app.use('/images', express.static(path.join(__dirname, 'images')));
app.use(bodyParser.urlencoded({ extended: true }));

let player1 = null;
let player2 = null;
let currentWord = '';
let canvasState = []; // Store the series of drawing events
let timer = null;
let remainingTime = 45; // Initial timer duration
let currentColor = "#000000"; // Default color
let currentWidth = 12; // Default stroke width
let currentScore = 0;
let currentRound = 1;

function readWords(filename) {
  const filePath = path.join(__dirname, filename);
  return fs.readFileSync(filePath, 'utf8').split('\n').map(word => word.trim());
}

app.get('/homepage', function (req, res) {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.post('/homepage', function (req, res) {
  const { username } = req.body;
  if (player1 == null) {
    player1 = username;
    console.log("player 1: ", player1);
    res.json({ redirectUrl: '/draw' });
    io.emit('forceRefresh');
  } else if (player2 == null) {
    player2 = username;
    console.log("player 2: ", player2);
    res.json({ redirectUrl: '/display' });
    io.emit('forceRefresh');
  } else {
    res.status(400).send('Game is full');
  }
});

app.get('/', function (req, res) {
  res.redirect('/homepage');
});

app.get('/draw', function (req, res) {
  if (player1 == null) {
    // Redirect to homepage if no players are logged in
    console.log("player 1 is null");
    res.redirect('/homepage');
  } else if (player2 == null) {
    console.log("player 2 is null");
    // Redirect to waiting page if only one player is logged in
    res.sendFile(path.join(__dirname, 'waitingPage.html'));
  } else {
    // Send to draw page if both players are logged in
    res.sendFile(path.join(__dirname, 'draw.html'));
  }
});

app.get('/display', function (req, res) {
  if (player1 == null || player2 == null) {
    console.log("player 1: ", player1);
    console.log("player 2: ", player2);
    // Redirect to homepage if both players are not logged in
    res.redirect('/homepage');
  } else {
    // Send to display page if both players are logged in
    res.sendFile(path.join(__dirname, 'display.html'));
  }
});

// app.get('/reset', (req, res) => {
//   player1 = null;
//   player2 = null;
//   res.redirect('/');
// });

const options = new ProfanityOptions();
options.wholeWord = true; // Adjust options as necessary
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

const wordCategories = {
  flags: readWords('flags.txt'),
  animals: readWords('animals.txt'),
  foods: readWords('foods.txt'),
  objects: readWords('objects.txt'),
  verbs: readWords('verbs.txt')
};

function updateScoreAndRound() {
  io.emit('score', currentScore);
  io.emit('round', currentRound);
}

// Start the round timer
function startTimer(duration, callback) {
  let remaining = duration;
  timer = setInterval(() => {
    if (remaining > 0) {
      remaining--;
      remainingTime = remaining;
      io.emit('timer', remaining);
    } else {
      clearInterval(timer);
      remainingTime = 0;
      callback();
    }
  }, 1000);
}


function resetGame() {
  currentWord = '';
  canvasState = [];
  remainingTime = 45; 
  if (currentRound == 4) {
    currentRound = 0;
    currentScore = 0;
    console.log("Game Over!");
    io.emit('chat message', "Game Over!");
    player1 = null;
    player2 = null;
    setTimeout(() => {
      // res.redirect('/reset');
      io.emit('reset');
    }, 2500);
  }
  currentRound += 1;
}

// Handle socket connections
io.on('connection', function (socket) {
  socket.on('categorySelection', async function (category) {
    if (currentWord == '') {
      const words = wordCategories[category];
      const randomIndex = Math.floor(Math.random() * words.length);
      currentWord = words[randomIndex];
      console.log('Selected word:', currentWord);

      const synonyms = await getSynonyms(currentWord);
      console.log('Synonyms:', synonyms);

      io.emit('wordSelection', currentWord);
      remainingTime = 45; 
      io.emit('timer', remainingTime);

      clearInterval(timer);
      startTimer(45, () => {
        console.log("Time is up! (Switching turns in 3 seconds.)");
        io.emit('timeUp');
        updateScoreAndRound();
        resetGame();
        setTimeout(() => {
          io.sockets.emit('switchRoles');
        }, 3000);
      });
    }
  });

  socket.on('mdown', (obj) => {
    canvasState.push({ type: 'mdown', data: obj });
    socket.broadcast.emit('mdown', obj);
  });

  socket.on('mmove', (obj) => {
    canvasState.push({ type: 'mmove', data: obj });
    socket.broadcast.emit('mmove', obj);
  });

  socket.on('colorChange', function (color) {
    currentColor = color; // Update current color
    canvasState.push({ type: 'colorChange', data: color });
    io.emit('colorChange', color);
  });

  socket.on('widthChange', function (width) {
    currentWidth = width; 
    canvasState.push({ type: 'widthChange', data: width });
    io.emit('widthChange', width);
  });

  socket.on('eraser', function () {
    canvasState.push({ type: 'eraser' });
    io.emit('eraser');
  });

  socket.on('clearCanvas', function () {
    canvasState = [];
    io.emit('clearCanvas');
  });

  socket.on('chat message', async function (msg) {
    // Trim and ensure the message isn't empty or consists only of whitespace
    if (msg && msg.trim()) {
      let processedMessage = msg.trim();
      let feedback = '';

      // Check for profanity
      if (profanityFilter.exists(processedMessage)) {
        processedMessage = profanityFilter.censor(processedMessage);
      }

      // Check if it's a correct guess or synonym
      if (currentWord && processedMessage.toLowerCase() === currentWord.toLowerCase()) {
        feedback = 'Correct guess! (Switching turns in 3 seconds.)';
        currentScore += remainingTime;
        console.log('score: ', currentScore);
        updateScoreAndRound();
        io.emit('score', currentScore);
        io.emit('correctGuess');
        clearInterval(timer);
        resetGame();
        setTimeout(() => {
          console.log("switchRoles");
          io.sockets.emit('switchRoles');
        }, 3000);
      } else if (currentWord && (await checkSynonym(currentWord, processedMessage))) {
        feedback = 'You guessed a synonym!';
      } else if (currentWord) {
        const distance = levenshteinDistance(currentWord.toLowerCase(), processedMessage.toLowerCase());
        const isClose = distance <= Math.ceil(currentWord.length / 3);
        if (isClose) {
          feedback = 'Your guess is close!';
        } else {
          feedback = 'Wrong guess!';
        }
      }

      // Construct the final message with optional feedback
      const finalMessage = feedback ? `${processedMessage} (${feedback})` : processedMessage;
      io.emit('chat message', finalMessage);
    }
  });


  // Provide the current game state upon request
  socket.on('requestState', function () {
    socket.emit('restoreState', {
      canvas: canvasState,
      word: currentWord,
      timer: remainingTime,
      color: currentColor,
      width: currentWidth,
      score: currentScore,
      round: currentRound
    });
  });

  // Force refresh clients
  socket.on('forceRefresh', () => {
    // socket.emit('forceRefresh');
    if (window.location.pathname === '/homepage') {
      window.location.reload();
    }
  });
});

// copied from: https://www.tutorialspoint.com/levenshtein-distance-in-javascript#:~:text=The%20Levenshtein%20distance%20is%20a,one%20word%20into%20the%20other.
// allows me to detect if two words are close, ie. cat vs cap have 1 letter diff
// it will detect that and display to the user
const levenshteinDistance = (str1 = '', str2 = '') => {
  const track = Array(str2.length + 1).fill(null).map(() =>
    Array(str1.length + 1).fill(null));
  for (let i = 0; i <= str1.length; i += 1) {
    track[0][i] = i;
  }
  for (let j = 0; j <= str2.length; j += 1) {
    track[j][0] = j;
  }
  for (let j = 1; j <= str2.length; j += 1) {
    for (let i = 1; i <= str1.length; i += 1) {
      const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
      track[j][i] = Math.min(
        track[j][i - 1] + 1, // deletion
        track[j - 1][i] + 1, // insertion
        track[j - 1][i - 1] + indicator // substitution
      );
    }
  }
  return track[str2.length][str1.length];
};

server.listen(3000, function () {
  console.log('listening on port 3000');
});
