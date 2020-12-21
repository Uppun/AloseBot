const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const Discord = require('discord.js');

class TimedMessagesModule {
    constructor(context) {
        this.dispatch = context.dispatch;
        this.config = context.config;
        this.client = context.client;
        this.timedMessagePairs = new Map();
        this.cooldown = 0;
        this.lastReply = 0;
        this.db = new sqlite3.Database(path.join(__dirname, '../db/LulenaDB.db'));

        this.db.run(`
        CREATE TABLE IF NOT EXISTS timed_replies (
        reply_text TEXT,
        PRIMARY KEY (reply_text)
        )`, 
        (err) => { 
            if (err) {
                console.error(err.message);
            }
            const timedMessageSql = `SELECT reply_text FROM timed_replies`;

            this.db.all(timedMessageSql, [], (err, rows) => {
                if (err) {
                    throw err;
                }
                rows.forEach((row) => {
                    this.timedMessagePairs.set(row.reply_text, 0);
                });
            });

            console.log('replies loaded');
        });

        this.db.run(`
        CREATE TABLE IF NOT EXISTS reply_cooldown (
        text TEXT,
        cooldown TEXT,
        PRIMARY KEY (text, cooldown)
        )`, 
        (err) => { 
            if (err) {
                console.error(err.message);
            }
            const cooldownSql = `SELECT text, cooldown FROM reply_cooldown`;

            this.db.all(cooldownSql, [], (err, rows) => {
                if (err) {
                    throw err;
                }
                rows.forEach((row) => {
                    console.log(row)
                    this.cooldown = parseInt(row.cooldown, 10);
                });
            });

            console.log('cooldown loaded');
        });


        this.dispatch.hook('!storeReply', (message) => {
            const channel = this.config.get('bot-channel');
            if (message.channel.id !== channel) {
                return;
            }
            if (!(/^\!storeReply\s(("[^"\r\n]*")|(“[^"\r\n]*”))$/).test(message.content)) {
                return message.channel.send("Incorrect format! it's `!storeReply \"Reply\"`\n Example: `!storeReply \"Hello!\"`!");
            }

            const trimmed = message.content.substr('!storeReply'.length).trim();
            const [, response] = trimmed.split('"');


            this.timedMessagePairs.set(response, 0);

            this.db.run(`
            INSERT INTO timed_replies (reply_text)
            VALUES (?)
            `, [response], (err) => {
              if (err) {
                console.error(err.message);
              }
            });

            message.channel.send('I\'ve stored that response!');
        });

        this.dispatch.hook('!removeReply', (message) => {
            const channel = this.config.get('bot-channel');
            if (message.channel.id !== channel) {
                return;
            }

            if (!(/^\!removeReply\s(("[^"\r\n]*")|(“[^"\r\n]*”))$/).test(message.content)) {
                return message.channel.send("Incorrect format! it's `!removeReply \"Reply\"`!");
            }

            const trimmed = message.content.substr('!removeReply'.length).trim();
            const [, response] = trimmed.split('"');

            if (!this.timedMessagePairs.has(response)) {
                return message.channel.send('I do not have that reply stored!');
            }

            this.timedMessagePairs.delete(response);
            this.db.run(`
            DELETE FROM timed_replies WHERE reply_text=?`, response, (err) => {
                if (err) {
                console.error(err.message);
                }
            });
            message.channel.send('Reply removed!'); 
        });

        this.dispatch.hook('!replyList', (message) => {
            const channel = this.config.get('bot-channel');
            if (channel === message.channel.id) {
                const wordPairs = Array.from(this.timedMessagePairs);
                if (wordPairs.length < 1) {
                    return message.channel.send('I don\'t have stored replies!');
                }
                const pages = [];
                let page = ``;
                let entriesNum = 0;
                for (let i = 0; i < wordPairs.length; i++) {
                    if (entriesNum === 10) {
                        pages.push(page);
                        page = ``;
                        entriesNum = 0
                    }
                    entriesNum++;
                    page += `Reply: "${wordPairs[i][0]}"\n`;
                }
                if (page !== ``) {
                    pages.push(page);
                }

                let currentPage = 0;
                const wordEmbed = new Discord.MessageEmbed()
                    .setAuthor(`dum`)
                    .setFooter(`Page ${currentPage+1} of ${pages.length}`)
                    .setDescription(pages[currentPage]);
                
                message.channel.send(wordEmbed).then(msg => {
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
                            wordEmbed.setDescription(pages[currentPage]);
                            wordEmbed.setFooter(`Page ${currentPage+1} of ${pages.length}`);
                            msg.edit(wordEmbed);
                        }
                        removeReactionUsers(reaction, this.client.user.id);
                    })
                });
            }
        });

        this.dispatch.hook('!setCooldown', message => {
            const channel = this.config.get('bot-channel');
            if (message.channel.id !== channel) {
                return;
            }

            const newCD = message.content.substr('!setCooldown'.length).trim();
            const CDNum = parseInt(newCD, 10);
            if (isNaN(CDNum)) { return message.channel.send('That is not a valid number!') }

            this.cooldown = CDNum;

            this.db.run(`
            INSERT INTO reply_cooldown (text, cooldown)
            VALUES (?, ?)
            `, ['cooldown', newCD], (err) => {
              if (err) {
                console.error(err.message);
              }
            });

            message.channel.send(`Cooldown is now ${this.cooldown} seconds!`);
        });

        //Listen for pings and send off a reply
        this.dispatch.hook(null, (message) => {
            if (Date.now() - this.lastReply < this.cooldown * 1000) {
                return;
            }

            const channels = this.config.get('reply-channels');
            if (message.mentions.has(message.client.user) && channels.includes(message.channel.id)) {
                const activeReplies = Array.from(this.timedMessagePairs).filter(([, lastUsage]) => Date.now() - lastUsage > 60000);
                const pickedReply = activeReplies[Math.floor(Math.random() * activeReplies.length)];

                if (pickedReply) {
                    const [reply, ] = pickedReply;
                    message.channel.send(reply);
                    this.lastReply = Date.now();
                    this.timedMessagePairs.set(reply, Date.now());
                }
            }
        });
    }
}

module.exports = TimedMessagesModule;