/*
Abdelrahman Qamhia: aaq225
Zaara Yakub: zay225
Titus Whang: juw225


Game Instructions:

Login with a username 
Wait for the second player to login 

This game is a 2 player game 

The first player who logs in will be directed to the draw.html page (they are the drawer first)
the second player who logs in will be directed to the diplay.html page (they are guessing what word the drawing is supposed to depict)

Each round is 45 seconds. 
The timer starts once the drawers selects a category 
Based on the category selection, a random word will be displayed in the timer/score/round div (pinkish box)

If the guesser is able to guess the word correctly, the time remaining on the clock will be added to their co-op score 

The two players should work together to get the highest score possible within the 4 rounds 
This incentivizes the drawer to do their best with their drawing and the guesser to try their best to guess correctly. 

At the end of each 45-second round, the guesser and drawer will "switch roles"
the guesser is redirected to the drawing page, and vice versa. 

At the end of 4 rounds, the overall score for the game is displayed, and both players are redirected to the homepage to play again.

*/

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
let canvasState = []; // will use to store the series of drawing events so we can restore canvas state if user refreshes
let timer = null;
let remainingTime = 45; // This will be our timer duration
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

// From the @2toad/profanity Library API documentation
const options = new ProfanityOptions();
options.wholeWord = true;
options.grawlix = '*****';

const profanityFilter = new Profanity(options);

// This is adapted from the Merriam Webster Dictionary API Documentation
// REPLACE WITH YOUR OWN API KEY
const API_KEY = '';
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

// Function to check if a the guess is a synonym, it will use the sysnonym list from the dictionary API call
async function checkSynonym(targetWord, guess) {
  const synonyms = await getSynonyms(targetWord);
  return synonyms.includes(guess.toLowerCase());
}

// List of text files defined (we had chatgpt generate these text files)
const wordCategories = {
  flags: readWords('flags.txt'),
  animals: readWords('animals.txt'),
  foods: readWords('foods.txt'),
  objects: readWords('objects.txt'),
  verbs: readWords('verbs.txt')
};

// Function that will issue a score and round update when called
function updateScoreAndRound() {
  io.emit('score', currentScore);
  io.emit('round', currentRound);
}

// Starting the round timer
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

// Function to reset the status of the game 
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
      io.emit('reset');
    }, 2500);
  }
  currentRound += 1;
}

// Handling socket connections
io.on('connection', function (socket) {
  // This will randomly choose a word from the category of the user choice.
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
  /* 
    Prof. Femister Code
    We were shown in class how to broadcast a drawing on canvas via socket.io
    the mouseDown, mousemove, mouseup were taken directly from that example, but we adjusted it for our needs 
  */
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
    // Trimming and ensuring the message isn't empty or has white spaces
    if (msg && msg.trim()) {
      let processedMessage = msg.trim();
      let feedback = '';

      // Checking for profanity as per API documnetation and censoring if so
      if (profanityFilter.exists(processedMessage)) {
        processedMessage = profanityFilter.censor(processedMessage);
      }

      // Checking if it's a correct guess or synonym and sending an appropriate chat msg
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

      const finalMessage = feedback ? `${processedMessage} (${feedback})` : processedMessage;
      io.emit('chat message', finalMessage);
    }
  });


  // Give game status when client requests it
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

  // Force refresh clients (this solved the problem of having to manually refresh when url is redirected)
  socket.on('forceRefresh', () => {
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
