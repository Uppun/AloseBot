const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const Discord = require('discord.js');
const Canvas = require('canvas');
const fs = require('fs');
const codes = fs.readdirSync('./assets/EGGS/SOLO');

function coinTimer(client, coinActive, channel, coinMessages, coinDropAmount, currentCode) {
    return client.setTimeout(() => {
        const coinEmbed = createCoinEmbedd(channel, coinDropAmount, currentCode);
        coinActive[channel] = true;
        client.channels.resolve(channel).send(coinEmbed).then(message => {
            coinMessages[channel] = message;
        });    
    }, 3600000 )
}

function snowTimer(client, channel, coinEmbed, coinDropAmount, currentCode, timer, coinActive, seenMessages, coinTimers, coinMessages) {
    if (timer > 0) {
        coinDropAmount[channel] = coinEmbed.coinDrop;
        currentCode[channel] = coinEmbed.keyCode;
        return setTimeout(() => {
            if (!coinActive[channel]) {
                seenMessages[channel] = 0;
                coinActive[channel] = true;
                client.channels.resolve(channel).send(coinEmbed.coinEmbed).then(message => {
                    coinMessages[channel] = message;
                    clearTimeout(coinTimers[channel]);
                });
            }
        }, timer * 60000);
    }

    return null;
}

function removeReactionUsers(reaction, botId) {
    reaction.users.fetch().then(users => {
        for (const key of users.keys()) {
            if (key !== botId) {
                reaction.users.remove(key)
            }
        }
    });
}

async function createCoinEmbedd() {
    let eggImage, coinDrop;
    const eggRandom = Math.floor(Math.random() * 100);

    switch(true) {
        case (eggRandom < 50):
            coinDrop = 1;
            eggImage = `/SOLO/${codes[Math.floor(Math.random() * codes.length)]}`;
            break;
        case (eggRandom < 75):
            coinDrop = 2;
            eggImage = `eggs_small.png`;
            break;
        case (eggRandom < 90):
            coinDrop = 3;
            eggImage = `eggs_medium.png`;
            break;
        default:
            coinDrop = 4;
            eggImage = `eggs_large.png`;
    }

    const keyCode = Math.random().toString(36).replace(/[^a-z]+/g, '').substr(0, 5);

    const canvas = Canvas.createCanvas(500, 357);
    const ctx = canvas.getContext('2d');

    const eggs = await Canvas.loadImage(path.join(__dirname, `../assets/EGGS/${eggImage}`));
    ctx.drawImage(eggs, 0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = '#74037b';
    ctx.strokeRect(0, 0, canvas.width, canvas.height);

    ctx.font = '40px sans-serif';
    ctx.strokeStyle = 'black';
    ctx.lineWidth = 3;
    ctx.strokeText(`${keyCode}`, canvas.width / 5, canvas.height / 7);
    ctx.fillStyle = 'white';
    ctx.fillText(`${keyCode}`, canvas.width / 5, canvas.height / 7);

    const currentEmbed = new Discord.MessageAttachment(canvas.toBuffer(), 'egg.png');

    const coinEmbed = new Discord.MessageEmbed()
        .setTitle('**You found some eggs!**')
        .attachFiles([currentEmbed])
        .setImage(`attachment://${currentEmbed.name}`)
        .setAuthor('Eggs!')
        .setDescription(`type **!pick [code]** to collect them!`);
    return {coinEmbed, coinDrop, keyCode};
}

function coinPurse(channel, dropAmount, timerAmount, client, db, currencies) {
    const plantEmbed = new Discord.MessageEmbed()
        .setTitle('Help Uppun collect the eggs!')
        .attachFiles(['./assets/snowstorm.png'])
        .setImage(`attachment://snowstorm.png`)
        .setDescription('Grab some eggs by reacting with 🐰!');
    client.channels.resolve(channel).send(plantEmbed).then(message => {
        message.react('🐰');
        const filter = (reaction, user) => {
            return (reaction.emoji.name === '❄️' && !user.bot);
        }
        message.awaitReactions(filter, {time: timerAmount}).then((collected) => {
            const results = collected.get('🐰');
            if (results) {
                results.users.cache.forEach(user => {
                    if (!user.bot) {
                        let coinUpdateSQL;
                        if (currencies[user.id]) {
                            currencies[user.id] = currencies[user.id] + dropAmount;
                            coinUpdateSQL = `UPDATE currency_db SET currency = ? WHERE user_id = ?`;
                        } else {
                            currencies[user.id] = dropAmount;
                            coinUpdateSQL = `INSERT INTO currency_db (currency, user_id) VALUES (?, ?)`;
                        }
                        db.run(coinUpdateSQL, [currencies[user.id], user.id], (err) => {
                            if (err) {
                                console.error(err.message);
                            }
                        });
                    }
                });
                client.channels.resolve(channel).send(`You've collected all the eggs! Good job! You all get ${dropAmount} eggs!`);
            } else {
                client.channels.resolve(channel).send(`Mmm... nobody picked any up...`);
            }
            message.delete();
        });
    }); 
}

class EventModule {
    constructor(context) {
        //========== Variable declarations ==========//
        this.dispatch = context.dispatch;
        this.config = context.config;
        this.client = context.client;
        this.db = new sqlite3.Database(path.join(__dirname, '../db/egg.db'));
        this.shopPages = [];
        this.storeActive = false;
        this.eventActive = false;
        this.currencies = {};
        this.coinCounterGeneral = 0;
        this.coinCounterPlayground = 0;
        this.coinCounterKitchen = 0;
        this.seenMessages = {}; 
        this.coinActive = {};
        this.coinDropAmount = {};
        this.coinMessages = {};
        this.coinTimers = {};
        this.currentCode = {};
        this.guessTimers = {};
        this.digTimers = {};
        this.snowfallTimer = 0;
        this.isTimer = false;
        this.messageDeleteTimer = {};
        this.triviaTimestamps = {};
        this.triviaState = {};
        this.triviaQuestions = {};
        this.coinChannels = this.config.get('coin-channels');
        for (const channel of this.coinChannels) {
            this.seenMessages[channel] = 0;
            this.coinActive[channel] = false;
        }
        //===========================================//

        //========== Database Calls ==========//
        this.db.run(`
        CREATE TABLE IF NOT EXISTS shop_items (
          type TEXT,
          item_id TEXT,
          info TEXT,
          cost TEXT,
          PRIMARY KEY (item_id)
        )`, (err) => { 
            if (err) {
                console.error(err.message);
            }
            const shopSql = `SELECT type, item_id, info, cost FROM shop_items ORDER by item_id`;

            this.db.all(shopSql, [], (err, rows) => {
                if (err) {
                    throw err;
                }
                rows.forEach((row) => {
                    this.shopPages.push({type: row.type, item_id: row.item_id, info: row.info, cost: parseInt(row.cost, 10)});
                });
            });
            console.log('Store loaded.');
        });

        this.db.run(`
            CREATE TABLE IF NOT EXISTS trivia_db (
                question TEXT,
                answer TEXT,
                PRIMARY KEY (question)
            )`,
            (err) => {
                if (err) {
                    console.error(err.message);
                }

                const triviaSQL = `SELECT question, answer FROM trivia_db`;

                this.db.all(triviaSQL, [], (err, rows) => {
                    if (err) {
                        throw err;
                    }
                    rows.forEach((row) => {
                        this.triviaQuestions[row.question] = row.answer;
                    });
                });
            });

        this.db.run(`
            CREATE TABLE IF NOT EXISTS trivia_timestamps (
                user_id TEXT,
                timestamp TEXT,
                PRIMARY KEY (user_id)
            )`,
            (err) => {
                if (err) {
                    console.error(err.message);
                }

                const timestampSQL = `SELECT user_id, timestamp from trivia_timestamps`;

                this.db.all(timestampSQL, [], (err, rows) => {
                    if (err) {
                        throw err;
                    }
                    rows.forEach((row) => {
                        this.triviaTimestamps[row.user_id] = row.timestamp;
                    });
                });
            });

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
                    }
                    if (row.channel === 'playground') {
                        this.coinCounterPlayground = parseInt(row.countdown, 10);
                    }
                    if (row.channel === 'kitchen') {
                        this.coinCounterKitchen = parseInt(row.countdown, 10);
                    }

                });
            });
            console.log('Countdowns loaded')
        });

        this.db.run(`
        CREATE TABLE IF NOT EXISTS currency_timer (
        currency TEXT,
        timer TEXT,
        PRIMARY KEY (timer)
        )`,
        (err) => {
            if (err) {
                console.error(err.message)
            }

            const timerSql = `SELECT timer FROM currency_timer`;

            this.db.all(timerSql, [], (err, rows) => {
                if (err) {
                    throw err;
                }
                rows.forEach((row) => {
                    this.snowfallTimer = parseInt(row.timer, 10);
                });
            });
        });

        //====================================//
        
        //========== Currency Related ==========//

        this.dispatch.hook('!event', async (message) => {
            const channel = this.config.get('bot-channel');
            const dogCommands = this.config.get('bot-speak-channel');
            const command = message.content.substr('!event'.length).trim();
            if (message.channel.id === dogCommands && message.content === `!event`) {
                return message.channel.send(
                    '```\n!eggs - shows your egg collection\n!eggs @user - shows another user\'s egg collection\n!pick [code] - collect the eggs!\n!lb - shows the leaderboard for who\'s collected the most eggs so far!```'
                );
            }
            if (message.channel.id !== channel) {
                return;
            }

            if (command === 'start') {
                this.eventActive = true;
                console.log(this.snowfallTimer)
                const channel = this.config.get('general-channel')
                if (this.snowfallTimer > 0) {
                    const coinEmbed = await createCoinEmbedd();
                    this.coinTimers[channel] = snowTimer(
                        this.client, 
                        channel,
                        coinEmbed,
                        this.coinDropAmount, 
                        this.currentCode, 
                        this.snowfallTimer, 
                        this.coinActive, 
                        this.seenMessages, 
                        this.coinTimers, 
                        this.coinMessages
                    );
                }
                message.channel.send('The event is now active!');
            }

            if (command === 'stop') {
                this.storeActive = false;
                message.channel.send('The event is now disabled!');
            }
        });

        this.dispatch.hook('!eggs', (message) => {
            if (!this.eventActive) { return }
            const modChannel = this.config.get('bot-channel');
            const botChannel = this.config.get('bot-speak-channel');

            if (message.channel.id !== botChannel || message.channel.id !== modChannel) {
                return;
            }

            if (message.content === '!eggs') {
                const author = message.author.id;
                const reply = this.currencies[author] ? `🥚${this.currencies[author]}` : `You have no eggs...`;
                message.channel.send(reply);
            }

            if ((/^!eggs\s<@!?(\d+)>$/).test(message.content)) {
                const userId = message.content.match(/(\d+)/g);
                const user = message.mentions.members.first().user;
                const amount = this.currencies[userId];
                const messageToSend = amount ? `${user.username}:❄️${amount}` : `${user.username} has no eggs!`;
                message.channel.send(messageToSend);
            }
        });

        this.dispatch.hook('!pick', async (message) => {
            if (!this.eventActive) { return }
            const currentChannel = message.channel.id;
            const generalChannel = this.config.get('general-channel');
            if ((/^!pick\s[A-Za-z0-9]+$/).test(message.content) && this.coinChannels.includes(currentChannel)) {
                const code = message.content.substr('!pick'.length).trim();
                console.log(this.coinActive[currentChannel])
                console.log(this.currentCode[currentChannel])
                if (this.coinActive[currentChannel] && code === this.currentCode[currentChannel]) {
                    const grabber = message.author.id;
                    let eggsql = ``;
                    if (this.currencies[grabber]) {
                        this.currencies[grabber] = this.currencies[grabber] + this.coinDropAmount[currentChannel];
                        eggsql = `UPDATE currency_db SET currency = ? WHERE user_id = ?`;
                    } else {
                        this.currencies[grabber] = this.coinDropAmount[currentChannel];
                        eggsql = `INSERT INTO currency_db (currency, user_id) VALUES (?, ?)`;
                    }
                    clearTimeout(this.messageDeleteTimer[currentChannel]);
                    this.coinActive[currentChannel] = false;
                    this.seenMessages[currentChannel] = 0;
                    this.coinMessages[currentChannel].delete();
                    this.currentCode[currentChannel] = null;
                    if (this.snowfallTimer > 0 && message.channel.id === generalChannel) {
                        const coinEmbed = await createCoinEmbedd();
                        this.coinTimers[generalChannel] = snowTimer(
                            this.client, 
                            currentChannel,
                            coinEmbed, 
                            this.coinDropAmount, 
                            this.currentCode, 
                            this.snowfallTimer, 
                            this.coinActive, 
                            this.seenMessages,
                            this.coinTimers,
                            this.coinMessages
                        );
                    }

                    this.db.run(eggsql, [this.currencies[grabber], grabber], (err) => {
                        if (err) {
                            console.error(err.message);
                        }
                    });

                    if (currentChannel === generalChannel) {
                        const coinEmbed = await createCoinEmbedd();
                        this.coinTimers[currentChannel] = snowTimer(this.client, currentChannel, coinEmbed, this.coinDropAmount, this.currentCode, this.snowfallTimer, this.coinActive, this.seenMessages, this.coinTimers, this.coinMessages);
                    }

                    message.channel.send(`${message.author.username} collected an egg!`).then(response => {
                        response.delete({timeout: 15000});
                    });
                }
                message.delete({timeout: 1000});
            }
        });

        this.dispatch.hook('!setTimer', async (message) => {
            const modChannel = this.config.get('bot-channel');
            if (message.channel.id !== modChannel) {
                return;
            }

            const newTimer = parseInt(message.content.substr('!setTimer'.length).trim(), 10);
            if (isNaN(newTimer)) { message.channel.send('That is not a number!'); }
            else {
                this.db.run(`INSERT INTO currency_timer (currency, timer) VALUES (?, ?)`, ['timer', newTimer], (err) => {
                    if (err) {
                        console.error(err.message);
                    }
                });
                this.snowfallTimer = newTimer;
                const channel = this.config.get('general-channel');
                clearTimeout(this.coinTimers[channel]);
                if (this.snowfallTimer > 0) {
                    const coinEmbed = await createCoinEmbedd();
                    this.coinTimers[channel] = snowTimer(this.client, channel, coinEmbed, this.coinDropAmount, this.currentCode, this.snowfallTimer, this.coinActive, this.seenMessages, this.coinTimers, this.coinmessages);
                    message.channel.send(`Timer set to ${newTimer} minutes.`);
                } else {
                    message.channel.send(`Timer disabled.`);
                }
            }
        });

        this.dispatch.hook('!setGeneral', (message) => {
            const botChannel = this.config.get('bot-channel');
            if ((/^!setGeneral\s\d+$/).test(message.content) && message.channel.id === botChannel) {
                const countdownText = message.content.substr('!setGeneral'.length).trim();
                this.coinCounterGeneral = parseInt(countdownText, 10);

                this.db.run(`
                    REPLACE INTO currency_countdown (countdown, channel) VALUES (?, ?)
                `, [countdownText, 'general'], (err) => {
                    if (err) {
                        console.error(err.message);
                    }
                });

                const response = this.coinCounter <= 0 ? 
                    'Looks like we ran out of eggs.' : 
                    `Oh we'll find eggs in general every ${this.coinCounterGeneral} messages!`;
                message.channel.send(response);
            }
        });

        this.dispatch.hook('!give', (message) => {
            const modIds = this.config.get('mod-ids');
            if (message.member.roles.cache.find(r => modIds.includes(r.id))) {
                if ((/!give\s<@!?(\d+)>\s(\d+)$/).test(message.content)) {
                    const mentionedUser = message.mentions.users.array()[0];
                    const id = mentionedUser.id;
                    const amount = parseInt(message.content.match(/(\d+)/g)[1], 10);
                    let giveSql = '';
                    if (this.currencies[id] === undefined) {
                        this.currencies[id] = amount;
                        giveSql = `INSERT INTO currency_db (currency, user_id) VALUES (?, ?)`;
                    } else {
                        this.currencies[id] = this.currencies[id] + amount;
                        giveSql = `UPDATE currency_db SET currency = ? WHERE user_id = ?`;
                    }

                    this.db.run(giveSql, [this.currencies[id], id], (err) => {
                        if (err) {
                            console.error(err.message);
                        }
                    });
                    message.channel.send(`I\'ve given ${mentionedUser.username} ${amount} eggs!`);
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
                    message.channel.send(`I\'ve given you all ${amount} eggs!`);
                }

                if ((/!give\s<@&(\d+)>\s(\d+)$/).test(message.content)) {
                    const mentionedRole = message.mentions.roles.array()[0];
                    const id = mentionedRole.id;
                    const amount = parseInt(message.content.match(/(\d+)/g)[1], 10);
                    const roleHavers = message.guild.members.cache.filter(member => member.roles.cache.get(id));


                    for (const user of [...roleHavers.values()]) {
                        const userId = user.id;
                        let giveSql = ``;
                        if (this.currencies[userId] === undefined) {
                            this.currencies[userId] = amount;
                            giveSql = `INSERT INTO currency_db (currency, user_id) VALUES (?, ?)`;
                        } else {
                            this.currencies[userId] = this.currencies[userId] + amount;
                            giveSql = `UPDATE currency_db SET currency = ? WHERE user_id = ?`;
                        }
          
                        this.db.run(giveSql, [this.currencies[userId], userId], (err) => {
                            if (err) {
                                console.error(err.message);
                            }
                        });
                    }

                    message.channel.send(`I\'ve given all of ${mentionedRole.name} ${amount} eggs!`);
                }
            }
        });

        this.dispatch.hook('!take', (message) => {
            const modIds = this.config.get('mod-ids');
            if (message.member.roles.cache.find(r => modIds.includes(r.id))) {
                if ((/!take\s<@!?(\d+)>\s(\d+)$/).test(message.content)) {
                    const mentionedUser = message.mentions.users.array()[0];
                    const id = mentionedUser.id;
                    const amount = parseInt(message.content.match(/(\d+)/g)[1], 10);
                    let takeSql = '';
                    if (this.currencies[id]) {
                        this.currencies[id] = this.currencies[id] - amount < 0 ? 0 : this.currencies[id] - amount;
                        takeSql = `UPDATE currency_db SET currency = ? WHERE user_id = ?`;
                    } else {
                        this.currencies[id] = 0;
                        takeSql = `INSERT INTO currency_db (currency, user_id) VALUES (?, ?)`;
                    }

                    this.db.run(takeSql, [this.currencies[id], id], (err) => {
                        if (err) {
                            console.error(err.message);
                        }
                    });
                    message.channel.send(`Removed eggs from ${mentionedUser.username}, they now have ${this.currencies[id]} eggs.`);
                }
            }
        })

        this.dispatch.hook('!setPlayground', (message) => {
            const botChannel = this.config.get('bot-channel');
            if ((/^!setPlayground\s\d+$/).test(message.content) && message.channel.id === botChannel) {
                const countdownText = message.content.substr('!setPlayground'.length).trim();
                this.coinCounterPlayground = parseInt(countdownText, 10);

                this.db.run(`
                    REPLACE INTO currency_countdown (countdown, channel) VALUES (?, ?)
                `, [countdownText, 'playground'], (err) => {
                    if (err) {
                        console.error(err.message);
                    }
                });

                const response = this.coinCounter <= 0 ? 
                    'No more eggs...' : 
                    `I'll leave eggs in those channels every ${this.coinCounterPlayground} messages!`;
                message.channel.send(response);
            }
        });

        this.dispatch.hook('!setKitchen', (message) => {
            const botChannel = this.config.get('bot-channel');
            if ((/^!setKitchen\s\d+$/).test(message.content) && message.channel.id === botChannel) {
                const countdownText = message.content.substr('!setKitchen'.length).trim();
                this.coinCounterKitchen = parseInt(countdownText, 10);

                this.db.run(`
                    REPLACE INTO currency_countdown (countdown, channel) VALUES (?, ?)
                `, [countdownText, 'kitchen'], (err) => {
                    if (err) {
                        console.error(err.message);
                    }
                });

                const response = this.coinCounter <= 0 ? 
                    'No more snow...' : 
                    `I'll leave eggs in those channels every ${this.coinCounterPlayground} messages!`;
                message.channel.send(response);
            }
        });

        /*this.dispatch.hook('!plantdrop', (message) => {
            if (!this.eventActive) { return }
            const generalChannel = this.config.get('general-channel');
            const modIds = this.config.get('mod-ids');
            if (message.member.roles.cache.find(r => modIds.includes(r.id)) && (/^!plantdrop\s(\d+)\stime\s(\d+)$/).test(message.content)) {
                const numbers = message.content.match(/(\d+)/g);
                const dropAmount = parseInt(numbers[0], 10);
                const timerAmount = parseInt(numbers[1], 10) * 60000;
                coinPurse(generalChannel, dropAmount, timerAmount, this.client, this.db, this.currencies);
            }
        });

        this.dispatch.hook('!announcedrop', (message) => {
            if (!this.eventActive) { return }
            const announceChannel = this.config.get('announce')
            if (message.member.roles.cache.find(r => modIds.includes(r.id)) && (/^!announcedrop\s(\d+)\stime\s(\d+)$/).test(message.content)) {
                const numbers = message.content.match(/(\d+)/g);
                const dropAmount = parseInt(numbers[0], 10);
                const timerAmount = parseInt(numbers[1], 10) * 60000;
                coinPurse(announceChannel, dropAmount, timerAmount, this.client, this.db, this.currencies);
            }
        });*/

        this.dispatch.hook(null, async (message) => {
            if (!this.eventActive) { return }
            const generalChannels = this.config.get('general-channels');
            const playgroundChannels = this.config.get('playground-channels');
            const kitchenChannels = this.config.get('kitchen-channels');
            const currentChannel = message.channel.id;
            if (this.coinChannels.includes(message.channel.id) && !message.author.bot) {
                let messageCap = 0;
                if (generalChannels.includes(currentChannel)) {
                    messageCap = this.coinCounterGeneral;
                }
                if (playgroundChannels.includes(currentChannel)) {
                    messageCap = this.coinCounterPlayground;
                }
                if (kitchenChannels.includes(currentChannel)) {
                    messageCap = this.coinCounterKitchen;
                }
                this.seenMessages[currentChannel]++;
              if (this.seenMessages[currentChannel] === messageCap && !this.coinActive[currentChannel]) {
                    this.seenMessages[currentChannel] = 0;
                    this.coinActive[currentChannel] = true;
                    clearTimeout(this.snowfallTimer);
                    const coinEmbed = await createCoinEmbedd();
                    this.coinDropAmount[currentChannel] = coinEmbed.coinDrop;
                    this.currentCode[currentChannel] = coinEmbed.keyCode;
                    message.channel.send(coinEmbed.coinEmbed).then( async (msg) => {
                        this.coinMessages[currentChannel] = msg;
                        clearTimeout(this.coinTimers[currentChannel]);
                        const generalChannel = this.config.get('general-channel');

                        const coinEmbed = await createCoinEmbedd();

                        this.messageDeleteTimer[currentChannel] = setTimeout(() => {
                            if (this.messageDeleteTimer[currentChannel]) {
                                msg.channel.send('Nobody helped collect the egg...').then(failedMsg => {
                                    failedMsg.delete({timeout: 60000});
                                });
                                this.coinActive[currentChannel] = false;
                                this.seenMessages[currentChannel] = 0;
                                this.coinMessages[currentChannel].delete();
                                this.currentCode[currentChannel] = null;
                                if (message.channel.id === generalChannel && this.snowfallTimer > 0) {
                                    this.coinTimers[currentChannel] = snowTimer(
                                        this.client, 
                                        currentChannel,
                                        coinEmbed, 
                                        this.coinDropAmount, 
                                        this.currentCode, 
                                        this.snowfallTimer, 
                                        this.coinActive, 
                                        this.seenMessages,
                                        this.coinTimers,
                                        this.coinMessages
                                    ); 
                                }
                            }
                        }, 30000);
                    });
                }
            }
        });

        //======================================//

        //=========== Store Related ===========//
        
        this.dispatch.hook('!eventshop', (message) => {
            const channel = this.config.get('bot-channel');
            const command = message.content.substr('!eventshop'.length).trim();

            if (message.channel.id !== channel) {
                return;
            }

            if (command === 'start') {
                this.storeActive = true;
                message.channel.send('The event store is now active!');
            }

            if (command === 'stop') {
                this.storeActive = false;
                message.channel.send('The event store is now disabled!');
            }
        });

        this.dispatch.hook('!addShop', (message) => {
            const channel = this.config.get('bot-channel');

            if (message.channel.id === channel) {
                console.log(message.content)
                if ((/^!addShop\srole\s("[A-Za-z\s]+"|“[A-Za-z\s]+”)\s<@&(\d+)>\s\d+$/).test(message.content)) {
                    const idAndCost = message.content.match(/(\d+)/g);
                    const id = idAndCost[0];
                    const roleCost = parseInt(idAndCost[1], 10);
                    let roleFound = false;
                    const role = message.guild.roles.fetch(id);
                    if (role) {
                        for (let [i, {type, item_id, info, cost}] of this.shopPages.entries()) {
                            if (item_id === id) {
                                this.shopPages[i].cost = roleCost;
                                roleFound = true;
                                this.db.run(`
                                UPDATE shop_items 
                                SET cost = ?
                                WHERE item_id = ? 
                                `, [roleCost, id], (err) => {
                                    if (err) {
                                        console.error(err.message);
                                    }
                                });
                                message.channel.send(`Role updated!`);
                                break;
                            }
                        }
    
                        if (!roleFound) {
                            let roleInfo = message.content.match(/("[a-zA-Z\s]+"|“[a-zA-Z\s]+”)/g);
                            roleInfo = roleInfo[0].substr(1, roleInfo[0].length - 2);
                            console.log(roleInfo)
                            this.db.run(`
                            INSERT INTO shop_items (type, item_id, info, cost)
                            VALUES (?, ?, ?, ?)
                            `, ['role', id, roleInfo, roleCost], (err) => {
                            if (err) {
                                console.error(err.message);
                            } else {
                                this.shopPages.push({type: 'role', item_id: id, info: roleInfo, cost: roleCost});
                                message.channel.send(`Role added!`);
                            }});          
                        }
                    } else {
                        message.channel.send('Error! Role not found.');
                    }
                }

                if ((/^!addShop\sitem\s("[a-zA-Z\s]+"|“[a-zA-Z\s]+”)\s("[a-zA-Z\s]+"|“[a-zA-Z\s]+”)\s\d+$/).test(message.content)) {
                    const itemElements = message.content.match(/("[A-Za-z\s]+"|“[A-Za-z\s]+”)/g);
                    const itemName = itemElements[0].substr(1, itemElements[0].length - 2);
                    const itemDescription = itemElements[1].substr(1, itemElements[1].length - 2);
                    const cost = message.content.match(/(\d+)/g)[0];
                    let itemFound = false;
                    for (let [i, {type, item_id, info, cost}] of this.shopPages.entries()) {
                        if (item_id === itemName) {
                            this.shopPages[i].cost = cost;
                            itemFound = true;
                            this.db.run(`
                            UPDATE shop_items 
                            SET cost = ?
                            WHERE item_id = ? 
                            `, [cost, itemName], (err) => {
                                if (err) {
                                    console.error(err.message);
                                }
                            });
                            message.channel.send(`Item updated!`);
                            break;
                        }
                    }

                    if (!itemFound) {
                        this.db.run(`
                        INSERT INTO shop_items (type, item_id, info, cost)
                        VALUES (?, ?, ?, ?)
                        `, ['item', itemName, itemDescription, cost], (err) => {
                        if (err) {
                            console.error(err.message);
                        } else {
                            this.shopPages.push({type: 'item', item_id: itemName, info: itemDescription, cost});
                            message.channel.send(`Item added!`);
                        }});  
                    }
                }
            }
            
        });

        this.dispatch.hook('!removeShop', (message) => {
            const channel = this.config.get('bot-channel');
            if (message.channel.id === channel && (/^!removeShop\s\d+$/).test(message.content)) {
                let itemIndex = parseInt(message.content.substr('!removeShop'.length).trim(), 10);
                if (this.shopPages.length >= itemIndex && itemIndex > 0) {
                    this.db.run(`
                    DELETE FROM shop_items WHERE item_id=?`, this.shopPages[itemIndex - 1].item_id, (err) => {
                      if (err) {
                        console.error(err.message);
                      }
                    });
                    this.shopPages = this.shopPages.filter((elements, index) => index !== itemIndex - 1);
                    message.channel.send('Shop item deleted!');
                } else {
                    message.channel.send('Couldn\'t find item! The proper use of this command is "!removeshop item#');
                }
            }
        });

        this.dispatch.hook('!buy', (message) => {
            const channel = this.config.get('bot-speak-channel');
            const logChannel = this.client.channels.resolve(this.config.get('log-channel'));
            if ((/^!buy\s(\d+)$/).test(message.content) && message.channel.id === channel && this.storeActive) {
                const itemIndex = parseInt(message.content.match(/(\d+)/g), 10);
                const purchase = this.shopPages[itemIndex - 1];
                if (purchase){
                    if (purchase.type === 'role') {
                        if (message.member.roles.cache.find(r => r.id === purchase.item_id)) {
                            message.channel.send('You already have this role!');
                        } else {
                            if (purchase.cost > parseInt(this.currencies[message.author.id])) {
                                message.channel.send('You can\'t afford this role!');
                            } else {
                                const setRole = message.guild.roles.cache.find(r => r.id === purchase.item_id);
                                this.currencies[message.author.id] = this.currencies[message.author.id] - purchase.cost;
                                this.db.run(`
                                UPDATE currency_db 
                                SET currency = ?
                                WHERE user_id = ? 
                                `, [this.currencies[message.author.id], message.author.id], (err) => {
                                    if (err) {
                                        console.error(err.message);
                                    }
                                });
                                message.member.roles.add(setRole, 'Bought from store');
                                message.channel.send('Role purchased!');
                                logChannel.send(`${message.author.username} purchased the role ${purchase.info} for ${purchase.cost}`);
                            }
                        }
                    }

                    if (purchase.type === 'item') {
                        if (purchase.cost > parseInt(this.currencies[message.author.id])) {
                            message.channel.send('You can\'t afford this item!');
                        } else {
                            this.currencies[message.author.id] = this.currencies[message.author.id] - purchase.cost;
                            this.db.run(`
                            UPDATE currency_db 
                            SET currency = ?
                            WHERE user_id = ? 
                            `, [this.currencies[message.author.id], message.author.id], (err) => {
                                if (err) {
                                    console.error(err.message);
                                }
                            });
                            message.channel.send('Item purchased!');
                            logChannel.send(`${message.author.username} purchased the item ${purchase.item_id} for ${purchase.cost}`);
                        }
                    }
                }
            }
        });
        
        this.dispatch.hook('!shop', async (message) => {
            const botSpeakChannel = this.config.get('bot-speak-channel');
            const modCommandsChannel = this.config.get('bot-channel');
            if ((message.channel.id === botSpeakChannel && this.storeActive) || message.channel.id === modCommandsChannel) {
                let pages = [];
                let page = '';
                const guild = message.guild;

                for (const [i, {type, item_id, info, cost}] of this.shopPages.entries()) {
                    if (type === 'role') {
                        const role =  await guild.roles.fetch(item_id);
                        page += `**${i + 1}) ${role.name}**:\xa0\xa0\xa0\xa0${cost} :egg:\n${info}\n`;
                    } else {
                        page += `**${i + 1}) ${item_id}**:\xa0\xa0\xa0\xa0${cost} :egg:\n${info}\n`;
                    }
                    if ((i + 1) % 2 === 0) {
                        if ((i + 1) % 4 === 0) {
                            pages.push(page);
                            page = '';
                        } else {
                            page += `\n\n`;
                        }
                    } else {
                        const role = await guild.roles.fetch(item_id);
                        const nameLength = type === 'role' ? role.name.length : item_id.length;
                        const totalSpaces = 22 - cost.length - nameLength;
                        for (let i = 0; i < totalSpaces; i++) {
                            page += `\xa0`;
                        }
                    }

                    if (page && i+1 === this.shopPages.length) {
                        pages.push(page);
                    }
                }

                let currentPage = 0;

                const shopEmbed = new Discord.MessageEmbed()
                    .setTitle(':egg: :egg: :egg:')
                    .setAuthor('egg Shop!')
                    .setColor('#FF7417')
                    .setFooter(`Page ${currentPage+1} of ${pages.length}`)
                    .setDescription(pages[currentPage]);
                
                message.channel.send(shopEmbed).then(msg => {
                    const reactionMap = new Map([['⏪', -1],['⏩', 1]]);

                    Array.from(reactionMap.keys()).reduce( async (previousPromise, nextReaction) => {
                        await previousPromise;
                        return msg.react(nextReaction)
                    }, Promise.resolve());
                    
                    const reactionCollector = new Discord.ReactionCollector(msg, (reaction, user) => {
                        return reactionMap.has(reaction.emoji.name) && user.id !== this.client.user.id;
                    }, { time: 600000, });

                    reactionCollector.on('collect', (reaction, collector) => {
                        let pageChange = currentPage + reactionMap.get(reaction.emoji.name);

                        if ((pageChange > -1) && (pageChange < pages.length)) {
                            currentPage = pageChange;
                            shopEmbed.setDescription(pages[currentPage]);
                            shopEmbed.setFooter(`Page ${currentPage+1} of ${pages.length}`);
                            msg.edit(shopEmbed);
                        }
                        removeReactionUsers(reaction, this.client.user.id);
                    })
                    msg.delete({timeout: 600000});
                });
            }
        });

        this.dispatch.hook('!lb', async (message) => {
            const botSpeakChannel = this.config.get('bot-speak-channel');
            const modCommandsChannel = this.config.get('bot-channel');
            if (message.channel.id !== botSpeakChannel && message.channel.id !== modCommandsChannel) {
                return;
            }


            const eggArray = Object.entries(this.currencies);
            eggArray.sort((el1, el2) => {
                return parseInt(el2[1], 10) - parseInt(el1[1], 10);
            });
            const topTenPromises = [];
            for (let i = 0; i < 10; i++) {
                if (eggArray[i]) {
                    topTenPromises.push(this.client.users.fetch(eggArray[i][0]));
                }
            }
            await Promise.all(topTenPromises).then((topTen) => {
                const eggLB = new Discord.MessageEmbed()
                    .setTitle('egg Leaderboard!')
                    .setAuthor('The Doghouse');
                for (let j = 0; j < topTen.length; j++) {
                    eggLB.addField(`${topTen[j].username}`, `:egg: ${eggArray[j][1]}`);
                }
                message.channel.send(eggLB);
            });
        });

        //===========================Trivia======================//

        /*this.dispatch.hook('!startTrivia', (message) => {
            const userTimestamp = this.triviaTimestamps[message.author.id];
            const today = Date.now().getDate();

            if (today === userTimestamp) {
                return message.channel.send('You\'ll have to wait until tomorrow to play again!');
            }

            this.triviaTimestamps[message.author.id] = today;
            this.triviaState[message.author.id] = {}
        });*/
    }
}

module.exports = EventModule;