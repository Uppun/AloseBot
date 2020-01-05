const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const GRAB_CODES = [
    'test1',
    'test2',
    'test3',
    'test4',
    'test5',
];

function coinTimer(client, coinActive, channel, coinMessages, coinDropAmount, currentCode) {
    return client.setTimeout(() => {
        const coinEmbed = createCoinEmbedd(channel, coinDropAmount, currentCode);
        coinActive[channel] = true;
        client.channels.get(channel).send(coinEmbed).then(message => {
            coinMessages[channel] = message;
        });    
    }, 3600000 )
}

function createCoinEmbedd(channel, coinDropAmount, currentCode) {
    const coinDrop = Math.floor(Math.random() * 49 + 1);
    coinDropAmount[channel] = coinDrop;
    currentCode[channel] = GRAB_CODES[Math.floor(Math.random() * GRAB_CODES.length)];

    const candyEmbed = new Discord.RichEmbed()
        .setTitle(':moneybag: :dog: :moneybag:')
        .setAuthor('Puppy coins!')
        .setColor('#eb6123')
        .setDescription(`type **!grab ${currentCode[channel]}** to grab!`);
    return candyEmbed;
}

class CurrencyModule {
    constructor(context) {
        this.dispatch = context.dispatch;
        this.config = context.config;
        this.client = context.client;
        this.db = new sqlite3.Database(path.join(__dirname, '../../sharedDBs/StoreDB.db'));
        this.coinCounterGeneral = 0;
        this.coinCounterOther = 0;
        this.seenMessages = {}; 
        this.coinActive = {};
        this.coinDropAmount = {};
        this.coinMessages = {};
        this.coinTimers = {};
        this.currentCode = {};  

        this.db.run(`
        CREATE TABLE IF NOT EXISTS currency_db (
        user_id TEXT,
        currency TEXT,
        PRIMARY KEY (user_id)
        )`,
        (err) => {
            if (err) {
                console.error(err.message);
            }

            const currencySql = `SELECT user_id, currency FROM currency_db`;

            this.db.all(currencySql, [], (err, rows) => {
                if (err) {
                    throw err;
                }
                rows.forEach((row) => {
                    this.currencies[row.user_id] = row.currency;
                });
            });
            console.log('Currency DB loaded.')
        });

        this.db.run(`
        CREATE TABLE IF NOT EXISTS currency_countdown (
        channel TEXT,
        countdown TEXT,
        PRIMARY KEY (countdown)
        )`,
        (err) => {
            if (err) {
                console.error(err.message)
            }

            const countdownSql = `SELECT countdown FROM currency_countdown`;

            this.db.all(countdownSql, [], (err, rows) => {
                if (err) {
                    throw err;
                }
                rows.forEach((row) => {
                    if (row.channel === 'general') {
                        this.coinCounterGeneral = parseInt(row.countdown, 10);
                    } else {
                        this.coinCounterOther = parseInt(row.countdown, 10);
                    }
                });
            });
        });

        this.dispatch.hook('!grab', (message) => {
            const channels = this.config.get('coin-channels');
            const currentChannel = message.channel.id;
            const modIds = this.config.get('mod-ids')
            if ((/^!grab\s[A-Za-z0-9]+$/).test(message.content) && channels.includes(currentChannel) && !message.member.roles.find(r => modIds.includes(r.id))) {
                const code = message.content.substr('!grab'.length).trim();
                if (this.coinActive[currentChannel] && code === this.currentCode[currentChannel]) {
                    const grabber = message.author.id;
                    let coinSql = ``;
                    if (this.currencies[grabber]) {
                        this.currencies[grabber] = this.currencies[grabber] + this.coinDropAmount[currentChannel];
                        coinSql = `UPDATE currency_db SET cost = ? WHERE item_id = ?`;
                    } else {
                        this.currencies[grabber] = this.coinDropAmount[currentChannel];
                        coinSql = `INSERT INTO currency_db (currency, user_id) VALUES (?, ?)`;
                    }

                    this.coinActive[currentChannel] = false;
                    this.seenMessages[currentChannel] = 0;
                    this.coinMessages[currentChannel].delete(0);
                    this.currentCode[currentChannel] = null;
                    this.db.run(coinSql, [this.currencies[grabber], grabber], (err) => {
                        if (err) {
                            console.error(err.message);
                        }
                    });

                    if (currentChannel === generalChannel) {
                        this.coinTimers[currentChannel] = coinTimer(currentChannel);
                    }
                    message.channel.send(`${message.author.username} grabbed ${this.coinDropAmount[grabber]} candies!`).then(response => {
                        response.delete(15000);
                    });
                }
                msg.delete(1000);
            }
        });

        this.dispatch.hook('!setcoinGeneral', (message) => {
            const botChannel = this.config.get('bot-channel');
            const general = this.config.get('general-channel');
            if ((/^!setcoinGeneral\s\d+$/).test(message.content) && message.channel.id === botChannel) {
                const countdownText = message.content.substr('!setcoinGeneral'.length).trim();
                this.coinCounterGeneral = parseInt(countdownText, 10);

                this.db.run(`
                UPDATE currency_countdown
                SET countdown = ?
                WHERE channel = ?
                `, [countdownText, general], (err) => {
                    if (err) {
                        console.error(err.message);
                    }
                });

                const response = this.coinCounter <= 0 ? 
                    'Okay... I wont share my coins anymore...' : 
                    `Okay! I'll share my coins after ${this.coinCounterGeneral} messages!`;
                message.channel.send(response);
            }
        });

        this.dispatch.hook('!setcoinOther', (message) => {
            const botChannel = this.config.get('bot-channel');
            const general = this.config.get('general-channel');
            if ((/^!setcoinOther\s\d+$/).test(message.content) && message.channel.id === botChannel) {
                const countdownText = message.content.substr('!setcoinOther'.length).trim();
                this.coinCounterOther = parseInt(countdownText, 10);

                this.db.run(`
                UPDATE currency_countdown
                SET countdown = ?
                WHERE channel NOT IN = ?
                `, [countdownText, general], (err) => {
                    if (err) {
                        console.error(err.message);
                    }
                });

                const response = this.coinCounter <= 0 ? 
                    'Okay... I wont share my coins anymore...' : 
                    `Okay! I'll share my coins after ${this.coinCounterOther} messages!`;
                message.channel.send(response);
            }
        });

        this.dispatch.hook(null, (message) => {
            const channel = this.config.get('general-channel');
            const channels = this.config.get('coin-channels');
            const currentChannel = message.channel.id;
            if (channels.includes(message.channel.id) && !message.author.bot) {
                let messageCap = 0;
                if (message.channel.id === channel) {
                    messageCap = this.coinCounterGeneral;
                } else {
                    messageCap = this.coinCounterOther;
                }
                this.seenMessages[currentChannel]++;
              if (this.seenMessages[currentChannel] === messageCap && !coinActive[currentChannel]) {
                this.seenMessages[currentChannel] = 0;
                this.coinActive[currentChannel] = true;
                const coinEmbed = createCoinEmbedd(currentChannel, this.coinDropAmount, this.currentCode);
                message.channel.send(coinEmbed).then(msg => {
                    coinMessages[currentChannel] = msg;
                    clearTimeout(coinTimers[currentChannel]);
                });
              }
            }
          });
    }
}

module.exports = CurrencyModule;