const express = require('express');
const userController = require('../controllers/userController');
const gameController = require('../controllers/gameController');
const { getUserByUsername } = require('../models/users/userModel');
const playerController = require('../controllers/playerController');
const router = express.Router();

// User routes
router.post('/register', async (request, response) => {
  try {
    // check if request has necessary fields
    if (
      !('username' in request.body) ||
      !('email'    in request.body) ||
      !('password' in request.body)
    ) {
      response.status(400).json({ message: "Information missing." })
    }

    const { username, email, password } = request.body;

    const newUser = await userController.createUser(
      username,
      email,
      password
    );

    if (!newUser) {
      throw new Error("Failed to create user");
    }
    
    request.session.user = {
      user_id: newUser.user_id,
      username: newUser.username,
      email: newUser.email
    };

    response.redirect("/user/lobby");
  }
  catch (error) {
    response.status(500).json({ message: error.message });
  }
});

router.post('/login', async (request, response) => {
  try {

    if (
      !("email"    in request.body) ||
      !("password" in request.body)
    ) {

      response.status(400).json({ message: "Information missing." });
    }

    const { email, password } = request.body;
    
    let user = await userController.login(email, password);

    if (!user) {
      throw new Error("Could not log in.");
    }

    const { userId, username } = user;

    request.session.user = {
      user_id: userId,
      username: username,
      email: email
    };
    
    request.session.user = user;
    response.redirect("/user/lobby");
  }
  catch (error) {
    console.log("login error: ", error.message);
    response.render("login");
  }
});

// we will handle the authMiddleware part differently
router.post('/logout', userController.logout);

// Front-end routes
router.get('/register',(_req, res) => {
  res.render('register');
});

router.get('/login', (_req, res) => {
  res.render('login', {user: res.locals.user});
});

router.get('/lobby', async (request, response) => {
  if (request.session?.player?.playerId) {
    // If this block executes, it just means that the player 
    // has just returned from a game and no longer need their 
    // playerId
    // playerController.removePlayer(request.session.player.playerId)
    request.session.player = null;
  }

  const games = await gameController.getAllGames();
  if (!games) {
    console.log("Problem will rogers");
  }

  response.render('lobby', { games: games } );
});

module.exports = router;
