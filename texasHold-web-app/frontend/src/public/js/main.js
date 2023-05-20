import socket from "./common/index.js";

const loginForm = document.getElementById("login-form");
const messageForm = document.getElementById("send-container");
const messageInput = document.getElementById("message-input");

socket.on("error", function (err) {
  console.log(err);
});

socket.on("GAME_STARTING", function (destination) {
  window.location.href = destination;
});

socket.on("CHAT_MESSAGE", ({ username, message }) => {
  console.log("message recieved");
  appendMessage(`${username}: `, `${message}`);
});

socket.on("GAME_UPDATE", ({ username, action, gameData }) => {
  console.log(username + " performed " + action);
  console.log("New game data fetched");
  appendMessage(`Server: `, `${action} from ${username}`);
});

socket.on("SESSION_ERROR", () => {
  console.log("SESSION_ERROR");
  appendMessage(`Server: `, `Browser session error`);
});

socket.on("PLAYER_JOINED", ({ username }) => {
  console.log(username + " connected ");
  appendMessage(`${username} `, `connected`);
});

socket.on("PLAYER_LEFT", ({ username }) => {
  console.log(username + " disconnected ");
  appendMessage(`${username} `, `disconnected`);
});

//Chat event
messageForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const message = messageInput.value;

  fetch("/chat/0", {
    method: "post",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  });

  messageInput.value = "";
});

function appendMessage(username, message) {
  const chatDiv = document.getElementById("chat-view");
  const newMessageDiv = document.createElement("div");
  if (message === `connected`) {
    newMessageDiv.style = "color:green;font-size: 16px; padding-bottom: 2px;";
  } else if (message === `disconnected`) {
    newMessageDiv.style = "color:red;font-size: 16px; padding-bottom: 2px;";
  } else if (username === `Server: `) {
    newMessageDiv.style = "color:orange;font-size: 16px; padding-bottom: 2px;";
  } else {
    newMessageDiv.style = "font-size: 16px; padding-bottom: 2px;";
  }

  const newMessageText = document.createTextNode(`${username}${message}`);
  newMessageDiv.appendChild(newMessageText);
  chatDiv.prepend(newMessageDiv);
}

function clearChat() {
  const chatDiv = document.getElementById("chat-view");
  chatDiv.innerHTML = "";
}

socket.on("CARDS_DEALT", ({ playername, amount }) => {
  // remove the current cards being displayed
  //
});

socket.on("FOLD", ({ playername, amount }) => {
  // Update the frontend indicateing that the player has bet
});

socket.on("BET", ({ playername, amount }) => {
  // Update the frontend indicateing that the player has bet
});