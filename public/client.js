const socket = io();

const statusEl = document.getElementById('status');
let playerNumber = null;
let currentRoomId = null;
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

//main ui elems
const menuEl = document.getElementById('main-menu');
const gameContainerEl = document.getElementById('game-container');
const winScreenEl = document.getElementById('win-screen');
const winMessageEl = document.getElementById('win-message');
const playButton = document.getElementById('play-button');
const rematchButton = document.getElementById('rematch-button');
const menuButton = document.getElementById('menu-button');
const statusBarEl = document.getElementById('status-bar');

//play against friend ui elems
const playFriendButton = document.getElementById('play-friend-button');
const privateMenuEl = document.getElementById('private-menu');
const privateChoiceEl = document.getElementById('private-choice');
const createRoomButton = document.getElementById('create-room-button');
const joinRoomButton = document.getElementById('join-room-button');
const createRoomPanel = document.getElementById('create-room-panel');
const joinRoomPanel = document.getElementById('join-room-panel');
const roomCodeDisplay = document.getElementById('room-code-display');
const privateStatus = document.getElementById('private-status');
const roomCodeInput = document.getElementById('room-code-input');
const submitCodeButton = document.getElementById('submit-code-button');
const privateError = document.getElementById('private-error');
const privateBackButton = document.getElementById('private-back-button');



//particles
let particles = [];
function spawnParticles(x, y, color = 'white') {
  for (let i = 0; i < 12; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 1 + Math.random() * 3;
    particles.push({
      x, y,
      dx: Math.cos(angle) * speed,
      dy: Math.sin(angle) * speed,
      life: 20, // frames until it disappears
      color
    });
  }
}

function updateAndDrawParticles(rgb) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.dx;
    p.y += p.dy;
    p.life--;

    if (p.life <= 0) {
      particles.splice(i, 1);
      continue;
    }

    ctx.globalAlpha = p.life / 20;//fade out
    ctx.fillStyle = p.color; //use particles on color
    ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
    ctx.globalAlpha = 1;//nothing drawn after stays faded
  }
}

//draw teleport gates
const TELEPORT_GATE_SIZE = 54;
function drawTeleportGates(gates) {
  const time = performance.now() / 1000; // seconds, used to drive rotation

  gates.forEach(gate => {
    ctx.save();
    ctx.translate(gate.x, gate.y);


    // Inner spiral — a curling line that rotates 
    ctx.rotate(time * 4); 
    ctx.strokeStyle = 'magenta';
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let a = 0; a < Math.PI * 3; a += 0.2) {
      const r = (a / (Math.PI * 3)) * (TELEPORT_GATE_SIZE );
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      if (a === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    ctx.restore();
  });
}

function updateStatusBar(game) {
  const effects = [];


  if (game.paddle1.bigTimer > 0) {
    effects.push({
      label: `P1: BIG PADDLE`,
      seconds: (game.paddle1.bigTimer / 60).toFixed(1),
      percent: (game.paddle1.bigTimer / POWERUP_EFFECT_DURATION_CLIENT) * 100,
      desc: POWERUP_DESCRIPTIONS.bigPaddle
    });
  }
  if (game.paddle2.bigTimer > 0) {
    effects.push({
      label: `P2: BIG PADDLE`,
      seconds: (game.paddle2.bigTimer / 60).toFixed(1),
      percent: (game.paddle2.bigTimer / POWERUP_EFFECT_DURATION_CLIENT) * 100,
      desc: POWERUP_DESCRIPTIONS.bigPaddle
    });
  }
  if (game.ballSpeedEffect.type) {
    const type = game.ballSpeedEffect.type === 'fast' ? 'fastBall' : 'slowBall';
    effects.push({
      label: game.ballSpeedEffect.type === 'fast' ? 'FAST BALL' : 'SLOW BALL',
      seconds: (game.ballSpeedEffect.timer / 60).toFixed(1),
      percent: (game.ballSpeedEffect.timer / POWERUP_EFFECT_DURATION_CLIENT) * 100,
      desc: POWERUP_DESCRIPTIONS[type]
    });
  }
  if (game.teleportGatesTimer > 0) {
    effects.push({
      label: 'TELEPORT GATES',
      seconds: (game.teleportGatesTimer / 60).toFixed(1),
      percent: (game.teleportGatesTimer / TELEPORT_GATE_LIFETIME_CLIENT) * 100,
      desc: POWERUP_DESCRIPTIONS.teleportGate
    });
  }

  const anyExplosive = game.balls.some(ball => ball.explosive);
  if (anyExplosive) {//explosive bounce description shows up if any balls are explosive
    effects.push({
      label: 'EXPLOSIVE BOUNCE',
      seconds: null,
      percent: 100,
      desc: POWERUP_DESCRIPTIONS.explosiveBounce,
      indefinite: true
    });
  }

  statusBarEl.innerHTML = effects.map(e => `
    <div class="effect-row">
      <span class="effect-label">${e.label}${e.seconds !== null ? ` (${e.seconds}s)` : ''}</span>
      <div class="effect-bar-track">
        <div class="effect-bar-fill ${e.indefinite ? 'effect-bar-indefinite' : ''}" style="width: ${Math.max(0, Math.min(100, e.percent))}%"></div>
      </div>
      <span class="effect-desc">${e.desc}</span>
    </div>
  `).join('');
}

//ui logic
playButton.addEventListener('click', () => {
  menuEl.style.display = 'none';
  gameContainerEl.style.display = 'block';
  socket.emit('findMatch');
  ctx.clearRect(0,0,GAME_WIDTH,GAME_HEIGHT);
  statusEl.textContent = `ID = ${socket.id}, Connecting with another player...`;
});

rematchButton.addEventListener('click', () => {
  socket.emit('requestRematch');
  rematchButton.textContent = 'REQUESTED';
  rematchButton.disabled = true;
});

menuButton.addEventListener('click', () => {
  socket.emit('leaveToMenu');
  winScreenEl.style.display = 'none';
  gameContainerEl.style.display = 'none';
  menuEl.style.display = 'flex';
  statusEl.textContent = 'Connected!';
});

playFriendButton.addEventListener('click', () => {
  menuEl.style.display = 'none';
  privateMenuEl.style.display = 'flex';
});

privateBackButton.addEventListener('click', () => {
  privateMenuEl.style.display = 'none';
  privateChoiceEl.style.display = 'flex';
  createRoomPanel.style.display = 'none';
  joinRoomPanel.style.display = 'none';
  privateError.textContent = '';
  menuEl.style.display = 'flex';
});

createRoomButton.addEventListener('click', () => {
  privateChoiceEl.style.display = 'none';
  createRoomPanel.style.display = 'block';
  socket.emit('createPrivateRoom');
});

joinRoomButton.addEventListener('click', () => {
  privateChoiceEl.style.display = 'none';
  joinRoomPanel.style.display = 'flex';
});

submitCodeButton.addEventListener('click', () => {
  const code = roomCodeInput.value.trim().toUpperCase();
  if (code.length === 0) return;
  privateError.textContent = '';
  socket.emit('joinPrivateRoom', code);
});

//game properties, make sure they have the EXACT values as server.js or else ur cooked
const GAME_WIDTH = 800;
const GAME_HEIGHT = 400;
const PADDLE_HEIGHT = 80;
const PADDLE_WIDTH = 10;
const PADDLE_SPEED = 6;
const PADDLE_EDGE_DIST = 20;
const BALL_SIZE = 10;
const BALL_SPEED = 4;

//powerup properties
const POWERUP_SIZE = 20;
const BIG_PADDLE_HEIGHT = 160;       
const FAST_BALL_MULTIPLIER = 1.8;    
const SLOW_BALL_MULTIPLIER = 0.5; 
const POWERUP_LABEL_FONT_SIZE = 8;
const POWERUP_EFFECT_DURATION_CLIENT = 300; // must match server's POWERUP_EFFECT_DURATION
const TELEPORT_GATE_LIFETIME_CLIENT = 600;//match with servers value again

const POWERUP_LABELS = {
  multiBall: 'MULTIBALL',
  bigPaddle: 'BIG PADDLE',
  fastBall: 'FAST',
  slowBall: 'SLOW',
  explosiveBounce: 'BOOM BALL',
  teleportGate: 'PORTAL'
};

const POWERUP_DESCRIPTIONS = {
  multiBall: 'Splits the ball into three.',
  bigPaddle: 'Enlarges the collector\'s paddle.',
  fastBall: 'Speeds up every ball in play.',
  slowBall: 'Slows down every ball in play.',
  explosiveBounce: 'Ball gains speed and bursts on every bounce.',
  teleportGate: 'Two portals teleport any ball.'
};


//draws game
function drawGame(game){
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    ctx.fillStyle = 'white';
    ctx.fillRect(PADDLE_EDGE_DIST, game.paddle1.y, PADDLE_WIDTH, game.paddle1.height);
    ctx.fillRect(GAME_WIDTH - PADDLE_EDGE_DIST, game.paddle2.y, PADDLE_WIDTH, game.paddle2.height);
    game.balls.forEach(ball => {
      ctx.fillStyle = ball.explosive ? 'orange':'white';//color explosive balls orange and normal balls white
      ctx.fillRect(ball.x - BALL_SIZE / 2, ball.y - BALL_SIZE / 2, BALL_SIZE, BALL_SIZE);
    });
    ctx.fillStyle = 'white'; // reset for anything drawn after (paddles are drawn earlier, so this mainly protects future additions)
    updateAndDrawParticles();
    drawTeleportGates(game.teleportGates);
    game.powerUps.forEach(powerUp => drawPowerUp(powerUp)); // drawn last, so its color can't leak onto anything else

    document.getElementById('player-score').textContent = game.score1;
    document.getElementById('computer-score').textContent = game.score2;

   
}

//draws powerups on canvas
function drawPowerUp(powerUp){
  if(!powerUp) return;

  console.log('drawPowerUp is running, drawing:', powerUp.type, 'at', powerUp.x, powerUp.y); 

  const cx = powerUp.x + POWERUP_SIZE / 2;//center of the powerup values
  const cy = powerUp.y + POWERUP_SIZE / 2;

  ctx.fillStyle =//fill powerup color based on powerup type
    powerUp.type === 'multiBall' ? 'cyan' :
    powerUp.type === 'bigPaddle' ? 'lime' :
    powerUp.type === 'fastBall'  ? 'red' :
    powerUp.type === 'slowBall'  ? 'blue':
    powerUp.type === 'explosiveBounce' ? 'orange':
    'purple'//explosive gate

  if (powerUp.type === 'multiBall') {
    // circle
    ctx.beginPath();
    ctx.arc(cx, cy, POWERUP_SIZE / 2, 0, Math.PI * 2);
    ctx.fill();
  } else if (powerUp.type === 'bigPaddle') {
    // square
    ctx.fillRect(powerUp.x, powerUp.y, POWERUP_SIZE, POWERUP_SIZE);
  } else if (powerUp.type === 'fastBall') {
    // triangle pointing up
    ctx.beginPath();
    ctx.moveTo(cx, powerUp.y);
    ctx.lineTo(powerUp.x, powerUp.y + POWERUP_SIZE);
    ctx.lineTo(powerUp.x + POWERUP_SIZE, powerUp.y + POWERUP_SIZE);
    ctx.closePath();
    ctx.fill();
  } else if(powerUp.type === 'slowBall'){
    // slowBall — triangle pointing down
    ctx.beginPath();
    ctx.moveTo(cx, powerUp.y + POWERUP_SIZE);
    ctx.lineTo(powerUp.x, powerUp.y);
    ctx.lineTo(powerUp.x + POWERUP_SIZE, powerUp.y);
    ctx.closePath();
    ctx.fill();
  } else if(powerUp.type === 'explosiveBounce'){
    ctx.beginPath();
    ctx.moveTo(cx, powerUp.y);
    ctx.lineTo(cx + POWERUP_SIZE * 0.15, cy - POWERUP_SIZE * 0.15);
    ctx.lineTo(powerUp.x + POWERUP_SIZE, cy);
    ctx.lineTo(cx + POWERUP_SIZE * 0.15, cy + POWERUP_SIZE * 0.15);
    ctx.lineTo(cx, powerUp.y + POWERUP_SIZE);
    ctx.lineTo(cx - POWERUP_SIZE * 0.15, cy + POWERUP_SIZE * 0.15);
    ctx.lineTo(powerUp.x, cy);
    ctx.lineTo(cx - POWERUP_SIZE * 0.15, cy - POWERUP_SIZE * 0.15);
    ctx.closePath();
    ctx.fill();
  } else if(powerUp.type === 'teleportGate') {
    // two concentric rings — portal icon
    ctx.lineWidth = 3;
    ctx.strokeStyle = ctx.fillStyle;
    ctx.beginPath();
    ctx.arc(cx, cy, POWERUP_SIZE / 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, POWERUP_SIZE / 4, 0, Math.PI * 2);
    ctx.stroke();
  }
  //draw labels under the shapes
  ctx.font = `${POWERUP_LABEL_FONT_SIZE}px 'Press Start 2P', monospace`;
  ctx.fillStyle = 'white';
  ctx.textAlign = 'center';
  ctx.fillText(POWERUP_LABELS[powerUp.type], cx, powerUp.y + POWERUP_SIZE + 12);
}

//function for shake screen effect
function shakeScreen(duration = 300, magnitude = 8) {
  const startTime = performance.now();

  function animate(time) {
    const elapsed = time - startTime;
    if (elapsed < duration) {
      const progress = elapsed / duration;
      const currentMagnitude = magnitude * (1 - progress); // shake fades out over time
      const dx = (Math.random() * 2 - 1) * currentMagnitude;
      const dy = (Math.random() * 2 - 1) * currentMagnitude;
      canvas.style.transform = `translate(${dx}px, ${dy}px)`;
      requestAnimationFrame(animate);
    } else {
      canvas.style.transform = 'translate(0px, 0px)'; // snap back to normal
    }
  }

  requestAnimationFrame(animate);
}

//event listeners

socket.on('connect', ()=> {
    console.log('Connected to server with id: ', socket.id );
    statusEl.textContent = ` Your ID: ${socket.id}`;
});

socket.on('disconnect', () => {
console.log('Disconnected from server');
statusEl.textContent = 'Disconnected.';    

});

socket.on('startGame', ({roomId, playerNumber:num}) => {
    currentRoomId = roomId;
    playerNumber = num;
    document.getElementById('player-label').textContent = `You are Player ${playerNumber}`;
    winScreenEl.style.display = 'none';
    menuEl.style.display = 'none';
    statusEl.textContent = `ID =  ${socket.id}`;
    privateMenuEl.style.display = 'none';
    gameContainerEl.style.display = 'block';
    document.getElementById('player-score').textContent = '0';
    document.getElementById('computer-score').textContent = '0';
});

socket.on('gameState', (game) => {
    drawGame(game);
    updateStatusBar(game);
});

document.addEventListener('keydown', (e) => { //if key is pressed
  if (e.key === 'ArrowUp' || e.key === 'w') socket.emit('paddleMove', 'up');
  else if (e.key === 'ArrowDown' || e.key === 's') socket.emit('paddleMove', 'down');
});

document.addEventListener('keyup', (e) => {
  if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'ArrowDown' || e.key === 's') {
    socket.emit('paddleMove', 'stop');
  }
});

socket.on('gameOver', ({ winner }) => {
  gameContainerEl.style.display = 'none';
  winScreenEl.style.display = 'flex';
  winMessageEl.textContent = (winner === playerNumber) ? 'You Win!' : 'You Lose!';
  document.getElementById('player-score').textContent = '0';
  document.getElementById('computer-score').textContent = '0';
  rematchButton.textContent = 'Rematch';
  rematchButton.disabled = false;
});

socket.on('opponentLeft', () => {
  winScreenEl.style.display = 'none';
  gameContainerEl.style.display = 'none';
  menuEl.style.display = 'flex';
  statusEl.textContent = 'Opponent left. Returned to menu.';
});

socket.on('waitingForRematch', () => {
  statusEl.textContent = 'Waiting for opponent to accept rematch...';
});

socket.on('ballScored', () => {//shake screen everytime someone scores
  shakeScreen();
});

//private room logic

socket.on('privateRoomCreated', ({ code }) => {
  roomCodeDisplay.textContent = code;
  privateStatus.textContent = 'Share this code — waiting for opponent...';
});

socket.on('privateRoomError', (message) => {
  privateError.textContent = message;
});

socket.on('explosiveBounce', ({ x, y }) => {
  spawnParticles(x, y, 'orange');
});

socket.on('ballTeleported', ({ x, y }) => {
  spawnParticles(x, y, 'purple'); 
});