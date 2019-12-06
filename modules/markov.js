const dictionary = require('../dictionary');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const FETCH_LIMIT = 100;

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

function timeAMessage(MarkovDictionary, client, channel, messageTimer) {
  return setTimeout(() => {
      client.channels.get(channel).send(MarkovDictionary.createMarkovSentence());
      this.timedMessage = timeAMessage(MarkovDictionary, client, channel, messageTimer);
  }, messageTimer )
}


function pullMessages(channelID, begin, client, db) {
  const channel = client.channels.get(channelID);
  if (channel == null) {
    throw new Error(`bad channel ID: ${channelID}`);
  }

  const debugName = `#${channel.name} (${channel.id})`;
  console.log(`* pullMessages(): ${debugName}, starting ${begin}`)

  return channel.fetchMessages({ limit: FETCH_LIMIT, after: begin })
    .then(messages => {
      if (messages.size === 0) {
        console.log(`done for ${debugName}`);
        return;
      }

      const filteredMessages = messages.filter(
        message =>
          !message.author.bot &&
          message.embeds.length === 0 &&
          !message.content.includes('http') &&
          !message.isMentioned(client.user)
      );

      filteredMessages.forEach(message => {
        // console.log(`--- writing ${channel.id}, ${message.id}`);
        db.run(`
        INSERT INTO messages (message_id, message_text, author_id, channel_id)
        VALUES (?, ?, ?, ?)
        `, [message.id, message.content, message.author.id, message.channel.id], (err) => {
          if (err) {
            console.error(err.message);
          }
        });
      });
      console.log(`[${debugName}] saved ${filteredMessages.size} of ${messages.size} messages`);

      if (messages.size === FETCH_LIMIT) {
        return pullMessages(channelID, messages.first().id, client, db);
      }
    })
    .catch(error => {
      console.error(error);
    });
}

function sentenceGenerator(message, MarkovDictionary) {
  let sentence;
  if(message) {
    const words = cleanMessage(message.content).split(/[\s]+/).slice(1);
    let markovWord;
    if (words.length > 0) {
      markovWord = words[Math.floor(Math.random() * words.length)];
    }
    sentence = MarkovDictionary.createMarkovSentence(markovWord);
  } else {
    sentence = MarkovDictionary.createMarkovSentence();
  }

  return sentence;
}

class MarkovModule {
  constructor(context) {
    this.dispatch = context.dispatch;
    this.config = context.config;
    this.client = context.client;
    this.db = new sqlite3.Database(path.join(__dirname, '../db/AloseDB.db'));
    this.MarkovDictionary = new dictionary();
    this.willAuto = this.config.get('auto-reply');
    this.timedMessage;
    this.messageCap = this.config.get('message-cap');
    this.seenMessages = 0;
    this.messageTimer = this.config.get('message-timer') * 60000;
    this.timedMessage;
    if (this.messageTimer) {
      this.timedMessage = timeAMessage(this.MarkovDictionary, this.client, this.config.get('general-channel'), this.messageTimer);
    }

    this.db.run(`
      CREATE TABLE IF NOT EXISTS messages (
        channel_id TEXT NOT NULL,
        message_id TEXT NOT NULL,
        author_id TEXT,
        message_text TEXT,
        PRIMARY KEY (channel_id, message_id)
      )`, (err) => { 
        if (err) {
          console.error(err.message)
        }
        const usedChannels = this.config.get('listen-channels');
        const promises = new Map();
        const makePullPromise = (id, start = 1) => promises.set(id, pullMessages(id, start, this.client, this.db));
    
        const sql = `
        SELECT
          channel_id,
          MAX(message_id) AS last_seen_message
        FROM messages
        GROUP BY channel_id
        `;
        this.db.each(sql, (err, row) => {
          if (err) {
            console.error(err.message);
          }
          if (usedChannels.includes(row['channel_id'])) {
            const lastSeenMessageID = row['last_seen_message'];
            if (lastSeenMessageID != null) {
              makePullPromise(row['channel_id'], row['last_seen_message']);
            }
          }
        }, async () => {
          for (const channelID of usedChannels) {
            if (!promises.has(channelID)) {
              makePullPromise(channelID);
            }
          }
      
          await Promise.all(promises.values());
          console.log('done');

          const messageSql = `SELECT message_text, message_id FROM messages ORDER BY message_id`;
          this.db.all(messageSql, [], (err, rows) => {
            if (err) {
              throw err;
            }
            rows.forEach((row) => {
              const line = cleanMessage(row.message_text);
              if(!line.includes('http')) {
                this.MarkovDictionary.addLine(line);
              }
            });
          });
        });
      });

    this.db.run(`
      CREATE TABLE IF NOT EXISTS bannedwords (
        word_text TEXT,
        PRIMARY KEY (word_text)
      )`, (err) => { 
        if (err) {
          console.error(err.message)
        }
        const bannedSql = `SELECT word_text FROM bannedwords`;

        this.db.all(bannedSql, [], (err, rows) => {
          if (err) {
            throw err;
          }
          rows.forEach((row) => {
            this.MarkovDictionary.addBannedWord(row.word_text);
          });
        });
      });


    this.dispatch.hook(null, (message) => {
      //Add a message to Markov dictionary
      const channels = this.config.get('listen-channels');
      if (channels.includes(message.channel.id) && !message.content.includes('http') && !message.author.bot) {
        this.db.run(`
        INSERT INTO messages (message_id, message_text, author_id, channel_id)
        VALUES (?, ?, ?, ?)
        `, [message.id, message.content, message.author.id, message.channel.id], (err) => {
          if (err) {
            console.error(err.message);
          }
        });
        const lines = cleanMessage(message.content);
        if (lines !== '') {
          this.MarkovDictionary.addLine(lines);
        }
      }
    });

    this.dispatch.hook(null, (message) => {
      //Generate a markov sentence
      const channels = this.config.get('reply-channels');
      if (message.isMemberMentioned(message.client.user) && channels.includes(message.channel.id)) {
        const sentence = sentenceGenerator(message, this.MarkovDictionary);
        message.channel.send(sentence);
      }
    });

    this.dispatch.hook('!banword', (message) => {
      const channels = this.config.get('bot-channel');
      if (channels.includes(message.channel.id)) {
        const bannedWordsParts = message.content.split(' ');
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
              message.channel.send(`${bannedWord} is now on my naughty list!`);
          } else {
            this.db.run(`
            DELETE FROM bannedwords WHERE word_text=?`, bannedWord, (err) => {
              if (err) {
                console.error(err.message);
              }
            });
            message.channel.send(`Ban on ${bannedWord} removed!`);
          }
        } else {
          message.channel.send('Invalid word')
        }
      }
    });

    this.dispatch.hook('!banlist', (message) => {
      const channels = this.config.get('bot-channel');
      if (channels.includes(message.channel.id)) {
        const bannedWords = this.MarkovDictionary.getBannedWords();
        let bannedWordsDisplay = 'I am not allowed to say the following words:\n';
        for (let i = 0; i < bannedWords.length; i++) {
          bannedWordsDisplay += ` - ${bannedWords[i]}\n`;
        }
        message.channel.send(bannedWordsDisplay);
      }
    });

    this.dispatch.hook('!setmessagecap', (message) => {
      const channel = this.config.get('bot-channel');
      if (message.channel.id === channel) {
        const split = message.content.split(' ');
        let newCap = parseInt(split[1]);
        if (isNaN(newCap)) { client.channels.get(message.channel.id).send('That is not a number!'); }
        else {
          this.seenMessages = 0;
          this.messageCap = newCap;
          this.messageCap > 0 ?
            this.client.channels.get(message.channel.id).send(`Message interval to ${this.messageCap} messages.`) :
            this.client.channels.get(message.channel.id).send(`Message interval disabled.`);
          this.config.set('message-cap', newCap);
        }
      }
    });

    this.dispatch.hook(null, (message) => {
      const channel = this.config.get('general-channel');
      if (message.channel.id === channel && !message.author.bot) {
        this.seenMessages++;
        if (this.seenMessages === this.messageCap && this.messageCap > 0) {
          this.seenMessages = 0;
          const sentence = sentenceGenerator(null, this.MarkovDictionary);
          message.channel.send(sentence);
        }
      }
    });

    this.dispatch.hook('!settimer', (message) => {
      const split = message.content.split(' ');
      let newTimer = parseInt(split[1]);
      if (isNaN(newTimer)) { message.channel.send('That is not a number!'); }
      else {
        this.messageTimer = newTimer * 60000;
        clearTimeout(this.timedMessage);
        const channel = this.config.get('general-channel');
        if (this.messageTimer > 0) {
          this.timedMessage = timeAMessage(this.MarkovDictionary, message.client, channel, this.messageTimer);
          message.channel.send(`Timer set to ${newTimer} minutes.`)
        } else {
          message.channel.send(`Timer disabled.`);
        }
        this.config.set('message-timer', newTimer);    
      }
    });

    this.dispatch.hook(null, (message) => {
      if (message.channel.type === 'dm' && !message.author.bot) {
        const adminId = this.config.get('admin-id');
        message.client.fetchUser(adminId).then((admin) => {
          if (message.author.id !== adminId) {
              if (!this.willAuto) {
                admin.send(`${message.author.username} sent the following message, reply with !reply "${message.author.id}" and then your message in quotes **or** !auto "${message.author.id}"`);
                admin.send(`\`\`\`\n${message.content}\n\`\`\``);
              } else {
                admin.send(`${message.author.username} sent the following message, and an automatic reply was sent!"`);
                admin.send(`\`\`\`\n${message.content}\n\`\`\``);
                const sentence = sentenceGenerator(message, this.MarkovDictionary);
                message.author.send(sentence);
                admin.send(`Alose said \n \`\`\`\n${sentence}\n\`\`\``);
              }               
          } else {
            const splitWords = message.content.split('"');
            if (splitWords[1]) {
                message.client.fetchUser(splitWords[1]).then((recipient) => {
                  if (recipient) {
                    if (message.content.startsWith('!reply')) {
                      let attachments = message.attachments.array();
                      checkAttachments(attachments) ? recipient.send(splitWords[3], 
                      {
                          file: attachments[0].url,
                      }) :
                      recipient.send(splitWords[3]); 
                    }

                    if (message.content.startsWith('!auto')) {
                      recipient.dmChannel.fetchMessages({limit: 1}).then((message) => {
                        const sentence = sentenceGenerator(message, this.MarkovDictionary);
                        recipient.send(sentence);
                        admin.send(`Alose said \n \`\`\`\n${sentence}\n\`\`\``);
                      }).catch((reason) => {
                        const sentence = sentenceGenerator();
                        recipient.send(sentence);
                        admin.send(`Alose said \n \`\`\`\n${sentence}\n\`\`\``);
                      })
                    }
                  }
              })
            }
            if (message.content.startsWith('!setAuto')) {
              this.willAuto = !this.willAuto;
              admin.send(`Replying automatically to messages set to: ${this.willAuto}`);
              this.config.set('auto-reply', this.willAuto);
            }
          }
        }); 
      }
    });
  }  
}

module.exports = MarkovModule;