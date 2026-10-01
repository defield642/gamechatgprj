const socket = io();
const $ = (id) => document.getElementById(id);

const lobbyScreen = $('lobby');
const gameScreen = $('game');
const nameInput = $('name');
const createBtn = $('create-btn');
const roomCodeInput = $('room-code');
const joinBtn = $('join-btn');
const lobbyError = $('lobby-error');
const roomCodeDisplay = $('room-code-display');
const copyCodeBtn = $('copy-code');
const leaveBtn = $('leave-btn');
const playerX = $('player-x');
const playerO = $('player-o');
const statusMessage = $('status-message');
const boardEl = $('board');
const rematchBtn = $('rematch-btn');

let currentRoom = null;
let mySymbol = null;
let myName = '';

/* ---------- Build board ---------- */
const cells = [];
for (let i = 0; i < 9; i++) {
  const cell = document.createElement('button');
  cell.type = 'button';
  cell.className = 'cell';
  cell.dataset.index = i;
  cell.dataset.value = '';
  cell.setAttribute('aria-label', `Cell ${i + 1}`);
  cell.addEventListener('click', () => handleCellClick(i));
  boardEl.appendChild(cell);
  cells.push(cell);
}

/* ---------- Helpers ---------- */
function showScreen(screen) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
  screen.classList.add('active');
}

let errorTimer;
function showError(msg) {
  lobbyError.textContent = msg;
  clearTimeout(errorTimer);
  errorTimer = setTimeout(() => { lobbyError.textContent = ''; }, 4000);
}

let toastTimer;
function showToast(msg) {
  let toast = document.querySelector('.toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  void toast.offsetWidth;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 1800);
}

/* ---------- Lobby actions ---------- */
createBtn.addEventListener('click', () => {
  const name = nameInput.value.trim();
  if (!name) return showError('Please enter your name.');
  myName = name;
  createBtn.disabled = true;
  socket.emit('create_room', { name }, (res) => {
    createBtn.disabled = false;
    if (res.error) return showError(res.error);
    currentRoom = res.code;
    mySymbol = res.symbol;
    enterGame(res.room);
  });
});

joinBtn.addEventListener('click', () => {
  const name = nameInput.value.trim();
  const code = roomCodeInput.value.trim().toUpperCase();
  if (!name) return showError('Please enter your name.');
  if (!code) return showError('Please enter a room code.');
  myName = name;
  joinBtn.disabled = true;
  socket.emit('join_room', { name, code }, (res) => {
    joinBtn.disabled = false;
    if (res.error) return showError(res.error);
    currentRoom = res.code;
    mySymbol = res.symbol;
    enterGame(res.room);
  });
});

roomCodeInput.addEventListener('input', (e) => {
  e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
});

nameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') createBtn.click();
});

roomCodeInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') joinBtn.click();
});

/* ---------- Game actions ---------- */
copyCodeBtn.addEventListener('click', async () => {
  if (!currentRoom) return;
  try {
    await navigator.clipboard.writeText(currentRoom);
    showToast('Room code copied');
  } catch {
    showToast('Could not copy');
  }
});

leaveBtn.addEventListener('click', () => {
  if (currentRoom) socket.emit('leave_room', { code: currentRoom });
  resetToLobby();
});

rematchBtn.addEventListener('click', () => {
  if (!currentRoom) return;
  socket.emit('rematch', { code: currentRoom }, (res) => {
    if (res && res.error) showError(res.error);
  });
});

/* ---------- Rendering ---------- */
function enterGame(room) {
  showScreen(gameScreen);
  updateGame(room);
}

function resetToLobby() {
  currentRoom = null;
  mySymbol = null;
  rematchBtn.classList.add('hidden');
  showScreen(lobbyScreen);

  cells.forEach((cell) => {
    cell.innerHTML = '';
    cell.dataset.value = '';
    cell.disabled = false;
    cell.classList.remove('x', 'o', 'win');
  });

  statusMessage.textContent = 'Waiting for opponent…';
  playerX.querySelector('.player-name').textContent = 'Waiting…';
  playerO.querySelector('.player-name').textContent = 'Waiting…';
  playerX.classList.remove('active');
  playerO.classList.remove('active');
  roomCodeDisplay.textContent = '····';
}

function updateGame(room) {
  roomCodeDisplay.textContent = room.code;

  const xPlayer = room.players.find((p) => p.symbol === 'X');
  const oPlayer = room.players.find((p) => p.symbol === 'O');
  playerX.querySelector('.player-name').textContent = xPlayer ? xPlayer.name : 'Waiting…';
  playerO.querySelector('.player-name').textContent = oPlayer ? oPlayer.name : 'Waiting…';

  playerX.classList.toggle('active', room.turn === 'X' && room.status === 'playing');
  playerO.classList.toggle('active', room.turn === 'O' && room.status === 'playing');

  const winLine = room.winningLine || [];

  cells.forEach((cell, i) => {
    const value = room.board[i];
    const prev = cell.dataset.value;

    if ((value || '') !== prev) {
      cell.dataset.value = value || '';
      if (value) {
        cell.innerHTML = `<span class="mark">${value}</span>`;
        cell.classList.remove('x', 'o');
        cell.classList.add(value.toLowerCase());
      } else {
        cell.innerHTML = '';
        cell.classList.remove('x', 'o');
      }
    }

    cell.classList.toggle('win', winLine.includes(i));

    const isMyTurn = room.status === 'playing' && room.turn === mySymbol;
    cell.disabled = !isMyTurn || value !== null || room.status !== 'playing';
  });

  if (room.status === 'waiting') {
    statusMessage.textContent = 'Waiting for opponent to join…';
    rematchBtn.classList.add('hidden');
  } else if (room.status === 'playing') {
    const other = room.turn === 'X' ? xPlayer : oPlayer;
    statusMessage.textContent =
      room.turn === mySymbol ? 'Your turn' : `${other ? other.name : 'Opponent'} is thinking…`;
    rematchBtn.classList.add('hidden');
  } else if (room.status === 'finished') {
    if (room.winner === 'draw') statusMessage.textContent = "It's a draw.";
    else if (room.winner === mySymbol) statusMessage.textContent = 'You win!';
    else statusMessage.textContent = 'You lose.';
    rematchBtn.classList.remove('hidden');
  }
}

function handleCellClick(index) {
  if (!currentRoom) return;
  socket.emit('move', { code: currentRoom, index }, (res) => {
    if (res && res.error) showToast(res.error);
  });
}

/* ---------- Socket events ---------- */
socket.on('game_start', (room) => updateGame(room));
socket.on('game_update', (room) => updateGame(room));
socket.on('opponent_left', ({ name, room }) => {
  updateGame(room);
  showToast(`${name} left the room`);
});
socket.on('connect_error', () => showError('Connection error. Please refresh.'));
