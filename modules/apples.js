const playStates = {
    INACTIVE: 'inactive',
    FORMING: 'forming',
    PLAYING: 'playing',
}

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

function sendHands(users, judge, hands, players) {
    for (let i = 0; i < players.length; i++) {
        const cardsString = `\`\`\`Your available cards:\n`;
        let j = 1;
        for (const card of hands[players[i]]) {
            cardString += `${j}) ` + card + '\n';
            j++;
        }
        cardString += judge === i ? '```\n You are the judge, you will not be playing cards this round.' : '```\n If you want to select a card, use !pick #';

        users.fetch(players[i]).then(user => {
            user.send(cardsString);    
        });
    } 
}

class ApplesModule {
    constructor(context) {                
        this.dispatch = context.dispatch;
        this.config = context.config;
        this.client = context.client;
        this.players = [];
        this.gameState = playStates.INACTIVE;
        this.formTimer = null;
        this.cards = [];
        this.judge = 0;
        this.hands = {};
        this.scores = [];
        this.cardsAvailable = [];
        this.selections = {};
        this.hasSelected = {};
        this.canJudge = false;

        this.dispatch.hook('!start', (message) => {
            if (this.gameState !== playStates.INACTIVE) {
                return message.channel.send('There is already a game going on!');
            }

            this.gameState = playStates.FORMING;
            this.players.push(message.author.id);
            message.channel.send('Game forming! Use !join to join!');
            this.formTimer = setTimeout(() => {
                if (this.players.length < 3) {
                    return message.channel.send('Not enough players joined! You need at least 3.');
                }
                this.gameState = playStates.PLAYING;
                shuffleArray(this.players);
                this.cardsAvailable = shuffleArray(this.cards);

                for (let i = 0; i < this.players.length; i++) {
                    this.scores.push(0);
                    this.hands[this.players[i]] = this.cardsAvailable.splice(0, 5);
                    this.hasSelected[this.players[i]] = this.players[i] === this.players[this.judge] ? true : false;
                }

                sendHands(this.client.users, this.judge, this.hands, this.players);
            }, 60000);
        });

        this.dispatch.hook('!join', (message) => {
            if (this.gameState !== playStates.FORMING) {
                return message.channel.send('There is currently not a game forming!');
            }

            if (this.players.includes(message.author.id)) {
                return message.channel.send('You are already in this game!');
            }

            if (this.players.length >= 10) {
                return message.channel.send('The game is full!');
            }

            message.channel.send(`${message.author.username} has joined the game!`);
            this.players.push(message.author.id);
        });

        this.dispatch.hook('!pick', (message) => {
            this.botSpeakChannel = this.config.get('bot-speak-channel');
            const author = message.author.id;
            if (
                    this.gameState !== playStates.PLAYING || 
                    !this.players.includes(author) || 
                    message.channel.type !== 'dm' || 
                    this.players[judge] === author ||
                    this.hasSelected[author]
                ) {
                return;
            }
            const selection = parseInt(message.content.slice('!pick'.length).trim(), 10);
            
            if (isNaN(selection) || selection > 5 || selection < 1) {
                return message.channel.send('That is not a valid selection');
            }

            this.selections[author] = this.hands[author].splice(selection - 1, 1);
            this.hands[author].push(this.cardsAvailable.splice(1, 1));
            this.hasSelected[author] = true;
            message.channel.send('Your selection has been recorded!');


            for (const player of this.players) {
                if (!this.hasSelected[player]) {
                    return;
                }
            }
            
            this.canJudge = true;
            const botChannel = this.client.channels.fetch(this.config.get('bot-speak-channel'));
            let selectionString = `Your choices are:\n`;
        });
    }
}

module.exports = ApplesModule;