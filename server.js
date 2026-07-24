const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server); //create server

app.use(express.static('public'));

let waitingPlayer = null; //holds one socket at a time, whoever is waiting for an opponent
let roomCounter = 0;//generate unique room names(room_1 ,room_2, etc)
const games = {};
const availableRooms = [];
const privateRooms = [];

//game state
const WIN_SCORE = 10;
const GAME_WIDTH = 800;
const GAME_HEIGHT = 400;
const PADDLE_HEIGHT = 80;
//paddle properties
const PADDLE_WIDTH = 10;
const PADDLE_SPEED = 6;
const PADDLE_EDGE_DIST = 20;
//ball properties
const BALL_SIZE = 10;
const BALL_SPEED = 4;

//superpower properties
const POWERUP_SIZE = 20;
const POWERUP_SPAWN_INTERVAL = 300; // around 5 seconds at 60fps
const POWERUP_LIFETIME = 900; //despawns around 15 seconds
const POWERUP_MAX_COUNT = 3; //max of 3 powerups in the canvas
const POWERUP_TYPES = [ 'teleportGate' ,'multiBall', 'bigPaddle', 'fastBall', 'slowBall', 'explosiveBounce'];

//general powerup duration
const POWERUP_EFFECT_DURATION = 300;
const POWERUP_LABEL_FONT_SIZE = 8;
//multiball
const MULTIBALL_EXTRA_COUNT = 2;// number of ball multiBall adds;
//big paddle
const BIG_PADDLE_HEIGHT = 160;       
//fast/slow ball
const FAST_BALL_MULTIPLIER = 1.8;    
const SLOW_BALL_MULTIPLIER = 0.5;   
//explosive ball
const EXPLOSIVE_BOUNCE_MULTIPLIER = 1.75;
const EXPLOSIVE_MAX_SPEED = 6 *BALL_SPEED;
//teleport gate
const TELEPORT_GATE_LIFETIME = 600; // 10 seconds
const TELEPORT_GATE_SIZE = 54;
const TELEPORT_COOLDOWN = 30; // ~0.5s — prevents instant re-teleport ping-ponging

function createGameState(){
    return{
        balls: [{ x: GAME_WIDTH / 2, y: GAME_HEIGHT / 2, dx: BALL_SPEED, dy: BALL_SPEED ,lastHitBy: null, explosive:false, teleportCooldown: 0}],
        paddle1: { x: PADDLE_EDGE_DIST, y: GAME_HEIGHT / 2 - PADDLE_HEIGHT / 2, height: PADDLE_HEIGHT, bigTimer: 0 },
        paddle2: { x: GAME_WIDTH - PADDLE_EDGE_DIST, y: GAME_HEIGHT / 2 - PADDLE_HEIGHT / 2, height: PADDLE_HEIGHT, bigTimer: 0 },
        score1: 0,
        score2: 0,
        powerUps: [],
        powerUpTimer: POWERUP_SPAWN_INTERVAL,
        teleportGates: [],
        teleportGatesTimer: 0,
        ballSpeedEffect: { type: null, timer: 0 } //fast slow or null
    }
}

function generateRoomCode(){
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no O/0/I/1 — avoids visual mixups
  let code;
  do {
    code = '';
    for(let i = 0; i< 5; i++){
      code += chars[Math.floor(Math.random() * chars.length)];
    }
  } while (privateRooms[code]); // regenerate if this code is already in use
  return code;

}

function applySpeedMultiplier(game, multiplier) {//increase/decrease ball speed function
  game.balls.forEach(ball => {
    const dxSign = ball.dx < 0 ? -1 : 1;
    const dySign = ball.dy < 0 ? -1 : 1;
    ball.dx = dxSign * BALL_SPEED * multiplier;
    ball.dy = dySign * BALL_SPEED * multiplier;
  });
}

function startMatch(socketA, socketB, roomId){
  games[roomId] = createGameState();
  socketA.emit('startGame', {roomId, playerNumber: socketA.playerNumber}); 
  socketB.emit('startGame', { roomId, playerNumber: socketB.playerNumber });

}

function boostExplosiveBall(ball) {
  const speed = Math.sqrt(ball.dx * ball.dx + ball.dy * ball.dy);
  const newSpeed = Math.min(speed * EXPLOSIVE_BOUNCE_MULTIPLIER, EXPLOSIVE_MAX_SPEED);
  const scale = newSpeed / speed;
  ball.dx *= scale;
  ball.dy *= scale;
}

io.on('connection', (socket) => {

    console.log('a player connected:', socket.id);

    socket.on('findMatch', () => {
    if(waitingPlayer === null){
        waitingPlayer = socket;
        socket.emit('waiting');// tell the client they are waiting for an opponent
        console.log(`${socket.id} is waiting for an opponent`)

        
    } else{
        //someone is already waiting, pair them up
        let roomId;
            if (availableRooms.length > 0) {//if there are rooms that can be reused, reuse them, else create a new one
                roomId = availableRooms.pop(); 
                console.log(`Reusing ${roomId}`);
            } else {
                roomCounter++;
                roomId = `room-${roomCounter}`; 
            }

        waitingPlayer.join(roomId);
        socket.join(roomId);

        waitingPlayer.emit('startGame', {roomId, playerNumber: 1});
        socket.emit('startGame', {roomId, playerNumber:2});
        games[roomId] = createGameState()// intitialize objects in that new room 
        console.log(`Paired ${waitingPlayer.id} (P1) and ${socket.id} (P2) into ${roomId}`);

    

    waitingPlayer.roomId = roomId;
    socket.roomId = roomId;
    waitingPlayer.playerNumber = 1;
    socket.playerNumber = 2;
    waitingPlayer.opponentSocket = socket;
    socket.opponentSocket = waitingPlayer;

    console.log(`Paired ${waitingPlayer.id} (P1) and ${socket.id} (P2) into ${roomId}`);

    waitingPlayer = null;


   
    }
    });
    //client sends 'up' or 'down' when a key is pressed, they send'stop'  when released

    socket.on('paddleMove', (direction) => {
        const roomId = socket.roomId;
        if (!roomId || !games[roomId]) return;

        const game = games[roomId];

        let paddle;

        if(socket.playerNumber === 1){//assign paddles
            paddle = game.paddle1;
        } else{
            paddle = game.paddle2;
        }

        if(direction === 'up') paddle.dy = -PADDLE_SPEED;
        else if (direction === 'down') paddle.dy = PADDLE_SPEED;
        else paddle.dy = 0;
    })

    socket.on('createPrivateRoom', () => {
      const code = generateRoomCode();
      privateRooms[code] = {hostSocket: socket};
      socket.privateCode = code; // remember it on the socket for cleanup
      socket.emit('privateRoomCreated', { code });
      console.log(`${socket.id} created private room ${code}`);
    });

    socket.on('joinPrivateRoom', (code) => {
      const room = privateRooms[code];

      //error handling
      if(!room){
        socket.emit('privateRoomError', 'Room not found');
        return;
      }

      const host = room.hostSocket;

      if(!host.connected){
        socket.emit('privateRoomError', 'Host is no longer conencted.')
      }

      if (host === socket) {
      socket.emit('privateRoomError', "You can't join your own room.");
      return;
      }

      //valid rooms
      let roomId;
      if(availableRooms.length > 0){
        roomId = availableRooms.pop();
      } else{
        roomCounter++;
        roomId = `room-${roomCounter}`;
      }

      host.join(roomId);
      socket.join(roomId);

      host.roomId = roomId;
      socket.roomId = roomId;
      host.playerNumber =1;
      socket.playerNumber = 2;
      host.opponentSocket = socket;
      socket.opponentSocket = host;

      games[roomId] = createGameState();
      host.emit('startGame', { roomId, playerNumber: 1 });
      socket.emit('startGame', { roomId, playerNumber: 2 });

      console.log(`Private match: ${host.id} (P1) vs ${socket.id} (P2) in ${roomId}`);

      delete privateRooms[code]; // code is used up, one-time use
      host.privateCode = null;

    });

    socket.on('disconnect', () =>{
        console.log('a user disconnected:', socket.id);
    

    if(waitingPlayer === socket){
        waitingPlayer = null;
        console.log('Waiting player disconnected, slot cleared');
    }

    if(socket.roomId){
        socket.to(socket.roomId).emit('opponentLeft');
        delete games[socket.roomId];
        availableRooms.push(socket.roomId);
    }

    if(socket.privateCode){
      delete privateRooms[socket.privateCode];
    }
});

  socket.on('requestRematch', ()=> {//request
    const opponent = socket.opponentSocket;
    if(!opponent || !opponent.connected){
      socket.emit('opponentLeft');
      return;
    }

    socket.rematchReady = true;
    if (opponent.rematchReady){//if opponent accepts rematch
      socket.rematchReady = false;
      opponent.rematchReady = false;
      startMatch(socket, opponent, socket.roomId);

    }else{
      socket.emit('waitingForRematch');
    }
  });

  socket.on('leaveToMenu', () => {
    const opponent = socket.opponentSocket;
    if (opponent && opponent.connected) {
      opponent.emit('opponentLeft');
      opponent.opponentSocket = null;
      opponent.rematchReady = false;
    }
    if (socket.roomId) {
      availableRooms.push(socket.roomId); // room is now truly free to reuse
    }
    socket.opponentSocket = null;
    socket.rematchReady = false;
    socket.roomId = null;
  });


});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));

let lastTickTime = Date.now(); //tracks previous ticks real time

setInterval(() =>{

  const now = Date.now();
  const delta = now - lastTickTime;
  let deltaMultiplier = Math.min(delta/(1000/60),3); // cap how muh a single tick compensates(just incase i forget it means a single tick can compensate for being upto 3x slower, one recovery tick will move things a bounded safe amount instead of an enormous jump)
  lastTickTime = now;

for(const roomId in games){
    const game = games[roomId];

    //move paddles;
    game.paddle1.y += (game.paddle1.dy || 0) * deltaMultiplier;
    game.paddle2.y += (game.paddle2.dy || 0) * deltaMultiplier;
    game.paddle1.y = Math.max(0, Math.min(GAME_HEIGHT - game.paddle1.height, game.paddle1.y));
    game.paddle2.y = Math.max(0, Math.min(GAME_HEIGHT - game.paddle2.height, game.paddle2.y));


    //big paddle superpower timer
    if (game.paddle1.bigTimer > 0) {
      game.paddle1.bigTimer -= deltaMultiplier;
      if (game.paddle1.bigTimer <= 0) game.paddle1.height = PADDLE_HEIGHT;
    }
    if (game.paddle2.bigTimer > 0) {
      game.paddle2.bigTimer -= deltaMultiplier;
      if (game.paddle2.bigTimer <= 0) game.paddle2.height = PADDLE_HEIGHT;
    }

      // Ball speed effect timer — revert to normal speed when expired
    if (game.ballSpeedEffect.timer > 0) {
      game.ballSpeedEffect.timer-= deltaMultiplier;
      if (game.ballSpeedEffect.timer <= 0) {
        game.ballSpeedEffect.type = null;
        applySpeedMultiplier(game, 1);
        }
        }

      // Teleport gates timer
    if (game.teleportGatesTimer > 0) {
      game.teleportGatesTimer -= deltaMultiplier;
      if (game.teleportGatesTimer <= 0) {
        game.teleportGates = [];
      }
    }
    
    //Power-ups
    game.powerUpTimer-= deltaMultiplier;
    if (game.powerUpTimer <= 0) {
      if (game.powerUps.length < POWERUP_MAX_COUNT) {
        const type = POWERUP_TYPES[Math.floor(Math.random() * POWERUP_TYPES.length)];
        game.powerUps.push({
          x: GAME_WIDTH / 2 - 150 + Math.random() * 300,
          y: Math.random() * (GAME_HEIGHT - POWERUP_SIZE - POWERUP_LABEL_FONT_SIZE * 2),
          type: type,
          age: 0
        });
        console.log('SPAWNED:', type);
      }
      game.powerUpTimer = POWERUP_SPAWN_INTERVAL; // resets on a fixed 5s cadence either way
    }

    // Age up + despawn expired power-ups
    for (let i = game.powerUps.length - 1; i >= 0; i--) {
      game.powerUps[i].age += deltaMultiplier;
      if (game.powerUps[i].age >= POWERUP_LIFETIME) {
        game.powerUps.splice(i, 1);
      }
    }
    //Move ball
    for (let i = game.balls.length - 1; i >= 0; i--) {
      const ball = game.balls[i];

      ball.x += ball.dx * deltaMultiplier;
      ball.y += ball.dy * deltaMultiplier;

      // bounce off top/bottom walls
      if (ball.y <= 0 || ball.y >= GAME_HEIGHT) {
        ball.dy *= -1;
        if(ball.explosive){
          io.to(roomId).emit('explosiveBounce',{x: ball.x, y: ball.y});
        }
      }

        // bounce off paddle 1 (left) — only if moving left
      if (
        ball.dx < 0 &&
        ball.x <= game.paddle1.x + PADDLE_WIDTH &&
        ball.x >= game.paddle1.x &&
        ball.y >= game.paddle1.y &&
        ball.y <= game.paddle1.y + game.paddle1.height
      ) {
        ball.dx *= -1;
        ball.x = game.paddle1.x + PADDLE_WIDTH;
        ball.lastHitBy = 1;
         if (ball.explosive) {
          boostExplosiveBall(ball);
          io.to(roomId).emit('explosiveBounce', { x: ball.x, y: ball.y });
        }
      }

      // bounce off paddle 2 (right) — only if moving right
      if (
        ball.dx > 0 &&
        ball.x >= game.paddle2.x &&
        ball.x <= game.paddle2.x + PADDLE_WIDTH &&
        ball.y >= game.paddle2.y &&
        ball.y <= game.paddle2.y + game.paddle2.height
      ) {
        ball.dx *= -1;
        ball.x = game.paddle2.x;
        ball.lastHitBy = 2;
      }

      // power-up pickup (box overlap check)
      for (let p = game.powerUps.length - 1; p >= 0; p--) {
        const powerUp = game.powerUps[p];
        const hit =
          ball.x + BALL_SIZE / 2 >= powerUp.x &&
          ball.x - BALL_SIZE / 2 <= powerUp.x + POWERUP_SIZE &&
          ball.y + BALL_SIZE / 2 >= powerUp.y &&
          ball.y - BALL_SIZE / 2 <= powerUp.y + POWERUP_SIZE;

        if (hit) {
          const collectingPlayer = ball.lastHitBy || 1;

          if (powerUp.type === 'multiBall') {
            for (let n = 0; n < MULTIBALL_EXTRA_COUNT; n++) {
              const dxSign = Math.random() < 0.5 ? -1 : 1;
              const dySign = Math.random() < 0.5 ? -1 : 1;
              game.balls.push({
                x: GAME_WIDTH / 2,
                y: GAME_HEIGHT / 2,
                dx: dxSign * BALL_SPEED,
                dy: dySign * BALL_SPEED,
                lastHitBy: collectingPlayer,
                explosive: false
              });
            }
          } else if (powerUp.type === 'bigPaddle') {
            const paddle = collectingPlayer === 1 ? game.paddle1 : game.paddle2;
            paddle.height = BIG_PADDLE_HEIGHT;
            paddle.bigTimer = POWERUP_EFFECT_DURATION;
          } else if (powerUp.type === 'fastBall') {
            game.ballSpeedEffect = { type: 'fast', timer: POWERUP_EFFECT_DURATION };
            applySpeedMultiplier(game, FAST_BALL_MULTIPLIER);
          } else if (powerUp.type === 'slowBall') {
            game.ballSpeedEffect = { type: 'slow', timer: POWERUP_EFFECT_DURATION };
            applySpeedMultiplier(game, SLOW_BALL_MULTIPLIER);
          } else if (powerUp.type === 'explosiveBounce'){
            ball.explosive = true;
          }else if (powerUp.type === 'teleportGate'){
            const gateA = {
              x: GAME_WIDTH * 0.25 + Math.random() * GAME_WIDTH * 0.15,
              y: 40 + Math.random() * (GAME_HEIGHT - 80)
            };

            const gateB = {
              x: GAME_WIDTH * 0.6 + Math.random() * GAME_WIDTH * 0.15,
              y: 40 + Math.random() * (GAME_HEIGHT - 80)
            }

            game.teleportGates = [gateA, gateB];
            game.teleportGatesTimer = TELEPORT_GATE_LIFETIME;

          }

          game.powerUps.splice(p, 1); // remove just this one power-up
        }
      }

      //teleport gate check
      if (ball.teleportCooldown > 0) {
        ball.teleportCooldown -= deltaMultiplier;
      } else if (game.teleportGates.length === 2) {
        for (let g = 0; g < 2; g++) {
          const gate = game.teleportGates[g];
          const hit =
            ball.x + BALL_SIZE / 2 >= gate.x - TELEPORT_GATE_SIZE / 2 &&
            ball.x - BALL_SIZE / 2 <= gate.x + TELEPORT_GATE_SIZE / 2 &&
            ball.y + BALL_SIZE / 2 >= gate.y - TELEPORT_GATE_SIZE / 2 &&
            ball.y - BALL_SIZE / 2 <= gate.y + TELEPORT_GATE_SIZE / 2;

          if (hit) {
            const otherGate = game.teleportGates[1 - g];
            ball.x = otherGate.x;
            ball.y = otherGate.y;

            // push the ball forward along its current direction so it doesn't
            // immediately overlap the exit gate again
            const speed = Math.sqrt(ball.dx * ball.dx + ball.dy * ball.dy);
            ball.x += (ball.dx / speed) * (TELEPORT_GATE_SIZE + 5);
            ball.y += (ball.dy / speed) * (TELEPORT_GATE_SIZE + 5);

            ball.teleportCooldown = TELEPORT_COOLDOWN;
            io.to(roomId).emit('ballTeleported', { x: ball.x, y: ball.y });
            break; // stop checking gates for this ball this frame
          }
        }
      }
      // scoring
      if (ball.x < 0) {
        game.score2++;
        io.to(roomId).emit('ballScored'); 
        if (game.balls.length > 1) {
          game.balls.splice(i, 1); // extra ball — just remove it
        } else {
          ball.x = GAME_WIDTH / 2; ball.y = GAME_HEIGHT / 2;
          ball.dx = BALL_SPEED; ball.dy = BALL_SPEED;
        }
      } else if (ball.x > GAME_WIDTH) {
        game.score1++;
        io.to(roomId).emit('ballScored');
        if (game.balls.length > 1) {
          game.balls.splice(i, 1);
        } else {
          ball.x = GAME_WIDTH / 2; ball.y = GAME_HEIGHT / 2;
          ball.dx = -BALL_SPEED; ball.dy = BALL_SPEED;
          ball.explosive = false;
        }
      }

      //testing
      // if(ball.x < 0 || ball.x > GAME_WIDTH){
      //   ball.dx *= -1;
      //   ball.dy *= -1;
      // }
    }
    
    
    if (game.score1 >= WIN_SCORE || game.score2 >= WIN_SCORE) {
      const winner = game.score1 >= WIN_SCORE ? 1 : 2;
      io.to(roomId).emit('gameOver', { winner });
      delete games[roomId]; // stop updating this room
      continue; // skip the gameState emit below for this now-deleted room
    }

    

    io.to(roomId).emit('gameState', game);
  }
}, 1000 / 60);

