const sqlite3 = require('sqlite3').verbose();

function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
}

class KeywordModule {
    constructor(context) {
        this.dispatch = context.dispatch;
        this.config = context.config;
        this.db = new sqlite3.Database('../db/AloseDB.db');
        this.keyWords = {};

        this.db.run(`
            CREATE TABLE IF NOT EXISTS keywords (
            keyword_text TEXT,
            response_text TEXT,
            PRIMARY KEY (keyword_text, response_text)
        )`);

        const keywordSql = `SELECT keyword_text, response_text FROM keywords`;

        this.db.all(keywordSql, [], (err, rows) => {
            if (err) {
                throw err;
            }
            rows.forEach((row) => {
                this.keyWords[row.keyword_text] = row.response_text;
            });
        });

        this.dispatch.hook('!addword', (message) => {
            const channels = this.config.get('mod-channels');

            if (channels.includes(message.channel.id)) {
                if ((/^!addword\s"(\w+)"\s"(\w+)"$/).test(message.content)) {
                    const splitMessage = message.content.split('"');
                    this.keyWords[splitMessage[1]] = splitMessage[3];
                    this.db.run(`
                    INSERT INTO keywords (keyword_text, response_text)
                    VALUES (?, ?)
                    `, [splitWords[1], splitWords[3]], (err) => {
                      if (err) {
                        console.error(err.message);
                      }
                    });
                    message.channel.send('Word added!');
                } else {
                    message.channel.send('Improper format! To use this command the format is `!addword "call" "response"`.');
                }
            }
        });
        
        this.dispatch.hook('!removeword', (message) => {
            const channels = this.config.get('mod-channels');

            if (channels.includes(message.channel.id)) {
                if ((/^!removeword\s"(\w+)"$/).test(message.content)) {
                    const splitMessage = message.content.split('"');
                    if (this.keyWords[splitMessage[1]]) {
                        delete keywords[splitMessage[1]];
                        this.db.run(`
                        DELETE FROM keywords WHERE keyword_text=?`, splitWords[1], (err) => {
                          if (err) {
                            console.error(err.message);
                          }
                        });
                        message.channel.send('Word removed!'); 
                    } else {
                        message.channel.send('Word not found!');
                    }
                } else {
                    message.channel.send('Improper format! To use this command the format is `!removeword "word"`.');
                }
            }
        });

        this.dispatch.hook(null, (message) => {
            //Listen for keywords in messages.

            const channels = this.config.get('reply-channels');

            if (channels.includes(message.channel.id) && !message.isMemberMentioned(message.client.user)) {
                for (const key of Object.keys(cannedResponses)) {
                    const wordChecker = new RegExp("(?<=\\s|^)" + escapeRegExp(key) + "(?=\\s|$|[?!.,])");
                    if (wordChecker.test(msg.content)) {
                        msg.channel.send(cannedResponses[key]);
                    }
                }
            }
        });

    }
}

module.exports = KeywordModule;