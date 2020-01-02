class StoreModule {
    constructor(context) {
        this.dispatch = context.dispatch;
        this.config = context.config;
        this.client = context.client;
        this.db = new sqlite3.Database(path.join(__dirname, '../db/StoreDB.db'));
        this.shopPages = [];

        this.db.run(`
            CREATE TABLE IF NOT EXISTS shop_items (
            item_id TEXT,
            cost TEXT,
            PRIMARY KEY (item_name, item_id)
        )`, 
        (err) => { 
            if(err) {
                console.error(err.message);
            }
            const shopSql = `SELECT item_id, cost FROM shop_items`;

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

        this.dispatch.hook('!addShop', (message) => {
            const channel = this.config.get('bot-channel');
            if (message.channel.id === channel && (/^!addShop\s<@&(\d+)>\s\d+$/).test(message.content)) {
                const mentionedRole = message.mentions.roles.array()[0];
                const roleCost = msg.content.split(' ')[2];
                let roleFound = false;

                for (let [i, [role, cost]] of shopPages.entries()) {
                    if (role === mentionedRole.id) {
                        shopPages[i][1] = roleCost;
                        roleFound = true;
                        this.db.run(`
                        UPDATE shop_items 
                        SET cost = ?
                        WHERE item_id = ? 
                        `, [roleCost, mentionedRole.id], (err) => {
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
                    `, [mentionedRole.id, roleCost], (err) => {
                    if (err) {
                        console.error(err.message);
                    } else {
                        shopPages.push([mentionedRole.id, roleCost]);
                        message.channel.send(`Role added!`);
                    }});          
                }
            }
        });

        this.dispatch.hook('!removeShop', (message) => {
            const channel = this.config.get('bot-channel');
            if (message.channel.id === channel && (/^!removeShop\s\d+$/).test(message.content)) {
                let itemIndex = parseInt(message.content.substr('!removeShop'.length).trim(), 10);
                if (shopPages.length >= itemIndex && itemIndex > 0) {
                    this.db.run(`
                    DELETE FROM shop_items WHERE item_id=?`, shopPages[itemIndex - 1][0], (err) => {
                      if (err) {
                        console.error(err.message);
                      }
                    });
                    shopPages = shopPages.filter((elements, index) => index !== itemIndex - 1);
                    message.channel.send('Shop item deleted!');
                } else {
                    message.channel.send('Couldn\'t find item! The proper use of this command is "!removeshop item#');
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

                    if (page && i+1 === shopPages.length) {
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
                        return reactionMap.has(reaction.emoji.name) && user.id !== botId;
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