const sqlite3 = require('sqlite3').verbose();
const path = require('path');

function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
}

class KeywordModule {
    constructor(context) {
        this.dispatch = context.dispatch;
        this.config = context.config;
        this.db = new sqlite3.Database(path.join(__dirname, '../db/AloseDB.db'));
        this.keyWords = {};

        this.db.run(`
            CREATE TABLE IF NOT EXISTS keywords (
            keyword_text TEXT,
            response_text TEXT,
            PRIMARY KEY (keyword_text, response_text)
        )`, 
        (err) => { 
            if (err) {
                console.error(err.message);
            }
            const keywordSql = `SELECT keyword_text, response_text FROM keywords`;

            this.db.all(keywordSql, [], (err, rows) => {
                if (err) {
                    throw err;
                }
                rows.forEach((row) => {
                    this.keyWords[row.keyword_text] = row.response_text;
                });
            });
    
            console.log('Keywords loaded');
        });


        this.dispatch.hook('!addword', (message) => {
            const channel = this.config.get('bot-channel');

            if (channel === message.channel.id) {
                if ((/^!addword\s(("[^"\r\n]*")|(“[^"\r\n]*”))\s(("[^"\r\n]*")|(“[^"\r\n]*”))$/).test(message.content)) {
                    let content = message.content;
                    content = content.replace('“', '"');
                    content = content.replace('”', '"');
                    const splitMessage = message.content.split('"');
                    this.keyWords[splitMessage[1]] = splitMessage[3];
                    this.db.run(`
                    INSERT INTO keywords (keyword_text, response_text)
                    VALUES (?, ?)
                    `, [splitMessage[1], splitMessage[3]], (err) => {
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
            const channel = this.config.get('bot-channel');

            if (channel === message.channel.id) {
                if ((/^!removeword\s(("[^"\r\n]*")|(“[^"\r\n]*”))$/).test(message.content)) {
                    const splitMessage = message.content.split('"');
                    if (this.keyWords[splitMessage[1]]) {
                        delete this.keyWords[splitMessage[1]];
                        this.db.run(`
                        DELETE FROM keywords WHERE keyword_text=?`, splitMessage[1], (err) => {
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

        this.dispatch.hook('!wordlist', (message) => {
            const channel = this.config.get('bot-channel');

            if (channel === message.channel.id) {
                let string = 'My phrase associations are: \n'
                for (const [key, value] of Object.entries(this.keyWords)) {
                    string += `${key} => ${value}\n`;
                }
                message.channel.send(string);
            }
        });

        this.dispatch.hook(null, (message) => {
            //Listen for keywords in messages.

            const channels = this.config.get('reply-channels');

            if (channels.includes(message.channel.id) && !message.author.bot) {
                for (const key of Object.keys(this.keyWords)) {
                    const wordChecker = new RegExp("(?<=\\s|^)" + escapeRegExp(key) + "(?=\\s|$|[?!.,])");
                    if (wordChecker.test(message.content)) {
                        message.channel.send(this.keyWords[key]);
                    }
                }
            }
        });

    }
}

module.exports = KeywordModule;