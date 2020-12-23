const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const Discord = require('discord.js');
const codes = require('../assets/coins.js');

function coinTimer(client, coinActive, channel, coinMessages, coinDropAmount, currentCode) {
    return client.setTimeout(() => {
        const coinEmbed = createCoinEmbedd(channel, coinDropAmount, currentCode);
        coinActive[channel] = true;
        client.channels.resolve(channel).send(coinEmbed).then(message => {
            coinMessages[channel] = message;
        });    
    }, 3600000 )
}

function snowTimer(client, channel, coinDropAmount, currentCode, timer, coinActive, seenMessages, coinTimers, coinMessages) {
    return setTimeout(() => {
        if (!coinActive[channel]) {
            const coinEmbed = createCoinEmbedd(channel, coinDropAmount, currentCode);
            seenMessages[channel] = 0;
            coinActive[channel] = true;
            client.channels.resolve(channel).send(coinEmbed).then(message => {
                coinMessages[channel] = message;
                clearTimeout(coinTimers[channel]);
            });
        }
    }, timer * 60000);
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


function createCoinEmbedd(channel, coinDropAmount, currentCode) {
    const coinDrop = 1;
    coinDropAmount[channel] = coinDrop;
    const keyCodes = Array.from(codes.keys());
    currentCode[channel] = keyCodes[Math.floor(Math.random() * keyCodes.length)];
    const image = codes.get(currentCode[channel]);

    const coinEmbed = new Discord.MessageEmbed()
        .setTitle('**Some snowflakes appeared!**')
        .attachFiles([image])
        .setImage(`attachment://${image.name}`)
        .setAuthor('Snow!')
        .setColor('#eb6123')
        .setDescription(`type **!catch [code]** to catch them!`);
    return coinEmbed;
}

function coinPurse(channel, dropAmount, timerAmount, client, db, currencies) {
    const plantEmbed = new Discord.MessageEmbed()
        .setTitle('Brrr... a blizzard just blew in!')
        .attachFiles(['./assets/snowstorm.png'])
        .setImage(`attachment://snowstorm.png`)
        .setDescription('Grab some snowflakes by reacting with ❄️!');
    client.channels.resolve(channel).send(plantEmbed).then(message => {
        message.react('❄️');
        const filter = (reaction, user) => {
            return (reaction.emoji.name === '❄️' && !user.bot);
        }
        message.awaitReactions(filter, {time: timerAmount}).then((collected) => {
            const results = collected.get('❄️');
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
                client.channels.resolve(channel).send(`You've collected all the snowflakes! Good job! You all get ${dropAmount} snowflakes!`);
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
        this.db = new sqlite3.Database(path.join(__dirname, '../db/SnowFlake.db'));
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

        this.dispatch.hook('!event', (message) => {
            const channel = this.config.get('bot-channel');
            const dogCommands = this.config.get('bot-speak-channel');
            const command = message.content.substr('!event'.length).trim();
            /*if (message.channel.id === dogCommands) {
                return message.channel.send(
                    '```\n!snowflakes - shows your snowflake collection\n!snowflakes @user - shows another user\'s snowflake collection\n!catch [code] - catch the snowflakes!\n!lb - shows the leaderboard for who\'s caught the most snowflakes so far!```'
                );
            }*/
            if (message.channel.id !== channel) {
                return;
            }

            if (command === 'start') {
                this.eventActive = true;
                const channel = this.config.get('general-channel')
                if (this.snowfallTimer > 0) {
                    this.coinTimers[channel] = snowTimer(
                        this.client, 
                        channel, 
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

        this.dispatch.hook('!snowflakes', (message) => {
            if (!this.eventActive) { return }
            const modChannel = this.config.get('bot-channel');
            const botChannel = this.config.get('bot-speak-channel');

            if (message.channel.id !== botChannel || message.channel.id !== modChannel) {
                return;
            }

            if (message.content === '!snowflakes') {
                const author = message.author.id;
                const reply = this.currencies[author] ? `❄️${this.currencies[author]}` : `You have no snowflakes...`;
                message.channel.send(reply);
            }

            if ((/^!snowflakes\s<@!?(\d+)>$/).test(message.content)) {
                const userId = message.content.match(/(\d+)/g);
                const user = message.mentions.members.first().user;
                const amount = this.currencies[userId];
                const messageToSend = amount ? `${user.username}:❄️${amount}` : `${user.username} has no snowflakes!`;
                message.channel.send(messageToSend);
            }
        });

        this.dispatch.hook('!catch', (message) => {
            if (!this.eventActive) { return }
            const currentChannel = message.channel.id;
            const generalChannel = this.config.get('general-channel');
            if ((/^!catch\s[A-Za-z0-9]+$/).test(message.content) && this.coinChannels.includes(currentChannel)) {
                const code = message.content.substr('!catch'.length).trim();
                if (this.coinActive[currentChannel] && code === this.currentCode[currentChannel]) {
                    const grabber = message.author.id;
                    let snowflakesql = ``;
                    if (this.currencies[grabber]) {
                        this.currencies[grabber] = this.currencies[grabber] + this.coinDropAmount[currentChannel];
                        snowflakesql = `UPDATE currency_db SET currency = ? WHERE user_id = ?`;
                    } else {
                        this.currencies[grabber] = this.coinDropAmount[currentChannel];
                        snowflakesql = `INSERT INTO currency_db (currency, user_id) VALUES (?, ?)`;
                    }

                    clearTimeout(this.messageDeleteTimer[currentChannel]);
                    this.coinActive[currentChannel] = false;
                    this.seenMessages[currentChannel] = 0;
                    this.coinMessages[currentChannel].delete();
                    this.currentCode[currentChannel] = null;
                    if (this.snowfallTimer > 0 && message.channel.id === generalChannel) {
                        this.coinTimers[generalChannel] = snowTimer(
                            this.client, 
                            currentChannel, 
                            this.coinDropAmount, 
                            this.currentCode, 
                            this.snowfallTimer, 
                            this.coinActive, 
                            this.seenMessages,
                            this.coinTimers,
                            this.coinMessages
                        );
                    }
                    this.db.run(snowflakesql, [this.currencies[grabber], grabber], (err) => {
                        if (err) {
                            console.error(err.message);
                        }
                    });

                    if (currentChannel === generalChannel) {
                        this.coinTimers[currentChannel] = snowTimer(this.client, currentChannel, this.coinDropAmount, this.currentCode, this.snowfallTimer, this.coinActive, this.seenMessages, this.coinTimers, this.coinMessages);
                    }
                    message.channel.send(`${message.author.username} caught a snowflake!`).then(response => {
                        response.delete({timeout: 15000});
                    });
                }
                message.delete({timeout: 1000});
            }
        });

        this.dispatch.hook('!setsnowflakeTimer', (message) => {
            const modChannel = this.config.get('bot-channel');
            if (message.channel.id !== modChannel) {
                return;
            }

            const newTimer = parseInt(message.content.substr('!setsnowflakeTimer'.length).trim(), 10);
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
                    this.coinTimers[channel] = snowTimer(this.client, channel, this.coinDropAmount, this.currentCode, this.snowfallTimer, this.coinActive, this.seenMessages, this.coinTimers, this.coinmessages);
                    message.channel.send(`Timer set to ${newTimer} minutes.`);
                } else {
                    message.channel.send(`Timer disabled.`);
                }
            }
        });

        this.dispatch.hook('!setsnowflakeGeneral', (message) => {
            const botChannel = this.config.get('bot-channel');
            if ((/^!setsnowflakeGeneral\s\d+$/).test(message.content) && message.channel.id === botChannel) {
                const countdownText = message.content.substr('!setsnowflakeGeneral'.length).trim();
                this.coinCounterGeneral = parseInt(countdownText, 10);

                this.db.run(`
                    REPLACE INTO currency_countdown (countdown, channel) VALUES (?, ?)
                `, [countdownText, 'general'], (err) => {
                    if (err) {
                        console.error(err.message);
                    }
                });

                const response = this.coinCounter <= 0 ? 
                    'It looks like the weather has cleared up.' : 
                    `Oh it's gonna snow in the general area every ${this.coinCounterGeneral} messages!`;
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
                    message.channel.send(`I\'ve given ${mentionedUser.username} ${amount} snowflakes!`);
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
                    message.channel.send(`I\'ve given you all ${amount} snowflakes!`);
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

                    message.channel.send(`I\'ve given all of ${mentionedRole.name} ${amount} snowflakes!`);
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
                    message.channel.send(`Removed snowflakes from ${mentionedUser.username}, they now have ${this.currencies[id]} snowflakes.`);
                }
            }
        })

        this.dispatch.hook('!setsnowflakePlayground', (message) => {
            const botChannel = this.config.get('bot-channel');
            if ((/^!setsnowflakePlayground\s\d+$/).test(message.content) && message.channel.id === botChannel) {
                const countdownText = message.content.substr('!setsnowflakePlayground'.length).trim();
                this.coinCounterPlayground = parseInt(countdownText, 10);

                this.db.run(`
                    REPLACE INTO currency_countdown (countdown, channel) VALUES (?, ?)
                `, [countdownText, 'playground'], (err) => {
                    if (err) {
                        console.error(err.message);
                    }
                });

                const response = this.coinCounter <= 0 ? 
                    'No more snow...' : 
                    `Oh it's gonna snow in the playground after ${this.coinCounterPlayground} messages!`;
                message.channel.send(response);
            }
        });

        this.dispatch.hook('!setsnowflakeKitchen', (message) => {
            const botChannel = this.config.get('bot-channel');
            if ((/^!setsnowflakeKitchen\s\d+$/).test(message.content) && message.channel.id === botChannel) {
                const countdownText = message.content.substr('!setsnowflakeKitchen'.length).trim();
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
                    `Oh it's gonna snow in the kitchen after ${this.coinCounterKitchen} messages!`;
                message.channel.send(response);
            }
        });

        this.dispatch.hook('!plantdrop', (message) => {
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
        });

        this.dispatch.hook(null, (message) => {
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
                /*if (playgroundChannels.includes(currentChannel)) {
                    messageCap = this.coinCounterPlayground;
                }
                if (kitchenChannels.includes(currentChannel)) {
                    messageCap = this.coinCounterKitchen;
                }*/
                this.seenMessages[currentChannel]++;
              if (this.seenMessages[currentChannel] === messageCap && !this.coinActive[currentChannel]) {
                    this.seenMessages[currentChannel] = 0;
                    this.coinActive[currentChannel] = true;
                    clearTimeout(this.snowfallTimer);
                    const coinEmbed = createCoinEmbedd(currentChannel, this.coinDropAmount, this.currentCode);
                    message.channel.send(coinEmbed).then(msg => {
                        this.coinMessages[currentChannel] = msg;
                        clearTimeout(this.coinTimers[currentChannel]);
                        const generalChannel = this.config.get('general-channel');
                        
                            this.messageDeleteTimer[currentChannel] = setTimeout(() => {
                                if (this.messageDeleteTimer[currentChannel]) {
                                    msg.channel.send('Ruuu... No one caught the snowflake...').then(failedMsg => {
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
                    console.log('made it here')
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
                        page += `**${i + 1}) ${role.name}**:\xa0\xa0\xa0\xa0${cost} :snowflake:\n${info}\n`;
                    } else {
                        page += `**${i + 1}) ${item_id}**:\xa0\xa0\xa0\xa0${cost} :snowflake:\n${info}\n`;
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
                    .setTitle(':snowflake: :snowflake: :snowflake:')
                    .setAuthor('Snowflake Shop!')
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


            const snowflakeArray = Object.entries(this.currencies);
            snowflakeArray.sort((el1, el2) => {
                return parseInt(el2[1], 10) - parseInt(el1[1], 10);
            });
            const topTenPromises = [];
            for (let i = 0; i < 10; i++) {
                if (snowflakeArray[i]) {
                    topTenPromises.push(this.client.users.fetch(snowflakeArray[i][0]));
                }
            }
            await Promise.all(topTenPromises).then((topTen) => {
                const snowflakeLB = new Discord.MessageEmbed()
                    .setTitle('Snowflake Leaderboard!')
                    .setAuthor('The Doghouse');
                for (let j = 0; j < topTen.length; j++) {
                    snowflakeLB.addField(`${topTen[j].username}`, `:snowflake: ${snowflakeArray[j][1]}`);
                }
                message.channel.send(snowflakeLB);
            });
        });

        //===========================Trivia======================//

        this.dispatch.hook('!startTrivia', (message) => {
            const userTimestamp = this.triviaTimestamps[message.author.id];
            const today = Date.now().getDate();

            if (today === userTimestamp) {
                return message.channel.send('You\'ll have to wait until tomorrow to play again!');
            }

            this.triviaTimestamps[message.author.id] = today;
            this.triviaState[message.author.id] = {}
        });
    }
}

module.exports = EventModule;