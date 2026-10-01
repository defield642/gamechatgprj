const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

const rooms = {}; // code -> room object

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function checkWinner(board) {
  const lines = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
    [0, 3, 6], [1, 4, 7], [2, 5, 8], // columns
    [0, 4, 8], [2, 4, 6]             // diagonals
  ];
  for (const line of lines) {
    const [a, b, c] = line;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return { winner: board[a], line };
    }
  }
  if (board.every(cell => cell !== null)) {
    return { winner: 'draw', line: null };
  }
  return null;
}

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('create_room', ({ name }, callback) => {
    if (!name || name.trim() === '') {
      return callback({ error: 'Name is required' });
    }
    let code;
    do {
      code = generateRoomCode();
    } while (rooms[code]);

    const room = {
      code,
      players: [{ id: socket.id, name: name.trim(), symbol: 'X' }],
      board: Array(9).fill(null),
      turn: 'X',
      status: 'waiting',
      winner: null,
      winningLine: null
    };
    rooms[code] = room;
    socket.join(code);
    callback({ code, symbol: 'X', room: sanitizeRoom(room) });
    console.log(`Room ${code} created by ${name}`);
  });

  socket.on('join_room', ({ name, code }, callback) => {
    if (!name || name.trim() === '') {
      return callback({ error: 'Name is required' });
    }
    if (!code || code.trim() === '') {
      return callback({ error: 'Room code is required' });
    }
    const roomCode = code.trim().toUpperCase();
    const room = rooms[roomCode];
    if (!room) {
      return callback({ error: 'Room not found' });
    }
    if (room.players.length >= 2) {
      return callback({ error: 'Room is full' });
    }
    const symbol = room.players[0].symbol === 'X' ? 'O' : 'X';
    room.players.push({ id: socket.id, name: name.trim(), symbol });
    socket.join(roomCode);
    room.status = 'playing';
    room.board = Array(9).fill(null);
    room.turn = 'X';
    room.winner = null;
    room.winningLine = null;

    callback({ code: roomCode, symbol, room: sanitizeRoom(room) });
    io.to(roomCode).emit('game_start', sanitizeRoom(room));
    console.log(`${name} joined room ${roomCode}`);
  });

  socket.on('move', ({ code, index }, callback) => {
    const room = rooms[code];
    if (!room) {
      return callback({ error: 'Room not found' });
    }
    const player = room.players.find(p => p.id === socket.id);
    if (!player) {
      return callback({ error: 'You are not in this room' });
    }
    if (room.status !== 'playing') {
      return callback({ error: 'Game is not active' });
    }
    if (player.symbol !== room.turn) {
      return callback({ error: 'Not your turn' });
    }
    if (index < 0 || index > 8 || room.board[index] !== null) {
      return callback({ error: 'Invalid move' });
    }

    room.board[index] = player.symbol;
    const result = checkWinner(room.board);
    if (result) {
      room.status = 'finished';
      room.winner = result.winner;
      room.winningLine = result.line;
    } else {
      room.turn = room.turn === 'X' ? 'O' : 'X';
    }

    io.to(code).emit('game_update', sanitizeRoom(room));
    if (callback) callback({ success: true });
  });

  socket.on('rematch', ({ code }, callback) => {
    const room = rooms[code];
    if (!room) {
      return callback({ error: 'Room not found' });
    }
    const player = room.players.find(p => p.id === socket.id);
    if (!player) {
      return callback({ error: 'You are not in this room' });
    }
    if (room.players.length < 2) {
      return callback({ error: 'Waiting for another player' });
    }
    room.board = Array(9).fill(null);
    room.turn = 'X';
    room.status = 'playing';
    room.winner = null;
    room.winningLine = null;
    io.to(code).emit('game_update', sanitizeRoom(room));
    if (callback) callback({ success: true });
  });

  socket.on('leave_room', ({ code }) => {
    handleLeave(socket, code);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    for (const code in rooms) {
      const room = rooms[code];
      const playerIndex = room.players.findIndex(p => p.id === socket.id);
      if (playerIndex !== -1) {
        handleLeave(socket, code, true);
        break;
      }
    }
  });
});

function handleLeave(socket, code, isDisconnect = false) {
  const room = rooms[code];
  if (!room) return;
  const playerIndex = room.players.findIndex(p => p.id === socket.id);
  if (playerIndex === -1) return;

  const player = room.players[playerIndex];
  room.players.splice(playerIndex, 1);
  socket.leave(code);

  if (room.players.length === 0) {
    delete rooms[code];
    console.log(`Room ${code} deleted`);
  } else {
    room.status = 'waiting';
    room.board = Array(9).fill(null);
    room.turn = 'X';
    room.winner = null;
    room.winningLine = null;
    io.to(code).emit('opponent_left', { name: player.name, room: sanitizeRoom(room) });
  }
}

function sanitizeRoom(room) {
  return {
    code: room.code,
    players: room.players.map(p => ({ name: p.name, symbol: p.symbol })),
    board: room.board,
    turn: room.turn,
    status: room.status,
    winner: room.winner,
    winningLine: room.winningLine
  };
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
