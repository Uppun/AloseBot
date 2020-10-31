const sqlite3 = require('sqlite3').verbose();
const path = require('path');

function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
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

class ImageModule {
    constructor(context) {
        this.dispatch = context.dispatch;
        this.config = context.config;
        this.client = context.client;
        this.prompts = {};
        this.db = new sqlite3.Database(path.join(__dirname, '../db/LulenaDB.db'));

        this.db.run(`
        CREATE TABLE IF NOT EXISTS storedpics (
        prompt_text TEXT,
        url_text TEXT,
        PRIMARY KEY (prompt_text, url_text)
    )`, 
    (err) => { 
        if (err) {
            console.error(err.message);
        }
        const promptSql = `SELECT prompt_text, url_text FROM storedpics`;

        this.db.all(promptSql, [], (err, rows) => {
            if (err) {
                throw err;
            }
            rows.forEach((row) => {
                this.prompts[row.prompt_text] = row.url_text;
            });
        });

        console.log('Stored pics loaded!');
    });

        this.dispatch.hook('?storepic', (message) => {
            const channel = this.config.get('bot-channel');
            if (message.channel.id === channel) {
                let attachments = message.attachments.array();
                if (attachments.length === 0) {
                    message.channel.send('You need to attach an image file for me to store!');
                    return;
                }
                
                const prompt = message.content.slice('?storepic'.length).trim();
                if (!prompt) {
                    message.channel.send('You need to include a prompt!');
                    return;
                }

                this.prompts[prompt] = attachments[0].url;

                this.db.run(`
                INSERT INTO storedpics (prompt_text, url_text)
                VALUES (?, ?)
                `, [prompt, this.prompts[prompt]], (err) => {
                  if (err) {
                    console.error(err.message);
                  }
                });

                message.channel.send('I have stored the image!');
            }
        });

        this.dispatch.hook('?removepic', (message) => {
            const channel = this.config.get('bot-channel');
            if (message.channel.id === channel) {
       
                const prompt = message.content.slice('?removepic'.length).trim();
                if (!prompt) {
                    message.channel.send('You need to include a prompt!');
                    return;
                }

                if (!this.prompts[prompt]) {
                    message.channel.send('I don\'t have that stored anywhere!');
                    return;
                }

                delete this.prompts[prompt]

                this.db.run(`
                DELETE FROM storedpics WHERE prompt_text=?`, prompt, (err) => {
                    if (err) {
                    console.error(err.message);
                    }
                });
                
                message.channel.send('Stored pic removed!');
            }
        });

        this.dispatch.hook('?listpics', (message) => {
            const channel = this.config.get('bot-channel');
            if (channel === message.channel.id) {
                const prompts = Object.keys(this.prompts);
                if (prompts.length < 1) {
                    return message.channel.send('I don\'t have any stored pictures!');
                }
                const pages = [];
                let page = ``;
                let entriesNum = 0;
                for (let i = 0; i < prompts.length; i++) {
                    if (entriesNum === 10) {
                        pages.push(page);
                        page = ``;
                        entriesNum = 0
                    }
                    entriesNum++;
                    page += `${prompts[i]}`;
                }
                if (page !== ``) {
                    pages.push(page);
                }

                let currentPage = 0;
                const promptEmbed = new Discord.MessageEmbed()
                    .setAuthor(`Lulena`)
                    .setFooter(`Page ${currentPage+1} of ${pages.length}`)
                    .setDescription(pages[currentPage]);
                
                message.channel.send(promptEmbed).then(msg => {
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
                            promptEmbed.setDescription(pages[currentPage]);
                            promptEmbed.setFooter(`Page ${currentPage+1} of ${pages.length}`);
                            msg.edit(promptEmbed);
                        }
                        removeReactionUsers(reaction, this.client.user.id);
                    })
                });
            }
        });

        this.dispatch.hook(null, (message) => {
            //Listen for prompts in messages.

            const channels = this.config.get('reply-channels');

            if (channels.includes(message.channel.id) && !message.author.bot) {
                for (const key of Object.keys(this.prompts)) {
                    const wordChecker = new RegExp("(?<=\\s|^)" + escapeRegExp(key) + "(?=\\s|$|[?!.,])");
                    if (wordChecker.test(message.content)) {
                        message.channel.send(this.prompts[key]);
                    }
                }
            }
        });
    }
}

module.exports = ImageModule;