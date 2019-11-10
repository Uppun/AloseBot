const dictionary = require('../dictionary');
const MarkovDictionary = new dictionary();

class MarkovModule {
    constructor(dispatch) {
        this.dispatch = dispatch;

        this.dispatch.hook(null, (message, client) => {
            //Add a message to Markov dictionary
            db.run(`
            INSERT INTO messages (message_id, message_text, author_id, channel_id)
            VALUES (?, ?, ?, ?)
            `, [message.id, message.content, message.author.id, message.channel.id], (err) => {
              if (err) {
                console.error(err.message);
              }
            });
            console.log('This is the firehose');
        });

        this.dispatch.hook(null, (message, client) => {
            //Generates a Markov sentence
            console.log('This is the firehose');
        });

        this.dispatch.hook('!banword', (message, client) => {
            const bannedWordsParts = msg.content.split(' ');
            if (bannedWordsParts.length >= 2) {
                const bannedWord = bannedWordsParts[1].toLowerCase();
                if (MarkovDictionary.addBannedWord(bannedWord)) {
                    db.run(`
                    INSERT INTO bannedwords (word_text)
                    VALUES (?)
                    `, [bannedWord], (err) => {
                      if (err) {
                        console.error(err.message);
                      }
                    });
                    client.channels.get(msg.channel.id).send(`${split[1]} is now on my naughty list!`);
                } else {
                    db.run(`
                    DELETE FROM bannedwords WHERE word_text=?`, bannedWord, (err) => {
                      if (err) {
                        console.error(err.message);
                      }
                    });
                    client.channels.get(msg.channel.id).send(`Ban on ${split[1]} removed!`);
                }
            } else {
                message.channel.send('Invalid word')
            }
        });

        this.dispatch.hook('!banlist', () => {
            console.log('this is a test command.');
        });
    }
    
}

module.exports = MarkovModule;