const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const Discord = require('discord.js');
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

    const coinEmbed = new Discord.RichEmbed()
        .setTitle(':moneybag: :dog: :moneybag:')
        .setAuthor('Puppy coins!')
        .setColor('#eb6123')
        .setDescription(`type **!grab ${currentCode[channel]}** to grab!`);
    return coinEmbed;
}

function coinPurse(channel, dropAmount, timerAmount, client, db, currencies) {
    const plantEmbed = new Discord.RichEmbed()
        .setTitle('Alose has dropped a coin purse!')
        .setDescription(`Alose has dropped a coin purse in the chat! Quickly, pick it up by reacting with :moneybag:!`);
    client.channels.get(channel).send(plantEmbed).then(message => {
        message.react('💰');
        const filter = (reaction, user) => {
            return (reaction.emoji.name === '💰' && !user.bot);
        }
        message.awaitReactions(filter, {time: timerAmount}).then((collected) => {
            const results = collected.get('💰');
            if (results) {
                results.users.forEach(user => {
                    if (!user.bot) {
                        let coinUpdateSQL;
                        if (currencies[user.id]) {
                            currencies[user.id] = currencies[user.id] + dropAmount;
                            coinUpdateSQL = `UPDATE currency_db SET currency = ? WHERE user_id = ?`;
                        } else {
                            currencies[user.id] = dropAmount;
                            coinUpdateSQL = `INSERT INTO currency_db (currency, user_id) VALUES (?, ?)`;
                        }

                        this.db.run(coinUpdateSQL, [this.currencies[user.id], user.id], (err) => {
                            if (err) {
                                console.error(err.message);
                            }
                        });
                    }
                });
                client.channels.get(channel).send(`You've collected all my coins! Good job! You all get ${dropAmount} coins!`);
            } else {
                client.channels.get(channel).send(`Mmm... nobody picked any up...`);
            }
            message.delete();
        });
    }); 
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
        this.currencies = {}; 
        this.channels = this.config.get('coin-channels');
        for (const channel of this.channels) {
            this.seenMessages[channel] = 0;
            this.coinActive[channel] = false;
        }
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
                    this.currencies[row.user_id] = parseInt(row.currency, 10);
                });
            });
            console.log('Currency DB loaded.')
        });

        this.db.run(`
        CREATE TABLE IF NOT EXISTS currency_countdown (
        channel TEXT,
        countdown TEXT,
        PRIMARY KEY (channel)
        )`,
        (err) => {
            if (err) {
                console.error(err.message)
            }

            const countdownSql = `SELECT countdown, channel FROM currency_countdown`;

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
            console.log('Countdowns loaded')
        });

        this.dispatch.hook('!showcoins', (message) => {
            const botSpeakChannel = this.config.get('bot-speak-channel');

            if (message.channel.id === botSpeakChannel && (/^!showcoins\s<@!?(\d+)>$/).test(message.content)) {
                const userId = message.content.match(/(\d+)/g);
                const user = message.mentions.members.first().user;
                const amount = this.currencies[userId];
                const messageToSend = amount ? `${user.username} has ${amount} coins!` : `${user.username} has no coins!`;
                message.channel.send(messageToSend);
            }
        });

        this.dispatch.hook('!grab', (message) => {
            const currentChannel = message.channel.id;
            const generalChannel = this.config.get('general-channel');
            if ((/^!grab\s[A-Za-z0-9]+$/).test(message.content) && this.channels.includes(currentChannel)) {
                const code = message.content.substr('!grab'.length).trim();
                if (this.coinActive[currentChannel] && code === this.currentCode[currentChannel]) {
                    const grabber = message.author.id;
                    let coinSql = ``;
                    if (this.currencies[grabber]) {
                        this.currencies[grabber] = this.currencies[grabber] + this.coinDropAmount[currentChannel];
                        coinSql = `UPDATE currency_db SET currency = ? WHERE user_id = ?`;
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
                        this.coinTimers[currentChannel] = coinTimer(this.client, this.coinActive, currentChannel, this.coinMessages, this.coinDropAmount, this.currentCode);
                    }
                    message.channel.send(`${message.author.username} grabbed ${this.coinDropAmount[currentChannel]} coins!`).then(response => {
                        response.delete(15000);
                    });
                }
                message.delete(1000);
            }
        });

        this.dispatch.hook('!mycoins', (message) => {
            const botChannel = this.config.get('bot-channel');
            const botSpeakChannel = this.config.get('bot-speak-channel');
            const channelId = message.channel.id;
            if (channelId === botChannel || channelId === botSpeakChannel) {
                const author = message.author.id;
                const reply = this.currencies[author] ? `You have ${this.currencies[author]} coins!` : `You have no coins...`;
                message.channel.send(reply);
            }
        });

        this.dispatch.hook('!setcoinGeneral', (message) => {
            const botChannel = this.config.get('bot-channel');
            if ((/^!setcoinGeneral\s\d+$/).test(message.content) && message.channel.id === botChannel) {
                const countdownText = message.content.substr('!setcoinGeneral'.length).trim();
                this.coinCounterGeneral = parseInt(countdownText, 10);

                this.db.run(`
                    REPLACE INTO currency_countdown (countdown, channel) VALUES (?, ?)
                `, [countdownText, 'general'], (err) => {
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

        this.dispatch.hook('!give', (message) => {
            const modIds = this.config.get('mod-ids');
            if (message.member.roles.find(r => modIds.includes(r.id))) {
                if ((/!give\s<@!?(\d+)>\s(\d+)$/).test(message.content)) {
                    const mentionedUser = message.mentions.users.array()[0];
                    const id = mentionedUser.id;
                    const amount = parseInt(message.content.match(/(\d+)/g)[1], 10);
                    let giveSql = '';
                    if (this.currencies[id]) {
                        this.currencies[id] = this.currencies[id] + amount, 10;
                        giveSql = `UPDATE currency_db SET currency = ? WHERE user_id = ?`;
                    } else {
                        this.currencies[id] = amount, 10;
                        giveSql = `INSERT INTO currency_db (currency, user_id) VALUES (?, ?)`;
                    }

                    this.db.run(giveSql, [this.currencies[id], id], (err) => {
                        if (err) {
                            console.error(err.message);
                        }
                    });
                    message.channel.send(`I\'ve given ${mentionedUser.username} ${amount} coins!`);
                }
                if ((/!give\s(\d+)$/).test(message.content)) {
                    const amount = parseInt(message.content.match(/(\d+)/g)[0], 10);
                    const giveSql = `UPDATE currency_db SET currency = ? WHERE user_id = ?`;
                    for (const [id, currency] of Object.entries(this.currencies)) {
                        this.db.run(giveSql, [id, parseInt(currency, 10) + amount], (err) => {
                            if (err) {
                                console.error(err.message);
                            }
                        });
                    }
                    message.channel.send(`I\'ve given you all ${amount} coins!`);
                }
            }
        });

        this.dispatch.hook('!take', (message) => {
            const modIds = this.config.get('mod-ids');
            if (message.member.roles.find(r => modIds.includes(r.id))) {
                if ((/!take\s<@!?(\d+)>\s(\d+)$/).test(message.content)) {
                    const mentionedUser = message.mentions.users.array()[0];
                    const id = mentionedUser.id;
                    const amount = parseInt(message.content.match(/(\d+)/g)[1], 10);
                    let takeSql = '';
                    if (this.currencies[id]) {
                        this.currencies[id] = this.currencies[id] - amount < 0 ? 0 : this.currencies[id] - amount;
                        giveSql = `UPDATE currency_db SET currency = ? WHERE user_id = ?`;
                    } else {
                        this.currencies[id] = 0;
                        giveSql = `INSERT INTO currency_db (currency, user_id) VALUES (?, ?)`;
                    }

                    this.db.run(takeSql, [this.currencies[id], id], (err) => {
                        if (err) {
                            console.error(err.message);
                        }
                    });
                    message.channel.send(`Removed coins from ${mentionedUser.username}, they now have ${this.currencies[id]} coins.`);
                }
            }
        })

        this.dispatch.hook('!setcoinOther', (message) => {
            const botChannel = this.config.get('bot-channel');
            if ((/^!setcoinOther\s\d+$/).test(message.content) && message.channel.id === botChannel) {
                const countdownText = message.content.substr('!setcoinOther'.length).trim();
                this.coinCounterOther = parseInt(countdownText, 10);

                this.db.run(`
                    REPLACE INTO currency_countdown (countdown, channel) VALUES (?, ?)
                `, [countdownText, 'other'], (err) => {
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

        this.dispatch.hook('!plant', (message) => {
            const botChannel = this.config.get('bot-channel');
            const generalChannel = this.config.get('general-channel')
            if (message.channel.id === botChannel && (/^!plant\s(\d+)\stime\s(\d+)$/).test(message.content)) {
                const numbers = message.content.match(/(\d+)/g);
                const dropAmount = parseInt(numbers[0], 10);
                const timerAmount = parseInt(numbers[1], 10) * 60000;
                coinPurse(generalChannel, dropAmount, timerAmount, this.client, this.db, this.currencies);
            }
        });

        this.dispatch.hook('!coinbomb', (message) => {
            const botChannel = this.config.get('bot-channel');
            const announceChannel = this.config.get('announce')
            if (message.channel.id === botChannel && (/^!coinbomb\s(\d+)\stime\s(\d+)$/).test(message.content)) {
                const numbers = message.content.match(/(\d+)/g);
                const dropAmount = parseInt(numbers[0], 10);
                const timerAmount = parseInt(numbers[1], 10) * 60000;
                coinPurse(announceChannel, dropAmount, timerAmount, this.client, this.db, this.currencies);
            }
        });

        this.dispatch.hook(null, (message) => {
            const channel = this.config.get('general-channel');
            const currentChannel = message.channel.id;
            if (this.channels.includes(message.channel.id) && !message.author.bot) {
                let messageCap = 0;
                if (message.channel.id === channel) {
                    messageCap = this.coinCounterGeneral;
                } else {
                    messageCap = this.coinCounterOther;
                }
                this.seenMessages[currentChannel]++;
              if (this.seenMessages[currentChannel] === messageCap && !this.coinActive[currentChannel]) {
                    this.seenMessages[currentChannel] = 0;
                    this.coinActive[currentChannel] = true;
                    const coinEmbed = createCoinEmbedd(currentChannel, this.coinDropAmount, this.currentCode);
                    message.channel.send(coinEmbed).then(msg => {
                        this.coinMessages[currentChannel] = msg;
                        clearTimeout(this.coinTimers[currentChannel]);
                    });
                }
            }
        });
    }
}

module.exports = CurrencyModule;