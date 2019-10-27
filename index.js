const Discord = require('discord.js');
const fs = require('fs');
const dictionary = require('./dictionary');
const botInfo = require('./channelStuff');
const https = require('https');
const sqlite3 = require('sqlite3').verbose();

const token = botInfo.botToken;
const botChannel = botInfo.botChannel;
const generalChannel = botInfo.chatChannel;
const botSpeakChannel = botInfo.botSpeakChannel;
const announceChannel = botInfo.announceChannel;
const botId = botInfo.botId;
const client = new Discord.Client();
let startingPoint;
let pullChannel;
const cannedResponses = {};
const currencyDatabase = {};
const countDowns = {};
const MarkovDictionary = new dictionary();
let hasLoaded = false;
let timedMessage;
let seenMessages = 0;
let coinMessages = 0;
let coinDropAmount = 0;
let messageTimer = 0;
let messageCap = 0;
let isAwake = true;
let usedChannels;
const hugCooldowns = [];
let shopPages = [];
let coinCounter = -1;
let coinsActive = false;
let currentGrab = '';
let coinMsg;
const grabMsgArray = [];
let birthdays = {};
let willAuto = false;
const FETCH_LIMIT = 100;

const db = new sqlite3.Database('./db/AloseDB.db');

db.run(`
CREATE TABLE IF NOT EXISTS messages (
  channel_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  author_id TEXT,
  message_text TEXT,
  PRIMARY KEY (channel_id, message_id)
)
`);

db.run(`
CREATE TABLE IF NOT EXISTS keywords (
  keyword_text TEXT,
  response_text TEXT,
  PRIMARY KEY (keyword_text, response_text)
)
`);

db.run(`
CREATE TABLE IF NOT EXISTS birthdays (
  user_id TEXT,
  date_text TEXT,
  PRIMARY KEY (user_id)
)
`);

db.run(`
CREATE TABLE IF NOT EXISTS bannedwords (
  word_text TEXT,
  PRIMARY KEY (word_text)
)
`);

const grabCodes = [
    'test1',
    'test2',
    'test3',
    'test4',
    'test5',
]

const fileTypes = [
    'jpg',
    'jpeg',
    'png',
    'gif',
    'mp4',
    'webm',
];

const eightBallReplies = [
    '🡸 Alose catches the ball mid-air!\`\`\`✅ It is certain.',
    '🡸 Alose chases after the ball, running back to you excitedly and dropping it at your feet.\`\`\`✅ Without a doubt.',
    '🡸 Alose snatches the ball, scampering back to you with it in her mouth as her tail wags ferociously.\`\`\`✅ Yes - definitely.',
    '🡸 Alose chases after the ball, losing it momentarily before finding it and returning it to you.\`\`\`✅ Most likely.',
    '🡸 Alose bounds after the ball, returning with it and some puppy kisses too.\`\`\`✅ Outlook good.',
    '🡸 Alose catches it, returning it swiftly to you. Drool and all!\`\`\`✅ Yes.',
    '🡸 Alose returns it, dropping it on the ground and tilting her head.\`\`\`❔ Reply hazy, try again.',
    '🡸 Alose runs after the ball and brings you back a stick.\`\`\`❔ Ask again later.',
    '🡸 Alose runs after the ball but leaves it where it is, returning to you empty handed.\`\`\`❔ Better not tell you now.',
    '🡸 Alose runs after the ball and catches it.. but refuses to return it.\`\`\`❔ Cannot predict now.',
    '🡸 Alose is bonked in the head by the ball from your misaimed throw.\`\`\`❔ Concentrate and ask again.',
    '🡸 Alose watches you throw the ball.. just watches you.\`\`\`🅾️ Don’t count on it.',
    '🡸 Alose believes you haven\'t thrown the ball at all.\`\`\`🅾️ My reply is no.',
    '🡸 Alose runs in the direction of the ball... and then past it, she\'s clearly lost her way.\`\`\`🅾️ My sources say no.',
    '🡸 Alose doesn\'t chase the ball, preferring to chase her tail instead.\`\`\`🅾️ Outlook not so good.',
    '🡸 Alose chases after the ball before accidentally swallowing it whole.\`\`\`🅾️ Very doubtful.',
];

function longTimeout(cb, delay) {
    const MAX_DELAY = Math.pow(2, 31)-1;

    if (delay > MAX_DELAY) {
        let args = arguments;
        args[1] -= MAX_DELAY;

        return client.setTimeout(() => {
            longTimeout.apply(undefined, args);
        }, MAX_DELAY);
    }

    return client.setTimeout.apply(undefined, arguments);
}

function removeReactionUsers(reaction) {
    reaction.fetchUsers().then(users => {
        for (const key of users.keys()) {
            if (key !== botId) {
                reaction.remove(key)
            }
        }
    });
}

function makePings(message) {
    if (!message.includes('@')) {
        return message;
    }

    const guild = client.guilds.array()[0];
    let newMessage = (' ' + message).slice(1);
    const members = guild.members.array();
    for (const member of members) {
      if (newMessage.includes(('@' + member.user.username)) || newMessage.includes(('@' + member.user.username.toLowerCase())) ) {
        newMessage = newMessage.replace(('@' + member.user.username), ('<@' + member.user.id + '>'));
        newMessage = newMessage.replace(('@' + member.user.username.toLowerCase()), ('<@' + member.user.id + '>'));
      }
      if (member.nickname) {
        if (newMessage.includes(('@' + member.nickname)) || newMessage.includes(('@' + member.nickname.toLowerCase()))) {
          newMessage = newMessage.replace(('@' + member.nickname), ('<@!' + member.user.id + '>'));
          newMessage = newMessage.replace(('@' + member.nickname.toLowerCase()), ('<@!' + member.user.id + '>'));
        }
      }
    }

    return newMessage
}

function calculateDateDifference(name) {
    const date = new Date(name);
    const currentDate = new Date();
    const daysRemaining = Math.floor((Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - Date.UTC(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate()))/(1000 * 60 * 60 * 24));
    return daysRemaining;
}

function checkAttachments(attachments) {
    if (attachments.length > 0) {
        const url = attachments[0].url;
        for (const fileType of fileTypes) {
            if (url.indexOf(fileType, url.length - fileType.length) !== -1) {
                return true
            }
        }
    }

    return false;
}

function timeAMessage() {
    return client.setTimeout(() => {
        client.channels.get(botSpeakChannel).send(MarkovDictionary.createMarkovSentence());
        timedMessage = timeAMessage();
    }, messageTimer )
}

function addWord(words) {
    const splitWords = words.split('"');
    if (splitWords[1] && splitWords[3]) {
        cannedResponses[splitWords[1]] = splitWords[3];
        db.run(`
        INSERT INTO keywords (keyword_text, response_text)
        VALUES (?, ?)
        `, [splitWords[1], splitWords[3]], (err) => {
          if (err) {
            console.error(err.message);
          }
        });
        return true;
    }
    return false;
}

function removeWord(words) {
    const splitWords = words.split('"');
    if (cannedResponses[splitWords[1]]) {
        delete cannedResponses[splitWords[1]];
        db.run(`
        DELETE FROM keywords WHERE keyword_text=?`, splitWords[1], (err) => {
          if (err) {
            console.error(err.message);
          }
        }); 
        return true;
    }

    return false; 
}

function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
}

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

function saveMessage(message) {
    db.run(`
    INSERT INTO messages (message_id, message_text, author_id, channel_id)
    VALUES (?, ?, ?, ?)
    `, [message.id, message.content, message.author.id, message.channel.id], (err) => {
      if (err) {
        console.error(err.message);
      }
    });
  }

function pullMessages(channelID, begin) {
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
          saveMessage(message);
        });
        console.log(`[${debugName}] saved ${filteredMessages.size} of ${messages.size} messages`);
  
        if (messages.size === FETCH_LIMIT) {
          return pullMessages(channelID, messages.first().id);
        }
      })
      .catch(error => {
        console.error(error);
      });
  }


function fillDictionary() {
    let messageSql = `SELECT message_text, message_id FROM messages ORDER BY message_id`;
    let bannedSql = `SELECT word_text FROM bannedwords`;
    let keywordSql = `SELECT keyword_text, response_text FROM keywords`;
    let birthdaySql = `SELECT user_id, date_text FROM birthdays ORDER by user_id`;

    db.all(messageSql, [], (err, rows) => {
      if (err) {
        throw err;
      }
      rows.forEach((row) => {
        MarkovDictionary.addLine(row.message_text);
      });
    });

    db.all(bannedSql, [], (err, rows) => {
        if (err) {
          throw err;
        }
        rows.forEach((row) => {
          MarkovDictionary.addBannedWord(row.word_text);
        });
    });
    
    db.all(keywordSql, [], (err, rows) => {
        if (err) {
            throw err;
        }
        rows.forEach((row) => {
            cannedResponses[row.keyword_text] = row.response_text;
        });
    });

    db.all(birthdaySql, [], (err, rows) => {
        if (err) {
            throw err;
        }
        rows.forEach((row) => {
            birthdays[row.user_id] = row.date_text;
        });
    });

    Object.keys(birthdays).forEach((id) => {
        const date = birthdays[id];
        const dateString = date.split('/');
        if (dateString.length === 2) {
            const birthDate = new Date();
            const currentDate = new Date();
            birthDate.setMonth(parseInt(dateString[0], 10) - 1);
            birthDate.setDate(parseInt(dateString[1], 10));
            birthDate.setHours(0);
            birthDate.setMinutes(0);
            birthDate.setSeconds(0);
            birthDate.setMilliseconds(0);

            if (birthDate.getTime() < currentDate.getTime()) {
                birthDate.setFullYear(birthDate.getFullYear() + 1);
            }

            longTimeout(() => {
                client.channels.get('546665650383224833').send(`It's <@${id}> 's birthday!`);
            }, birthDate.getTime() - currentDate.getTime());
        }
    });
    hasLoaded = true;
  }

/*function loadCountDowns() {
    fs.readFile('countdowns.txt', 'utf8', (err, data) => {
        if (err) throw err;

        const parsedData = JSON.parse(data);
        for (const key of Object.keys(parsedData)) {
            countDowns[key] = parsedData[key];
        }
        console.log('Countdowns loaded!');
        console.log('Store loading...');
        loadStore();
    })

    loadStore();
}

function loadStore() {
    fs.readFile('shopContents.txt', 'utf8', (err, data) => {
        if (err) throw err;

        const parsedData = JSON.parse(data);
        if (typeof parsedData[Symbol.iterator] === 'function') {
            for (const entry of parsedData) {
                shopPages.push(entry);
            }
        }
        console.log('Store loaded!');
        console.log('Loading birthdays...');
        loadBirthdays();
    })
}*/

function sentenceGenerator(message) {
    let sentence;
    if (message) {
        const words = cleanMessage(message).split(/[\s]+/).slice(1);
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

client.on('error', (error) => {
    console.error(new Date() + ": Discord client encountered an error");
    console.error(error);
})

client.on('ready', async () => {
    console.log('here i go')
    usedChannels = JSON.parse(fs.readFileSync('channels.txt', 'utf8'));
    console.log(usedChannels)
    const promises = new Map();
    const makePullPromise = (id, start = 1) => promises.set(id, pullMessages(id, start));
  
    const sql = `
    SELECT
      channel_id,
      MAX(message_id) AS last_seen_message
    FROM messages
    GROUP BY channel_id
    `;
    db.each(sql, (err, row) => {
      const lastSeenMessageID = row['last_seen_message'];
      if (lastSeenMessageID != null) {
          console.log(row);
        makePullPromise(row['channel_id'], row['last_seen_message']);
      }
    }, async () => {
      for (const channelID of usedChannels) {
        if (!promises.has(channelID)) {
          makePullPromise(channelID);
        }
      }
  
      await Promise.all(promises.values());
      console.log('done');
    });

    console.log('filling dictionary...')
    fillDictionary();

    fs.readFile('currency.txt', 'utf8', (err, data) => {
        if(err) return err;

        const parsedData = JSON.parse(data);
        for (const key of Object.keys(parsedData)) {
            currencyDatabase[key] = parsedData[key];
        }
        console.log('currency database loaded')
    }) 
})

client.on('message', (msg) => {

    if (msg.channel.type === 'dm' && !msg.author.bot) {
        client.fetchUser('121122209728167940').then((pup) => {
            if (msg.author.id !== '121122209728167940') {
                if (!willAuto) {
                    pup.send(`${msg.author.username} sent the following message, reply with !reply "${msg.author.id}" and then your message in quotes **or** !auto "${msg.author.id}"`);
                    pup.send(`\`\`\`\n${msg.content}\n\`\`\``);
                } else {
                    pup.send(`${msg.author.username} sent the following message, and an automatic reply was sent!"`);
                    pup.send(`\`\`\`\n${msg.content}\n\`\`\``);
                    const sentence = sentenceGenerator(msg.content);
                    msg.author.send(sentence);
                    pup.send(`Alose said \n \`\`\`\n${sentence}\n\`\`\``);
                }               
            } else {
                const splitWords = msg.content.split('"');
                if (splitWords[1]) {
                    client.fetchUser(splitWords[1]).then((recipient) => {
                        if (recipient) {
                            if (msg.content.startsWith('!reply')) {
                                let attachments = msg.attachments.array();
                                checkAttachments(attachments) ? recipient.send(splitWords[3], 
                                {
                                    file: attachments[0].url,
                                }) :
                                recipient.send(splitWords[3]); 
                            }

                            if (msg.content.startsWith('!auto')) {
                                recipient.dmChannel.fetchMessages({limit: 1}).then((message) => {
                                    const sentence = sentenceGenerator(message.content);
                                    recipient.send(sentence);
                                    pup.send(`Alose said \n \`\`\`\n${sentence}\n\`\`\``);
                                }).catch((reason) => {
                                    const sentence = sentenceGenerator();
                                    recipient.send(sentence);
                                    pup.send(`Alose said \n \`\`\`\n${sentence}\n\`\`\``);
                                })
                            }
                        }
                    })
                }
                if (msg.content.startsWith('!setAuto')) {
                    willAuto = !willAuto;
                    pup.send(`Replying automatically to messages set to: ${willAuto}`);
                }
            }
        }); 
    }

    let hasResponded = false;
    if (msg.content.startsWith('!sleep') && msg.channel.id === botChannel) {
        isAwake = !isAwake;
        isAwake ? 
            client.channels.get(msg.channel.id).send(`I'm awake now!`) :
            client.channels.get(msg.channel.id).send(`Oya...sumi...`);
        hasResponded = true;
    }

    if (isAwake) {
        if (msg.channel.id === botChannel) {

            /*if ((/^!setcoin\s\d+$/).test(msg.content)) {
                coinCounter = msg.content.split(' ')[1];
                const message = coinCounter <= 0 ? 'Okay... I wont share my coins anymore...' : `Okay! I'll share my coins after ${coinCounter} messages!`;
                client.channels.get(msg.channel.id).send(message);
            }*/

            if (msg.content.startsWith('!banword')) {
                const split = msg.content.split(' ');
                if (split.length >= 2) {
                    const bannedWord = split[1].toLowerCase();
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
                }
            }
    
            if (msg.content.startsWith('!banlist')) {
                const bannedWords = MarkovDictionary.getBannedWords();
                let bannedWordsDisplay = 'I am not allowed to say the following words:\n';
                for (let i = 0; i < bannedWords.length; i++) {
                    bannedWordsDisplay += ` - ${bannedWords[i]}\n`;
                }
                client.channels.get(msg.channel.id).send(bannedWordsDisplay);
            }

            /*if ((/^!removeshop\s\d+$/).test(msg.content)) {
                let itemIndex = msg.content.split(' ')[1];
                if (shopPages.length >= itemIndex && itemIndex > 0) {
                    shopPages = shopPages.filter((elements, index) => index !== itemIndex - 1);
                    fs.writeFileSync('shopContents.txt', JSON.stringify(shopPages));
                    client.channels.get(msg.channel.id).send('Shop item deleted!');
                } else {
                    client.channels.get(msg.channel.id).send('Couldn\'t find item! The proper use of this command is "!removeshop item#');
                }
                hasResponded = true;
            }

            if ((/^!addshop\s<@&(\d+)>\s\d+$/).test(msg.content)) {
                const mentionedRole = msg.mentions.roles.array()[0];
                const roleCost = msg.content.split(' ')[2];
                let roleFound = false;

                for (let [i, [role, cost]] of shopPages.entries()) {
                    if (role === mentionedRole.id) {
                        shopPages[i][1] = roleCost;
                        roleFound = true;
                        client.channels.get(msg.channel.id).send(`Role updated!`);
                        break;
                    }
                }
                if (!roleFound) {
                    shopPages.push([mentionedRole.id, roleCost]);
                    client.channels.get(msg.channel.id).send(`Role added!`);
                }
                fs.writeFileSync('shopContents.txt', JSON.stringify(shopPages));
                hasResponded = true;
            }*/
        }

        /*if ((/^!buy\s\d+$/).test(msg.content)) {
            const itemIndex = msg.content.split(' ')[1];
            const role = shopPages[itemIndex - 1];
            const user = client.fetchUser(msg.author.id);
            if (msg.member.roles.find(r => r.id === role[0])) {
                client.channels.get(msg.channel.id).send('You already have this role!');
            } else {
                if (role[1] > parseInt(currencyDatabase[msg.author.id])) {
                    client.channels.get(msg.channel.id).send('You can\'t afford this role!');
                } else {
                    const setRole = msg.guild.roles.find(r => r.id === role[0]);
                    const guild = client.guilds.array()[0];
                    currencyDatabase[msg.author.id] = parseInt(currencyDatabase[msg.author.id]) - role[1];
                    fs.writeFileSync('currency.txt', JSON.stringify(currencyDatabase));
                    msg.member.addRole(setRole, 'Bought fromt store');
                    client.channels.get(msg.channel.id).send('Role purchased!');
                }
            }
            hasResponded = true;
        }

        if(msg.content === '!shop') {
            let pages = [];
            let page = '';
            const guild = client.guilds.array()[0];
            const emoji = client.emojis.find(emoji => emoji.name === 'owocry');
            for (const [i, [roleId, cost]] of shopPages.entries()) {
                page += `**${i + 1}) ${guild.roles.get(roleId).name}**:\xa0\xa0\xa0\xa0${cost} ${emoji}`
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
            
            msg.channel.send(shopEmbed).then(msg => {
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
            })
            hasResponded = true;
        }

        if (msg.content.startsWith('!grab')) {
            grabMsgArray.push(msg)
            if (coinsActive) {
                const grabber = msg.author.id;
                const codeGrab = msg.content.split(' ');
                if (codeGrab.length > 1) {
                    if (codeGrab[1] === currentGrab) {
                        currencyDatabase[grabber] = currencyDatabase[grabber] ? currencyDatabase[grabber] + coinDropAmount : coinDropAmount;
                        coinsActive = false;
                        currentGrab = '';
                        coinMessages = -1;
                        coinMsg.delete(0);
                        for (const message of grabMsgArray) {
                            if (!message.deleted) {
                                message.delete(0);
                            }
                        }
                        fs.writeFileSync('currency.txt', JSON.stringify(currencyDatabase));
                        client.channels.get(msg.channel.id).send(`${msg.author.username} grabbed ${coinDropAmount} coins!`).then(response => {
                            response.delete(15000);
                        });
                    }
                }
                hasResponded = true;
            }
        }

        if ((/^!award\s<@!?(\d+)>\s(\d+)$/).test(msg.content)) {
            const mentionedUser = msg.mentions.users.array()[0];
            const currencyAmount = msg.content.split(' ')[2];

            currencyDatabase[mentionedUser.id] = currencyDatabase[mentionedUser.id] ? currencyDatabase[mentionedUser.id] + currencyAmount : currencyAmount;
            fs.writeFileSync('currency.txt', JSON.stringify(currencyDatabase));
            client.channels.get(msg.channel.id).send(`Awarded ${mentionedUser.username} ${currencyAmount} credits! Yay!`);
        }

        if (msg.content.startsWith('!currency')) {
            let name;
            let value;

            if (!currencyDatabase[msg.author.id]) {
                name = msg.author.username;
                value = 0;
                currencyDatabase[msg.author.id] = 0;
                fs.writeFileSync('currency.txt', JSON.stringify(currencyDatabase));
            } else {
                name = msg.author.username;
                value = currencyDatabase[msg.author.id];
            }

            const currencyEmbed = new Discord.RichEmbed({fields: [{name, value}], author: msg.author.username, title: 'Currency :moneybag:'})
            client.channels.get(msg.channel.id).send(currencyEmbed).then(sentMessage => {
                sentMessage.delete(60000);
            });
            hasResponded = true;
        }

        if ((/^(!countdown)/).test(msg.content)) {
            const name = msg.content.slice('!countdown'.length).trim();
            if (name) {
                if (countDowns[name.toLocaleLowerCase()]) {
                    const daysRemaining = calculateDateDifference(countDowns[name.toLocaleLowerCase()]);
                    client.channels.get(msg.channel.id).send(`${name}: ${daysRemaining} days left!`);
                }
            } else { 
                let fields = [];
                for ([key, value] of Object.entries(countDowns)) {
                    const daysRemaining = calculateDateDifference(value);
                    if (daysRemaining >= 0) {
                        daysRemaining > 0 ? fields.push({name: key, value: `${daysRemaining} days!`}) : fields.push({name: key, value: `Today!`});
                    } 
                }
                if (!(fields.length > 0)) {
                    client.channels.get(msg.channel.id).send('No countdowns set!');
                } else {
                    const countdownEmbed = new Discord.RichEmbed({fields, author: msg.author.username, title: ':clock1: Countdowns :clock1:'});
                    client.channels.get(msg.channel.id).send(countdownEmbed);
                }
            }
            hasResponded = true;
        }
    
        if ((/^(!startCountdown)\s(\w+)\s(\d+)$/).test(msg.content)) {
            const content = msg.content.split(' ');
            const name = content[1];
            const days = parseInt(content[2]);
            if(!days || days < 1) {
                client.channels.get(msg.channel.id).send('Invalid days! The format is \'!startCountdown name #days\', remember no spaces in the name!');
            } else {
                let date = new Date();
                date.setDate(date.getDate() + days);
                date.toISOString();
                countDowns[name.toLowerCase()] = date.toJSON();
                fs.writeFileSync('countdowns.txt', JSON.stringify(countDowns));
                client.channels.get(msg.channel.id).send('Countdown set!');
            }
        }

        if ((/^(!hug|!kiss|!pet)\s<@!?(\d+)>/).test(msg.content) && !hugCooldowns.includes(msg.author.id)) {
            const mentionedUser = msg.mentions.users.array()[0];
            let type = '';
            msg.content.startsWith('!hug') ? type = 'hug' : msg.content.startsWith('!kiss') ? type = 'kiss' : type = 'pat';
    
            hugCooldowns.push(msg.author.id);
            hasResponded = true;
    
            console.log(msg.author.id === '121122209728167940')
    
            if (msg.author.id === '121122209728167940' && type === 'pat') {
                
                client.channels.get(msg.channel.id).send(`*Alose pets* <@!${mentionedUser.id}> https://media.giphy.com/media/gJcchCJ9HMluo/giphy.gif`);
            } else {
            https.get(`https://api.giphy.com/v1/gifs/random?api_key=BWyomtPF698jp9bFZoiqwEck9KT7AtzW&tag=${type}&limit=1`, res => {
                let error;
                if (res.statusCode !== 200) {
                    error = new Error('Something went wrong!');
                }
    
                if (error) {
                    console.log(error.message);
                    res.resume();
                    return;
                }
    
                let parsedData = '';
                res.on('data', data => {
                    parsedData += data;
                    const splitData = parsedData.split('\n');
                    const splitDataLength = splitData.length;
                    parsedData = splitData.pop();
                })
    
                res.on('close', () => {
                    parsedData = JSON.parse(parsedData);
    
                    const returnString = type === 'hug' ? `*Alose hugs* <@!${mentionedUser.id}> ${parsedData.data.image_original_url}` :
                        type === 'kiss' ? `*Alose kisses* <@!${mentionedUser.id}> ${parsedData.data.image_original_url}` :
                            `*Alose pets* <@!${mentionedUser.id}> ${parsedData.data.image_original_url}`;
    
                    client.channels.get(msg.channel.id).send(returnString);
    
                    client.setTimeout(() => {
                        const index = hugCooldowns.indexOf(msg.author.id);
                        if (index > -1) {
                            hugCooldowns.splice(index, 1);
                        }
                        }, 300000)
                })
    
            }).on('error', (e) => {
                console.error(`Got error: ${e.message}`);
            });
        }
        }*/

        if (msg.channel.id === botSpeakChannel && (/^!mybirthday\s\d{1,2}\/\d{1,2}$/).test(msg.content)) {
            const splitMessage = msg.content.split(' ');
            const dateString = splitMessage[1].split('/');
            if (parseInt(dateString[0], 10) < 13 && parseInt(dateString[1], 10) < 32) {
                birthdays[msg.author.id] = splitMessage[1];
                db.run(`
                INSERT INTO birthdays (user_id, date_text)
                VALUES (?, ?)
                `, [msg.author.id, splitMessage[1]], (err) => {
                  if (err) {
                    console.error(err.message);
                  }
                });
                client.channels.get(botSpeakChannel).send('> Alose will remember this date.');
                client.channels.get('528520679369211904').send(`<@${msg.author.id}> set their birthday to ${splitMessage[1]}!`);
            }
        }
    
    
        if ((msg.channel.id === botSpeakChannel || msg.channel.id === botChannel) && msg.content.startsWith('!8ball')) {
            let eightBallString =  `\`\`\`🡺 ${msg.member.displayName} throws the magic 8ball.\n…\n`
            eightBallString += eightBallReplies[Math.floor(Math.random() * eightBallReplies.length)];
            client.channels.get(msg.channel.id).send(eightBallString);
            hasResponded = true;
        }
    
        if ((msg.channel.id === botChannel || msg.channel.id === generalChannel || msg.channel.id === botSpeakChannel) && !msg.author.bot) {
            if (!msg.content.startsWith('!removeword')) {
                for (const key of Object.keys(cannedResponses)) {
                    const wordChecker = new RegExp("(?<=\\s|^)" + escapeRegExp(key) + "(?=\\s|$|[?!.,])");
                    if (wordChecker.test(msg.content)) {
                        client.channels.get(msg.channel.id).send(cannedResponses[key]);
                        hasResponded = true;
                        break;
                    }
                }
            }
    
            if (msg.channel.id === botChannel) {
                if (msg.content.startsWith('!addword')) {
                    addWord(msg.content) ? client.channels.get(msg.channel.id).send('Word added!') : client.channels.get(msg.channel.id).send('Failed to add word!');
                    hasResponded = true;
                }
    
                if (msg.content.startsWith('!removeword')) {
                    removeWord(msg.content) ? client.channels.get(msg.channel.id).send('Word removed!') : client.channels.get(msg.channel.id).send('Failed to remove word!'); 
                    hasResponded = true;
                }
    
                if (msg.content === '!wordlist') {
                    let wordlistMessage = "These are what you've taught me!\n"
                    for (const [key, value] of Object.entries(cannedResponses)) {
                        wordlistMessage += ` Trigger: ${key}, Response: ${value}\n`;
                    }
                    client.channels.get(msg.channel.id).send(wordlistMessage);
                }
            }
    
            if (msg.content.startsWith('!settimer')) {
                const split = msg.content.split(' ');
                let newTimer = parseInt(split[1]);
                if (isNaN(newTimer)) { client.channels.get(msg.channel.id).send('That is not a number!'); }
                else {
                    messageTimer = newTimer * 60000;
                    client.clearTimeout(timedMessage);
                    if (messageTimer > 0) {
                        timedMessage = timeAMessage();
                    }
                    messageTimer > 0 ? 
                        client.channels.get(msg.channel.id).send(`Timer set to ${newTimer} minutes.`) :
                        client.channels.get(msg.channel.id).send(`Timer disabled.`);
                }
            }
    
            if (msg.content.startsWith('!setmessagecap')) {
                const split = msg.content.split(' ');
                let newCap = parseInt(split[1]);
                if (isNaN(newCap)) { client.channels.get(msg.channel.id).send('That is not a number!'); }
                else {
                    seenMessages = 0;
                    messageCap = newCap;
                    messageCap > 0 ?
                        client.channels.get(msg.channel.id).send(`Message interval to ${messageCap} messages.`) :
                        client.channels.get(msg.channel.id).send(`Message interval disabled.`);
                }
            }
    
            if (msg.content.startsWith('!alosay') && msg.channel.id === botChannel) {
                let attachments = msg.attachments.array();
                checkAttachments(attachments) ? client.channels.get(generalChannel).send(makePings(msg.content.slice('!alosay'.length).trim()), 
                {
                    file: attachments[0].url,
                }) :
                client.channels.get(generalChannel).send(makePings(msg.content.slice('!alosay'.length).trim()));
            }
    
            if (msg.content.startsWith('!announce') && msg.channel.id === botChannel) {
                let attachments = msg.attachments.array();
                console.log(announceChannel)
                checkAttachments(attachments) ? client.channels.get(announceChannel).send(makePings(msg.content.slice('!announce'.length).trim()), 
                {
                    file: attachments[0].url,
                }) :
                client.channels.get(announceChannel).send(makePings(msg.content.slice('!announce'.length).trim()));
            }
    
            if (hasLoaded && 
                !hasResponded) {
                    const mentions = msg.mentions.users.array();
                    let wasMentioned = false;
                    for (const mention of mentions) {
                        if (mention.id === botId) {
                            wasMentioned = true;
                        }
                    }
    
                if (wasMentioned) {
                    if (msg.content.toLowerCase().startsWith(`<@${botId}> say goodnight`) || msg.content.toLowerCase().startsWith(`<@!${botId}> say goodnight`)) {
                        const split = msg.content.replace(/<a?:(\w+):(\d+)>/g, (_, mention) => '').split(/[\s]+/);
                        if (split.length <= 3 || split[3] === '') {
                            client.channels.get(msg.channel.id).send(`Goodnight!`);
                        } else {
                            client.channels.get(msg.channel.id).send(`Goodnight, ${split[3]}!`);
                        }
                    } else {
                        let sentence = sentenceGenerator(msg.content)
                        client.channels.get(msg.channel.id).send(sentence);
                    }
    
                    hasResponded = true;
                }
            }
        }
    }


    if (hasLoaded &&
        !hasResponded && 
        !(msg.embeds.length > 0) &&
        !msg.content.includes('http') &&
        usedChannels[msg.channel.id] &&
        !msg.author.bot) {
        
        saveMessage(msg);
        const lines = cleanMessage(msg.content).split(/[\n]+/);
        
        for (let i = 0; i < lines.length; i++) {
            if (lines[i] !== '') {
                MarkovDictionary.addLine(lines[i]);
            }
        }
    }


    if (msg.channel.id === generalChannel && !msg.author.bot && coinCounter > 0 && !coinsActive && coinCounter >= 0) {
        coinMessages++;
        if (coinMessages >= coinCounter) {
            coinDropAmount = Math.floor(Math.random() * 49 + 1);
            currentGrab = grabCodes[Math.floor(Math.random() * grabCodes.length)];
            coinsActive = true;
            coinMessages = 0;
            client.channels.get(generalChannel).send(`Alose dropped ${coinDropAmount} coins on the floor! Grab them with ${currentGrab}!`).then(msg => {
                coinMsg = msg;
                client.setTimeout(() => {        
                    if (!msg.deleted) {
                        msg.delete(0);
                        for (const message of grabMsgArray) {
                            message.delete(0);
                        }
                        coinsActive = false;
                        currentGrab = '';
                        coinMessages = -1;
                    }
                }, 100000)
            });
        }
    }

    if (msg.channel.id === generalChannel && !msg.author.bot && messageCap > 0) {
        seenMessages++;
        if (seenMessages >= messageCap) {
            client.channels.get(generalChannel).send(MarkovDictionary.createMarkovSentence());
            seenMessages = 0;
        }
    }
})

client.login(token);