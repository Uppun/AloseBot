const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const Discord = require('discord.js');
const codes = require('../assets/coins.js');
const GUESS_LIMIT = 10;

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
    const keyCodes = Array.from(codes.keys());
    currentCode[channel] = keyCodes[Math.floor(Math.random() * keyCodes.length)];
    const image = codes.get(currentCode[channel]);

    const coinEmbed = new Discord.RichEmbed()
        .setTitle('**Some PawPoints appeared!**')
        .attachFile(image)
        .setImage(`attachment://${image.name}`)
        .setAuthor('Paw Points!')
        .setColor('#eb6123')
        .setDescription(`type **!grab [code]** to grab!`);
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

class StoreModule {
    constructor(context) {
        //========== Variable declarations ==========//
        this.dispatch = context.dispatch;
        this.config = context.config;
        this.client = context.client;
        this.db = new sqlite3.Database(path.join(__dirname, '../../sharedDBs/StoreDB.db'));
        this.shopPages = [];
        this.currencies = {};
        this.coinCounterGeneral = 0;
        this.coinCounterOther = 0;
        this.seenMessages = {}; 
        this.coinActive = {};
        this.coinDropAmount = {};
        this.coinMessages = {};
        this.coinTimers = {};
        this.currentCode = {};
        this.guessTimers = {};
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
        //====================================//
        
        //========== Currency Related ==========//
        this.dispatch.hook('!coins', (message) => {
            if (message.content === '!coins') {
                const author = message.author.id;
                const reply = this.currencies[author] ? `You have ${this.currencies[author]} coins!` : `You have no coins...`;
                message.channel.send(reply);
            }

            if ((/^!coins\s<@!?(\d+)>$/).test(message.content)) {
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
            if ((/^!grab\s[A-Za-z0-9]+$/).test(message.content) && this.coinChannels.includes(currentChannel)) {
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

        this.dispatch.hook('!share', (message) => {
            if ((/^!share\s<@!?(\d+)>\s(\d+)$/).test(message.content)) {
                const author = message.author.id;
                const user = message.mentions.users.array()[0];
                const amount = parseInt(message.content.match(/(\d+)/g)[1], 10);

                if (this.currencies[author] > amount) {
                    this.currencies[user.id] = this.currencies[user.id] ? this.currencies[user.id] + amount : amount;
                    this.currencies[author] -= amount
                    this.db.run(`UPDATE currency_db SET currency = ? WHERE user_id = ?`, [this.currencies[user], user], (err) => {
                        if (err) {
                            console.error(err.message);
                        }
                    });
                    this.db.run(`UPDATE currency_db SET currency = ? WHERE user_id = ?`, [this.currencies[author], author], (err) => {
                        if (err) {
                            console.error(err.message);
                        }
                    });
                    message.channel.send(`${message.author.username} shared ${amount} coins with ${user.username}!`);
                } else {
                    message.channel.send(`You can't share coins you don't have!`);
                }
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
            const generalChannel = this.config.get('general-channel');
            const modIds = this.config.get('mod-ids');
            if (message.member.roles.find(r => modIds.includes(r.id)) && (/^!plant\s(\d+)\stime\s(\d+)$/).test(message.content)) {
                const numbers = message.content.match(/(\d+)/g);
                const dropAmount = parseInt(numbers[0], 10);
                const timerAmount = parseInt(numbers[1], 10) * 60000;
                coinPurse(generalChannel, dropAmount, timerAmount, this.client, this.db, this.currencies);
            }
        });

        this.dispatch.hook('!coinbomb', (message) => {
            const announceChannel = this.config.get('announce')
            if (message.member.roles.find(r => modIds.includes(r.id)) && (/^!coinbomb\s(\d+)\stime\s(\d+)$/).test(message.content)) {
                const numbers = message.content.match(/(\d+)/g);
                const dropAmount = parseInt(numbers[0], 10);
                const timerAmount = parseInt(numbers[1], 10) * 60000;
                coinPurse(announceChannel, dropAmount, timerAmount, this.client, this.db, this.currencies);
            }
        });

        this.dispatch.hook(null, (message) => {
            const channel = this.config.get('general-channel');
            const currentChannel = message.channel.id;
            if (this.coinChannels.includes(message.channel.id) && !message.author.bot) {
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

        this.dispatch.hook('!lb', async (message) => {
            const channel = this.config.get('bot-speak-channel');

            if (message.channel.id === channel) {
                const lbArray = Object.entries(this.currencies);
                lbArray.sort((element1, element2) => {
                    return parseInt(element2[1], 10) - parseInt(element1[1], 10);
                });

                const lbPromises = [];
                for (let i = 0; i < lbArray.length; i++) {
                    if (lbArray[i][1] <= 0) {
                        break;
                    }
                    lbPromises.push(this.client.fetchUser(lbArray[i][0]));
                }

                await Promise.all(lbPromises).then(users => {
                    users.sort((user1, user2) => {
                        return parseInt(this.currencies[user2.id], 10) - parseInt(this.currencies[user1.id], 10);
                    });

                    let pages = [];
                    let page = '';
                    let userNum = 0;
                    for (let i = 0; i < users.length; i++) {
                        if (userNum === 9) {
                            pages.push(page);
                            page = '';
                            userNum = 0;
                        }
                        userNum++;
                        page += `${i + 1}) ${users[i].username} - ${this.currencies[users[i].id]}\n`;
                    }

                    if (page !== '') {
                        pages.push(page);
                    }

                    let currentPage = 0;
                    const lbEmbed = new Discord.RichEmbed()
                    .setTitle(':dog: :moneybag: :dog:')
                    .setAuthor('Currency Leaderboard')
                    .setColor('#FF7417')
                    .setFooter(`Page ${currentPage+1} of ${pages.length}`)
                    .setDescription(pages[currentPage]);
                    
                    message.channel.send(lbEmbed).then(msg => {
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
                                lbEmbed.setDescription(pages[currentPage]);
                                lbEmbed.setFooter(`Page ${currentPage+1} of ${pages.length}`);
                                msg.edit(lbEmbed);
                            }
                            removeReactionUsers(reaction);
                        })
                        msg.delete(600000);
                    });
                });
            }
        });

        //======================================//

        //=========== Store Related ===========//
        this.dispatch.hook('!addShop', (message) => {
            const channel = this.config.get('bot-channel');

            if (message.channel.id === channel) {
                if ((/^!addShop\srole\s("[A-Za-z\s]+"|“[A-Za-z\s]+”)\s<@&(\d+)>\s\d+$/).test(message.content)) {
                    const idAndCost = message.content.match(/(\d+)/g);
                    const id = idAndCost[0];
                    const roleCost = parseInt(idAndCost[1], 10);
                    let roleFound = false;
                    const role = message.guild.roles.get(id);
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
                    const itemName = itemElements[0].substr(1, itemElements[0].length - 1);
                    const itemDescription = itemElements[1].substr(1, itemElements[1].length - 2);;
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
            const logChannel = this.client.channels.get(this.config.get('log-channel'));
            if ((/^!buy\s(\d+)$/).test(message.content) && message.channel.id === channel) {
                const itemIndex = parseInt(message.content.match(/(\d+)/g), 10);
                const purchase = this.shopPages[itemIndex - 1];
                if (purchase){
                    if (purchase.type === 'role') {
                        if (message.member.roles.find(r => r.id === purchase.item_id)) {
                            message.channel.send('You already have this role!');
                        } else {
                            if (purchase.cost > parseInt(this.currencies[message.author.id])) {
                                message.channel.send('You can\'t afford this role!');
                            } else {
                                const setRole = message.guild.roles.find(r => r.id === purchase.item_id);
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
                                message.member.addRole(setRole, 'Bought from store');
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

        this.dispatch.hook('!iamnot', (message) => {
            const botChannel = this.config.get('bot-speak-channel');
            if (message.channel.id === botChannel) {
                const roleName = message.content.substr('!iamnot'.length).trim();
                const role = message.guild.roles.find(role => role.name === roleName);
                if (role) {
                    const roleCheck = this.shopPages.filter(entry => entry.item_id === role.id);
                    if (roleCheck) {
                        if(message.member.roles.find(role => role.id === roleCheck[0].item_id)) {
                            message.member.removeRole(role.id).then(member => {
                                message.channel.send(`${member.displayName} you no longer have the ${role.name} role!`)
                            });
                        } else {
                            message.channel.send(`You don't have that role!`)
                        }
                    }
                } else {
                    message.channel.send('That role doesn\'t exist! Be careful, it\'s case sensitive!');
                }
            }
        });

        this.dispatch.hook('!shop', (message) => {
            const botSpeakChannel = this.config.get('bot-speak-channel');
            const modCommandsChannel = this.config.get('bot-channel');
            if (message.channel.id === botSpeakChannel || message.channel.id === modCommandsChannel) {
                let pages = [];
                let page = '';
                const guild = message.guild;

                for (const [i, {type, item_id, info, cost}] of this.shopPages.entries()) {
                    if (type === 'role') {
                        page += `**${i + 1}) ${guild.roles.get(item_id).name}**:\xa0\xa0\xa0\xa0${cost} :moneybag:\n${info}\n`;
                    } else {
                        page += `**${i + 1}) ${item_id}**:\xa0\xa0\xa0\xa0${cost} :moneybag:\n${info}\n`;
                    }
                    if ((i + 1) % 2 === 0) {
                        if ((i + 1) % 4 === 0) {
                            pages.push(page);
                            page = '';
                        } else {
                            page += `\n\n`;
                        }
                    } else {
                        const totalSpaces = 22 - cost.length - guild.roles.get(item_id).name.length;
                        for (let i = 0; i < totalSpaces; i++) {
                            page += `\xa0`;
                        }
                    }

                    if (page && i+1 === this.shopPages.length) {
                        pages.push(page);
                    }
                }

                let currentPage = 0;

                const shopEmbed = new Discord.RichEmbed()
                    .setTitle(':dog: :moneybag: :dog:')
                    .setAuthor('Alose\'s shop!')
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
                        removeReactionUsers(reaction);
                    })
                    msg.delete(600000);
                });
            }
        });
        //=====================================//

        //============ Alose Games ============//

        this.dispatch.hook('!flip', (message) => {
            const channel = this.config.get('game-channel');
            const user = message.author.id;

            if (/^!flip\s(h|t)\s(\d+)$/.test(message.content) && message.channel.id === channel) {
                const betAmount = parseInt(message.content.match(/(\d+)/g), 10);
                const guess = message.content.match(/(h|t)/g);
                if (betAmount > 0) {
                    if (!this.currencies[user]) {
                        message.channel.send('You can\'t play without any coins...');
                    } else {
                        if (this.currencies[user] - betAmount < 0) {
                            message.channel.send('You don\'t have that many coins!');   
                        } else {
                            const betEmbed = new Discord.RichEmbed()
                                .setTitle(':moneybag: Coin Flip! :moneybag:')
                                .setAuthor('The Doghouse');
                            this.currencies[user] -= betAmount;
                            const choices = [0, 0, 0, 1, 1];
                            const result = choices[Math.floor(Math.random() * choices.length)];
                            const winnings = Math.floor(betAmount * (result > 0 ? .5 : 1.5));
                            this.currencies[user] += winnings;
                            let resultMessage;
                            if (result === 1) {
                                resultMessage = guess[0] === 'h' ? 
                                    `It\'s heads! You won ${betAmount - winnings} coins!` :
                                    `It\'s tails! You won ${betAmount - winnings} coins!`;  
                            } else {
                                resultMessage = guess[0] === 'h' ? 
                                    `It\'s tails! You lost... you get back ${winnings - betAmount} coins...` :
                                    `It\'s heads! You lost... you get back ${winnings - betAmount} coins...`;  
                            }
                            betEmbed.setDescription(resultMessage);
                            message.channel.send(betEmbed);
                            this.db.run(`UPDATE currency_db SET currency = ? WHERE user_id = ?`, [this.currencies[user], user], (err) => {
                                if (err) {
                                    console.error(err.message);
                                }
                            });
                        }
                    }
                } else {
                    message.channel.send('You need to at least wager something!');
                }
            }
        });

        this.dispatch.hook('!rps', (message) => {
            const channel = this.config.get('game-channel');
            const user = message.author.id;

            if (/^!rps\s(rock|paper|scissors)\s(\d+)$/.test(message.content) && message.channel.id === channel) {
                const betAmount = parseInt(message.content.match(/(\d+)/g), 10);
                const guess = message.content.match(/(rock|paper|scissors)/g);
                if (betAmount > 0) {
                    if (!this.currencies[user]) {
                        message.channel.send('You can\'t play without any coins...');
                    } else {
                        if (this.currencies[user] - betAmount < 0) {
                            message.channel.send('You don\'t have that many coins!');   
                        } else {
                            const betEmbed = new Discord.RichEmbed()
                                .setTitle(':moneybag: Rock Paper Scissors! :moneybag:')
                                .setAuthor('The Doghouse');
                            this.currencies[user] -= betAmount;
                            const choices = ['rock', 'paper', 'scissors'];
                            const result = choices[Math.floor(Math.random() * choices.length)];
                            let resultNum;
                            if (guess[0] === result) {
                                resultNum = 1;
                            } else {
                                switch (guess[0]) {
                                    case 'rock': {
                                        resultNum = result === 'paper' ? .5 : 1.5;
                                        break;
                                    }

                                    case 'paper' : {
                                        resultNum = result === 'scissors' ? .5 : 1.5;
                                        break;
                                    }

                                    case 'scissors': {
                                        resultNum = result === 'rock' ? .5 : 1.5;
                                        break;
                                    }
                                    default: {
                                        break;
                                    }
                                }
                            }
                            const winnings = Math.floor(betAmount * resultNum);
                            this.currencies[user] += winnings;
                            let resultMessage;
                            if (winnings > betAmount) {
                                resultMessage = `It's ${result}! You win ${winnings - betAmount} coins!`;  
                            } else {
                                resultMessage = winnings === betAmount ? 
                                    `It's ${result}! It's a tie! You get your coins back!` :
                                    `It's ${result}! You lose ${betAmount - winnings} coins...`;
                            }
                            betEmbed.setDescription(resultMessage);
                            message.channel.send(betEmbed);
                            this.db.run(`UPDATE currency_db SET currency = ? WHERE user_id = ?`, [this.currencies[user], user], (err) => {
                                if (err) {
                                    console.error(err.message);
                                }
                            });
                        }
                    }
                } else {
                    message.channel.send('You need to at least wager something!');
                }
            }
        });

        this.dispatch.hook('!guess', (message) => {
            const channel = this.config.get('game-channel');
            const user = message.author.id;

            if (/^!guess\s(\d+)$/.test(message.content) && message.channel.id === channel) {
                const guess = parseInt(message.content.match(/(\d+)/g), 10);
                if (guess > GUESS_LIMIT || guess <= 0) {
                    message.channel.send(`You need to guess a number between 1 and ${GUESS_LIMIT}!`);
                } else {
                    if (this.guessTimers[user] === undefined || this.guessTimers[user] === false) {
                        this.guessTimers[user] = true;
                        setTimeout(() => {
                            this.guessTimers[user] = false;
                        }, 10800000);
                        const answer = Math.floor(Math.random() * GUESS_LIMIT + 1);
                        if (answer === guess) {
                            this.currencies[user] = this.currencies[user] ? this.currencies[user] + 100 : 100;
                            this.db.run(`UPDATE currency_db SET currency = ? WHERE user_id = ?`, [this.currencies[user], user], (err) => {
                                if (err) {
                                    console.error(err.message);
                                }
                            });
                            message.channel.send(`Correct! The answer was ${answer}!`);
                        } else {
                            message.channel.send(`Oh... sorry! The correct answer was ${answer}! Try again in three hours!`);
                        }
                    } else {
                        message.channel.send('You can\'t guess yet! You still need to wait longer.');
                    }
                }
            }
        });
    }
}

module.exports = StoreModule;