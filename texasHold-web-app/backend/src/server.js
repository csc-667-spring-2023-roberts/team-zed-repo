const path = require("path");
require("dotenv").config();

const express      = require("express");
const session      = require("express-session");
const pgSession    = require("connect-pg-simple")(session);
const db           = require("./database/connection.js");
const cookieParser = require("cookie-parser");

const userRoutes   = require("./router/userRoutes");
const gameRoutes   = require("./router/gamesRoutes");
const root         = require("./router/root");
const playerRoutes = require("./router/playerRoutes");
const chatRoutes   = require("./router/chatRoutes");
const pokerRoutes  = require("./router/pokerRoutes");

const app = express();
const PORT = process.env.PORT | 3000;

// view engine setup
app.set("views", path.join(__dirname, "../../frontend/src/public/views"));

app.set("view engine", "ejs");

// Serve static files for front end

app.use(express.static(path.join(__dirname, "../../frontend/src/public/")));

app.use(cookieParser());

const sessionMiddleware = session({
  store: new pgSession({
    pgPromise: db,
    createTableIfMissing: true,
  }),
  secret: process.env.SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 },
});

const initSockets = require("./sockets/init.js");

// middleware
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(sessionMiddleware);

const server = initSockets(app, sessionMiddleware);

server.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
});

app.head('/*', function(req, res, next){ 
  res.setHeader('Last-Modified', (new Date()).toUTCString());
  next(); 
});

app.use("/", root);
app.use("/user", userRoutes);
app.use("/game", gameRoutes);
app.use("/player", playerRoutes);
app.use("/chat", chatRoutes);
app.use("/poker", pokerRoutes);

// Move customErrorHandler here, after the routes

//Creates database
const exp = require("constants");
const { env } = require("process");

const result = {};
