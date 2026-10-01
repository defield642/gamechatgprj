const socket = io();

const lobbyScreen = document.getElementById('lobby');
const gameScreen = document.getElementById('game');
const nameInput = document.getElementById('name');
const createBtn = document.getElementById('create-btn');
const roomCodeInput = document.getElementById('room-code');
const joinBtn = document.getElementById('join-btn');
const lobbyError = document.getElementById('lobby-error');
const roomCodeDisplay = document.getElementById('room-code-display');
const leaveBtn = document.getElementById('leave-btn');
const playerX = document.getElementById('player-x');
const playerO = document.getElementById('player-o');
const statusMessage = document.getElementById('status-message');
const boardEl = document.getElementById('board');
const rematchBtn = document.getElementById('rematch-btn');

let currentRoom = null;
let mySymbol = null;
let myName = '';

// Create board cells
for (let i = 0; i < 9; i++) {
  const cell = document.createElement('button');
  cell.classList.add('cell');
  cell.dataset.index = i;
  cell.addEventListener('click', () => handleCellClick(i));
  boardEl.appendChild(cell);
}

function showScreen(screen) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  screen.classList.add('active');
}

function showError(msg) {
  lobbyError.textContent = msg;
  setTimeout(() => { lobbyError.textContent = ''; }, 4000);
}

createBtn.addEventListener('click', () => {
  const name = nameInput.value.trim();
  if (!name) return showError('Please enter your name');
  myName = name;
  socket.emit('create_room', { name }, (response) => {
    if (response.error) return showError(response.error);
    currentRoom = response.code;
    mySymbol = response.symbol;
    enterGame(response.room);
  });
});

joinBtn.addEventListener('click', () => {
  const name = nameInput.value.trim();
  const code = roomCodeInput.value.trim().toUpperCase();
  if (!name) return showError('Please enter your name');
  if (!code) return showError('Please enter a room code');
  myName = name;
  socket.emit('join_room', { name, code }, (response) => {
    if (response.error) return showError(response.error);
    currentRoom = response.code;
    mySymbol = response.symbol;
    enterGame(response.room);
  });
});

leaveBtn.addEventListener('click', () => {
  if (currentRoom) {
    socket.emit('leave_room', { code: currentRoom });
  }
  resetToLobby();
});

rematchBtn.addEventListener('click', () => {
  if (currentRoom) {
    socket.emit('rematch', { code: currentRoom }, (response) => {
      if (response && response.error) showError(response.error);
    });
  }
});

function enterGame(room) {
  showScreen(gameScreen);
  roomCodeDisplay.textContent = room.code;
  updateGame(room);
}

function resetToLobby() {
  currentRoom = null;
  mySymbol = null;
  rematchBtn.classList.add('hidden');
  showScreen(lobbyScreen);
  document.querySelectorAll('.cell').forEach(cell => {
    cell.textContent = '';
    cell.disabled = false;
    cell.classList.remove('x', 'o', 'win');
  });
  statusMessage.textContent = 'Waiting for opponent...';
  playerX.querySelector('.player-name').textContent = 'Waiting...';
  playerO.querySelector('.player-name').textContent = 'Waiting...';
  playerX.classList.remove('active');
  playerO.classList.remove('active');
}

function updateGame(room) {
  roomCodeDisplay.textContent = room.code;

  const xPlayer = room.players.find(p => p.symbol === 'X');
  const oPlayer = room.players.find(p => p.symbol === 'O');
  playerX.querySelector('.player-name').textContent = xPlayer ? xPlayer.name : 'Waiting...';
  playerO.querySelector('.player-name').textContent = oPlayer ? oPlayer.name : 'Waiting...';

  playerX.classList.toggle('active', room.turn === 'X' && room.status === 'playing');
  playerO.classList.toggle('active', room.turn === 'O' && room.status === 'playing');

  const cells = document.querySelectorAll('.cell');
  cells.forEach((cell, i) => {
    const value = room.board[i];
    cell.textContent = value || '';
    cell.classList.remove('x', 'o', 'win');
    if (value) {
      cell.classList.add(value.toLowerCase());
    }
    if (room.winningLine && room.winningLine.includes(i)) {
      cell.classList.add('win');
    }
    const isMyTurn = room.status === 'playing' && room.turn === mySymbol;
    cell.disabled = !isMyTurn || value !== null || room.status !== 'playing';
  });

  if (room.status === 'waiting') {
    statusMessage.textContent = 'Waiting for opponent to join...';
    rematchBtn.classList.add('hidden');
  } else if (room.status === 'playing') {
    statusMessage.textContent = room.turn === mySymbol
      ? 'Your turn'
      : `Waiting for ${room.turn === 'X' ? xPlayer?.name : oPlayer?.name}...`;
    rematchBtn.classList.add('hidden');
  } else if (room.status === 'finished') {
    if (room.winner === 'draw') {
      statusMessage.textContent = "It's a draw!";
    } else if (room.winner === mySymbol) {
      statusMessage.textContent = 'You win! 🎉';
    } else {
      statusMessage.textContent = 'You lose.';
    }
    rematchBtn.classList.remove('hidden');
  }
}

function handleCellClick(index) {
  if (!currentRoom) return;
  socket.emit('move', { code: currentRoom, index }, (response) => {
    if (response && response.error) {
      console.log('Move error:', response.error);
    }
  });
}

socket.on('game_start', (room) => {
  updateGame(room);
});

socket.on('game_update', (room) => {
  updateGame(room);
});

socket.on('opponent_left', ({ name, room }) => {
  updateGame(room);
  statusMessage.textContent = `${name} left the room.`;
});

socket.on('connect_error', () => {
  showError('Connection error. Please refresh.');
});
