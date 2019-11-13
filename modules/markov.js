const dictionary = require('../dictionary');
const sqlite3 = require('sqlite3').verbose();

function cleanMessage(message) {
  return (message
      // @user, @!user
      .replace(/<@!?(\d+)>/g, (_, mention) => {
        return '';
      })
      // #channel
      .replace(/<#(\d+)>/g, (_, mention) => {
        return '';
      })
      // @role
      .replace(/<@&(\d+)>/g, (_, mention) => {
        return '';
      })
      // :emoji:
      .replace(/<a?:(\w+):(\d+)>/g, (_, mention) => '')
    );
}

class MarkovModule {
    constructor(dispatch, config) {
        this.dispatch = dispatch;
        this.config = config;
        this.db = new sqlite3.Database('../db/AloseDB.db');
        this.MarkovDictionary = new dictionary();
        
        this.db.run(`
          CREATE TABLE IF NOT EXISTS messages (
            channel_id TEXT NOT NULL,
            message_id TEXT NOT NULL,
            author_id TEXT,
            message_text TEXT,
            PRIMARY KEY (channel_id, message_id)
          )`
        );

        this.db.run(`
          CREATE TABLE IF NOT EXISTS bannedwords (
            word_text TEXT,
            PRIMARY KEY (word_text)
          )`
        );

        this.db.all(messageSql, [], (err, rows) => {
          if (err) {
            throw err;
          }
          rows.forEach((row) => {
            const lines = cleanMessage(MarkovDictionary.addLine(row.message_text));
            for (let i = 0; i < lines.length; i++) {
              if (lines[i] !== '') {
                this.MarkovDictionary.addLine(lines[i]);
              }
            }
          });
        });

        this.db.all(bannedSql, [], (err, rows) => {
          if (err) {
            throw err;
          }
          rows.forEach((row) => {
            this.MarkovDictionary.addBannedWord(row.word_text);
          });
        });

        this.dispatch.hook(null, (message, client) => {
          //Add a message to Markov dictionary
          const channels = this.config.get('listen-channels');
          if (channels.includes(message.channel.id)) {
            this.db.run(`
            INSERT INTO messages (message_id, message_text, author_id, channel_id)
            VALUES (?, ?, ?, ?)
            `, [message.id, message.content, message.author.id, message.channel.id], (err) => {
              if (err) {
                console.error(err.message);
              }
            });
            const lines = cleanMessage(message.content);
            for (let i = 0; i < lines.length; i++) {
              if (lines[i] !== '') {
                this.MarkovDictionary.addLine(lines[i]);
              }
            }
          }
        });

        this.dispatch.hook(null, (message, client) => {
          //Generate a markov sentence
          const channels = this.config.get('reply-channels');
          if (message.isMemberMentioned(client.user) && channels.includes(message.channel.id)) {
            let sentence;
              if (message.content) {
                const words = cleanMessage(message.content).split(/[\s]+/).slice(1);
                let markovWord;
                if (words.length > 0) {
                  markovWord = words[Math.floor(Math.random() * words.length)];
                }
                sentence = this.MarkovDictionary.createMarkovSentence(markovWord);
              } else {
                sentence = this.MarkovDictionary.createMarkovSentence();
              }
            message.channel.send(sentence);
          }
        });

        this.dispatch.hook('!banword', (message, client) => {
          const channels = this.config.get('mod-channels');
          if (channels.includes(message.channel.id)) {
            const bannedWordsParts = msg.content.split(' ');
            if (bannedWordsParts.length >= 2) {
              const bannedWord = bannedWordsParts[1].toLowerCase();
              if (this.MarkovDictionary.addBannedWord(bannedWord)) {
                  this.db.run(`
                  INSERT INTO bannedwords (word_text)
                  VALUES (?)
                  `, [bannedWord], (err) => {
                    if (err) {
                      console.error(err.message);
                    }
                  });
                  message.channel.send(`${split[1]} is now on my naughty list!`);
              } else {
                this.db.run(`
                DELETE FROM bannedwords WHERE word_text=?`, bannedWord, (err) => {
                  if (err) {
                    console.error(err.message);
                  }
                });
                message.channel.send.send(`Ban on ${split[1]} removed!`);
              }
            } else {
              message.channel.send('Invalid word')
            }
          }
        });

        this.dispatch.hook('!banlist', () => {
          const channels = this.config.get('mod-channels');
          if (channels.includes(message.channel.id)) {
            const bannedWords = this.MarkovDictionary.getBannedWords();
            let bannedWordsDisplay = 'I am not allowed to say the following words:\n';
            for (let i = 0; i < bannedWords.length; i++) {
              bannedWordsDisplay += ` - ${bannedWords[i]}\n`;
            }
            message.channel.send(bannedWordsDisplay);
          }
        });
    }
    
}

module.exports = MarkovModule;