const pgarray          = require("pg-array");
const gameModel        = require("../models/gameModel");
const playerModel      = require("../models/playerModel");
const playerController = require("./playerController");
const gameController   = require("./gameController");
pokerController        = {};

pokerController.isPlayerDead = async (gameId, playerId) => {
    const players = await playerModel.getAllPlayers(gameId);

    for (let i = 0; i < players.length; i++) {
        if (players[i].player_id == playerId) {
            return false;
        }
    }

    return true;
}

/**
 * return 1 on game over
 */
pokerController.endOfRoundNonsense = async (gameId, io) => {
    await pokerController.nextTurn(gameId);

    if (await pokerController.roundOver(gameId)) {

        let gameInfo = await gameModel.getGameData(gameId);

        while (gameInfo.communitycards.length < 5) {

            await pokerController.dealCardToCommunity(gameId, io);

            gameInfo = await gameModel.getGameData(gameId);
        }

        let players = await playerModel.getAllPlayers(gameId);
        const communityCards = (await gameModel.getGameData(gameId)).communitycards;
        
        players.sort((playerA, playerB) => {
            const scoreA = pokerController.ratePlayerHand(playerA.hand, communityCards);
            const scoreB = pokerController.ratePlayerHand(playerB.hand, communityCards);

            console.log(scoreA, scoreB);

            if (scoreA > scoreB) {
              return -1;
            }
            else if (scoreA < scoreB) {
              return 1;
            }
            else {
                return 0;
            }
        });

        await pokerController.distributeWinnings(gameId);

        await pokerController.removeDeadPlayers(gameId, io);
        
        await pokerController.clearCards(gameId, io);

        await pokerController.dealCardsToPlayers(gameId, io);

        await pokerController.unfoldPlayers(gameId);

        let newDealer = await gameController.incrementDealer(gameId);
        await gameModel.setTurn(gameId, newDealer);

        await gameController.incrementRound(gameId);

        if (await pokerController.isGameOver(gameId)) {
            return 1;
        }
    }
    if (await pokerController.isNewCycle(gameId)) {
        let gameInfo = await gameModel.getGameData(gameId);
        if (gameInfo.communitycards.length < 5) {

            await pokerController.dealCardToCommunity(gameId, io);

            gameInfo = await gameModel.getGameData(gameId);
        }
    }
    return 0;
}

pokerController.removeDeadPlayers = async (gameId, io) => {
    const players = await playerModel.getAllPlayers(gameId);
    
    for (let i = 0; i < players.length; i++) {
        if (players[i].chips == 0) {
            await playerModel.removePlayer(players[i].player_id);

            io.in(parseInt(gameId)).emit("PLAYER_LOST", {
                // info passed to clients goes here
                playerId: players[i].player_id
            });
        }
    }
}

pokerController.distributeWinnings = async (gameId) => {
    let players = await playerModel.getAllPlayers(gameId);
    let winnings = players[0].curr_bet;
        
    for (let i = 1; i < players.length; i++) {
        if (players[0].curr_bet - players[i].curr_bet < 0) {
            winnings += players[i].curr_bet;
                
            players[i].curr_bet = 0;
        }
        else if (players[0].curr_bet - players[i].curr_bet > 0) {
            winnings += players[0].curr_bet;
                
            players[i].curr_bet -= players[0].curr_bet;
            players[i].chips    += players[i].curr_bet;
            players[i].curr_bet  = 0;
        }
        else {
            winnings += players[0].curr_bet;
                
            players[i].curr_bet = 0;
        }
    }

    players[0].curr_bet = 0;
    players[0].chips += winnings;

    for (let i = 0; i < players.length; i++) {
        await playerModel.setChipsAndBet(players[i].player_id, players[i].chips, players[i].curr_bet);
    }
}

pokerController.canPlayerMove = async (playerId) => {
    if (await playerController.isPlayerFolded(playerId)) {
        return false;
    }
    
    if (!(await playerController.isPlayersTurn(playerId))) {
        return false;
    }

    if (await playerController.isPlayerAllIn(playerId)) {
        return false;
    }

    return true;
}

pokerController.handleBlindBets = async (gameId, playerId) => {
    const gameInfo = await gameModel.getGameData(gameId);
    const players  = await playerModel.getAllPlayers(gameId);
    const minBet   = gameInfo.min_bet;

    if (gameInfo.curr_turn > players.length) {
        return;
    }

    if (await  playerController.isBigBlind(gameId, playerId)) {
        
        await pokerController.bet(
            gameId,
            playerId,
            minBet
        );
    }
    
    if (await playerController.isSmallBlind(gameId, playerId)) {
        console.log(`player is ${playerId} small blind!`);

        await pokerController.bet(
            gameId,
            playerId,
            minBet / 2
        );
    }
}

pokerController.getPotSize = async (gameId) => {
    const players = await playerModel.getAllPlayers(gameId);
    let potSize   = 0;

    for (let i = 0; i < players.length; i++) {
        potSize += players[i].curr_bet;
    }

    return potSize;
}

pokerController.clearCards = async (gameId, io) => {
    let players = await playerModel.getAllPlayers(gameId);
    
    for (let i = 0; i < players.length; i++) {
        await playerModel.setHand(players[i].player_id, []);
    }

    await gameModel.setCommunityCards(gameId, []);

    io.in(parseInt(gameId)).emit("NEW_COMMUNITY_CARDS", {
        // info passed to clients goes here
        communityCards: (await gameModel.getGameData(gameId)).communitycards
    });
}

pokerController.dealCardsToPlayers = async (gameId, io) => {
    console.log('dealing cards to players!');
    let players = await playerModel.getAllPlayers(gameId);

    for (let i = 0; i < players.length; i++) {
        let newHand = [
            await gameModel.popCardOffDeck(gameId),
            await gameModel.popCardOffDeck(gameId)
        ];
        const newHandStr = JSON.stringify(newHand);
        await playerModel.setHand(
            players[i].player_id, 
            pgarray(newHandStr.substring(1, newHandStr.length - 1))
        );
    }

    io.in(parseInt(gameId)).emit("NEW_HAND", {
        // info passed to clients goes here
        baseUrl: process.env.API_BASE_URL,
        gameId: gameId
    });
}

pokerController.dealCardToCommunity = async (gameId, io) => {
    let gameInfo = await gameModel.getGameData(gameId);
    const card   = await gameModel.popCardOffDeck(gameId);

    gameInfo.communitycards.push(
        card
    );

    const communityCardStr = JSON.stringify(gameInfo.communitycards);

    await gameModel.setCommunityCards(
        gameId,
        pgarray(
            communityCardStr.substring(1, communityCardStr.length - 1)
        )
    );

    io.in(parseInt(gameId)).emit("NEW_COMMUNITY_CARDS", {
        // info passed to clients goes here
        communityCards: (await gameModel.getGameData(gameId)).communitycards
    });
}

pokerController.getIndexOfPlayerId = async (gameId, playerId) => {
    const gameInfo = await gameModel.getGameData(gameId);
    
    for (let i = 0; i < gameInfo.players.length; i++) {
        if (gameInfo.players[i].player_id == playerId) {
            return i;
        }
    }

    return -1;
}

pokerController.getHighestBet = async (gameId) => {
    const players = await playerModel.getAllPlayers(gameId);
    const gameData = await gameModel.getGameData(gameId);
    let highestBet = 0;
    for (let i = 0; i < players.length; i++) {
        let currBet = players[i].curr_bet;
        let playerId = players[i].player_id;

        if (await playerController.isBigBlind(gameId, playerId)) {
            currBet = Math.max(0, currBet -= gameData.min_bet);
        }
        else if (await playerController.isSmallBlind(gameId, playerId)) {
            currBet = Math.max(0, currBet -= gameData.min_bet / 2);
        }

        if (currBet > highestBet) {
            highestBet = currBet
        }
    }

    return highestBet;
}

pokerController.bet = async (gameId, playerId, amount) => {
    let playerInfo = await playerModel.getPlayerData(playerId);

    if (playerInfo.game_id != gameId) {
        throw new Error("Player not in game.");
    }

    if (playerInfo.chips < amount) {
        amount = playerInfo.chips;
    }

    playerInfo.chips    -= amount;
    playerInfo.curr_bet += amount;

    if (playerInfo.chips == 0) {
        await playerModel.setToAllIn(playerId);
        console.log(`${playerId} all in: ${await playerController.isPlayerAllIn(playerId)}`);
    }
    
    await playerModel.setChipsAndBet(playerId, playerInfo.chips, playerInfo.curr_bet);
}

pokerController.nextTurn = async (gameId) => {
    let playerId = await gameController.getCurrentPlayer(gameId);
    let players  = await playerModel.getAllPlayers(gameId);

    await gameController.incrementTurn(gameId);
    playerId = await gameController.getCurrentPlayer(gameId);
    
    for (let i = 0; i < players.length; i++) {
        if (
            (await playerController.isPlayerFolded(playerId)) ||
            (await playerController.isPlayerAllIn(playerId))
        ) {
            await gameController.incrementTurn(gameId);
            playerId = await gameController.getCurrentPlayer(gameId);
            
            continue;
        }
        
        break;
    }
}

pokerController.unfoldPlayers = async (gameId) => {
    let players = await playerModel.getAllPlayers(gameId);

    for (let i = 0; i < players.length; i++) {
        await playerModel.setToOther(players[i].player_id);
    }
}

pokerController.roundOver = async (gameId) => {
    const players  = await playerModel.getAllPlayers(gameId);
    let remaining  = players.length;
    const gameInfo = await gameModel.getGameData(gameId);
    let called     = 0;
    let allIn      = 0;
    
    // console.log("players:", players)
    for (let i = 0; i < players.length; i++) {
        if (await playerController.isPlayerFolded(players[i].player_id)) {
            remaining--;
        }
        else if (await playerController.isPlayerCalled(players[i].player_id)) {
            called++;
        }
        else if (await playerController.isPlayerAllIn(players[i].player_id)) {
            allIn++;
        }
    }
    
    return (
        (remaining <= 1) || 
        ((allIn + called == remaining) && (gameInfo.curr_round >= players.length)) ||
        (allIn == remaining)
    );
}

pokerController.isNewCycle = async (gameId) => {
    const gameInfo = await gameModel.getGameData(gameId);
    const players  = await playerModel.getAllPlayers(gameId);

    return (
        ((gameInfo.curr_turn - gameInfo.curr_dealer) % players.length == 0) &&
        ((gameInfo.curr_turn - gameInfo.curr_dealer) >= players.length)
    );
}

getScore = (bigRank, littleRank) => {
    return Math.pow(2, (bigRank * 13)) + (bigRank * littleRank);
}

pokerController.ratePlayerHand = (handCards, communityCards) => {
    let score             = 0; 
    let rankCounter       = [ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0 ];
    let suitCounter       = [ 0, 0, 0, 0 ];
    let straightPossible  = true;
    let fullHousePossible = 0;
    let allCards          = communityCards.concat(handCards);
    
    for (let i = 0; i < allCards.length; i++) {
        rankCounter[allCards[i] % 13]++;
        suitCounter[Math.trunc(allCards[i] / 13)]++;
    }

    for (let i = 0; i < handCards.length; i++) {
        if (
            (rankCounter[handCards[i] % 13] > 1) ||
            (suitCounter[handCards[i] / 13] > 4)
        ) {
            // don't do anything
        }
        else {
            score += getScore(1, handCards[i] % 13);
        }
    }

    for (let k = rankCounter.length - 1; k >= 0; k--) {
        if (rankCounter[k] == 2) {
            // PAIR DETECTED!!!
            if (fullHousePossible == 3) {
                // FULL HOUSE DETECTED!!!
                score += getScore(7, k);
            }
            fullHousePossible = 2;

            score += getScore(2, k);
        }
        else if (rankCounter[k] == 3) {
            if (fullHousePossible == 2) {
                // FULL HOUSE DETECTED!!!
                score += getScore(7, k);
            }
            fullHousePossible = 3;
            straightPossible  = false

            score += getScore(3, k);
        }
        else if (rankCounter[k] == 4) {
            // FOUR OF A KIND DETECTED!!!
            score += getScore(8, k);

            fullHousePossible = false;
            straightPossible  = false;
        }
    }

    let straightHappened = false;
    if (straightPossible) {
        let contiguous = 0;
        for (let i = rankCounter.length - 2; i >= 0; i--) {
            if (rankCounter[i] > 0 && rankCounter[i + 1] > 0) {
                contiguous++;
            }
            else {
                contiguous = 0;
            }

            if (contiguous > 3) {
                // STRAIGHT DETECTED!!!
                score += getScore(4, i);
                straightHappened = true;
                break;
            }
        }
    }
    
    // check for flushes
    for (let j = 0; j < suitCounter.length; j++) {
        if (suitCounter[j] > 4) {
            // FLUSH DETECTED!!!
            score += getScore(5, 1);

            if (straightHappened) {
                score += getScore(9, 2);
            }
        }
    }

    return score;
}

pokerController.isGameOver = async (gameId) => {
    const gameInfo = await gameModel.getGameData(gameId);
    const players  = await playerModel.getAllPlayers(gameId);

    let allIn = 0;
    for (let i = 0; i < players.length; i++) {
        if (playerController.isPlayerAllIn(players[i].player_id)) {
            allIn++;
        }
    }

    return (gameInfo.curr_round >= gameInfo.num_rounds) || (players.length <= 1) || (allIn == players.length);
}

module.exports = pokerController;