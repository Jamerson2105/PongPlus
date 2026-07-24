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