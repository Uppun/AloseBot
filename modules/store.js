const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const Discord = require('discord.js');

class StoreModule {
    constructor(context) {
        this.dispatch = context.dispatch;
        this.config = context.config;
        this.client = context.client;
        this.db = new sqlite3.Database(path.join(__dirname, '../../sharedDBs/StoreDB.db'));
        this.shopPages = [];
        this.currencies = {};

        this.db.run(`
        CREATE TABLE IF NOT EXISTS shop_items (
          item_id TEXT,
          cost TEXT,
          PRIMARY KEY (item_id)
        )`, (err) => { 
            if (err) {
                console.error(err.message);
            }
            const shopSql = `SELECT item_id, cost FROM shop_items ORDER by item_id`;

            this.db.all(shopSql, [], (err, rows) => {
                if (err) {
                    throw err;
                }
                rows.forEach((row) => {
                    this.shopPages.push([row.item_id, row.cost]);
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
                    this.currencies[row.user_id] = row.currency;
                });
            });
            console.log('Currency DB loaded.')
        });

        this.dispatch.hook('!addShop', (message) => {
            const channel = this.config.get('bot-channel');
            if (message.channel.id === channel && (/^!addShop\s<@&(\d+)>\s\d+$/).test(message.content)) {
                const idAndCost = message.content.match(/(\d+)/g);
                const id = idAndCost[0];
                const roleCost = parseInt(idAndCost[1], 10);
                let roleFound = false;
                const role = message.guild.roles.get(id);
                if (role) {
                    for (let [i, [role, cost]] of this.shopPages.entries()) {
                        if (role === id) {
                            this.shopPages[i][1] = roleCost;
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
                        this.db.run(`
                        INSERT INTO shop_items (item_id, cost)
                        VALUES (?, ?)
                        `, [id, roleCost], (err) => {
                        if (err) {
                            console.error(err.message);
                        } else {
                            this.shopPages.push([id, roleCost]);
                            message.channel.send(`Role added!`);
                        }});          
                    }
                } else {
                    message.channel.send('Error! Role not found.');
                }
            }
            
        });

        this.dispatch.hook('!removeShop', (message) => {
            const channel = this.config.get('bot-channel');
            if (message.channel.id === channel && (/^!removeShop\s\d+$/).test(message.content)) {
                let itemIndex = parseInt(message.content.substr('!removeShop'.length).trim(), 10);
                if (this.shopPages.length >= itemIndex && itemIndex > 0) {
                    this.db.run(`
                    DELETE FROM shop_items WHERE item_id=?`, this.shopPages[itemIndex - 1][0], (err) => {
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
            if ((/^!buy\s(\d+)$/).test(message.content) && message.channel.id === channel) {
                const itemIndex = parseInt(message.content.match(/(\d+)/g), 10);
                const role = this.shopPages[itemIndex - 1];
                if (role){
                    if (message.member.roles.find(r => r.id === role[0])) {
                        message.channel.send('You already have this role!');
                    } else {
                        if (role[1] > parseInt(this.currencies[message.author.id])) {
                            message.channel.send('You can\'t afford this role!');
                        } else {
                            const setRole = message.guild.roles.find(r => r.id === role[0]);
                            this.currencies[message.author.id] = parseInt(this.currencies[message.author.id], 10) - parseInt(role[1], 10);
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
                        }
                    }
                }
            }
        });

        this.dispatch.hook('!shop', (message) => {
            const botSpeakChannel = this.config.get('bot-speak-channel');
            if (message.channel.id === botSpeakChannel) {
                let pages = [];
                let page = '';
                const guild = message.guild;

                for (const [i, [roleId, cost]] of this.shopPages.entries()) {
                    page += `**${i + 1}) ${guild.roles.get(roleId).name}**:\xa0\xa0\xa0\xa0${cost} :moneybag:`
                    if ((i + 1) % 2 === 0) {
                        if ((i + 1) % 4 === 0) {
                            pages.push(page);
                            page = '';
                        } else {
                            page += `\n\n`;
                        }
                    } else {
                        const totalSpaces = 22 - cost.length - guild.roles.get(roleId).name.length;
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
    }
}

module.exports = StoreModule;