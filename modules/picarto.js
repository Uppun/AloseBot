const Discord = require("discord.js"); 
const http = require('http');
const XMLHttpRequest = require("xmlhttprequest").XMLHttpRequest;
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const DELAY = 45000;
const DELAYMULTIPLIER = 5;
const APILINK = "https://api.picarto.tv/api/v1/channel/name/";
const ALLONLINELINK = "https://api.picarto.tv/api/v1/online";
const STREAMLINK = "https://picarto.tv/";
const db = new sqlite3.Database(path.join(__dirname, '../db/AloseDB.db'));

function checkIfStreamExists(streamName) {
    const request = new XMLHttpRequest();
    try {
        request.open("GET", APILINK + streamName, false);
        request.send();
        if (request.status >= 200 && request.status < 300) {
            return true;
        }
        console.log(request.status)
        return false;
    } catch (err) {
        console.log("An error has occured getting the API link:\n" + err);
    }
}

function request(streamerMap, botChannel, cb) {
    const request = new XMLHttpRequest();
    try {
        request.onloadend = () => {
            if (request.status === 200) {
                timeoutRequest(streamerMap, botChannel, 0);
                const reply = JSON.parse(request.responseText);
                const nameArray = [];
                for (const element of reply) {
                    nameArray.push(element.name);
                }
                cb(streamerMap, botChannel, nameArray.slice());
            } else {
                console.log('Error reaching picarto\'s API ' + request.status);
                timeoutRequest(streamerMap, botChannel, true);
            }
        };
        request.open('GET', ALLONLINELINK, false);
        request.send();
    } catch (error) {
        console.log(error);
    }
}

function checkStatus(streamerMap, botChannel, currentlyOnline) {
    if (streamerMap.size !== null && streamerMap.size > 0) {
        for(const streamer of streamerMap.entries()) {
            const onlineStatus = currentlyOnline.includes(streamer[0]);
            console.log(streamer);
            if (onlineStatus && streamer[1].onlineState === 0) {
                streamerMap.set(streamer[0], {onlineState: 1, id: streamer[1].id});
                db.run(`
                UPDATE picarto_streamers SET onlineState = ? WHERE name = ?`,
                [1, streamer[0]], (err) => {
                    if (err) {
                        console.error(err.message);
                    }          
                });
                const request = new XMLHttpRequest();
                try {
                    request.open("GET", APILINK + streamer[0], false);
                    request.send();
                    if (request.status >= 200 && request.status < 300) {
                        const response = JSON.parse(request.responseText);
                        const picartoEmbed = new Discord.MessageEmbed()
                            .setTitle(response.title)
                            .setURL(`https://picarto.tv/${streamer[0]}`)
                            .setDescription(`Now live at https://picarto.tv/${streamer[0]} !`)
                            .setThumbnail(response.avatar)
                            .setImage(response.thumbnails.web)
                            botChannel.send(picartoEmbed);
                    }
                } catch (error) {
                    console.log(error);
                }
            } 
            if (!onlineStatus && streamer[1].onlineState === 1) {
                streamerMap.set(streamer[0], {onlineState: 0, id: streamer[1].id});
                db.run(`
                UPDATE picarto_streamers SET onlineState = ? WHERE name = ?`,
                [0, streamer[0]], (err) => {
                    if (err) {
                        console.error(err.message);
                    }          
                });
                botChannel.send(`${streamer[0]} is no longer streaming!`);
            }
        }
    }
}

function timeoutRequest(streamerMap, botChannel, delay) {
    console.log(streamerMap)
    if (delay) {
        setTimeout(() => {
            request(streamerMap, botChannel, checkStatus);
        }, DELAY * DELAYMULTIPLIER);
    } else {
        setTimeout(() => {
            request(streamerMap, botChannel, checkStatus);
        }, DELAY);
    }
}

class PicartoModule {
    constructor(context) {
        this.dispatch = context.dispatch;
        this.config = context.config;
        this.client = context.client;
        this.streamerMap = new Map();
        this.botChannel = this.client.channels.cache.get(this.config.get('bot-channel'));

        db.run(`
        CREATE TABLE IF NOT EXISTS picarto_streamers (
        name TEXT,
        onlineState INTEGER,
        id TEXT,
        PRIMARY KEY (name)
        )`, 
        (err) => { 
            if (err) {
                console.error(err.message);
            }
            const streamerSql = `SELECT name, onlineState, id FROM picarto_streamers`;

            db.all(streamerSql, [], (err, rows) => {
                if (err) {
                    throw err;
                }
                rows.forEach((row) => {
                    console.log(row);
                    this.streamerMap.set(row.name, {onlineState: row.onlineState, id: row.id});
                });
                console.log('streamers loaded');
                console.log(this.streamerMap)
                timeoutRequest(this.streamerMap, this.botChannel, 0); 
            });


        });

        this.dispatch.hook('!addStream', (message) => {
            const streamName = message.content.slice('!addStream'.length).trim();
            if (this.streamerMap.has(streamName)) {
                return message.channel.send('That streamer is already being followed!');
            }
            if (!checkIfStreamExists(streamName)) {
                return message.channel.send('I cannot find that stream!');
            }

            this.streamerMap.set(streamName, {onlineState: 0, id: message.author.id});
            db.run(`
            INSERT INTO picarto_streamers (name, onlineState, id)
            VALUES (?, ?, ?)
            `, [streamName, 0, message.author.id], (err) => {
              if (err) {
                console.error(err.message);
              }
            });

            message.channel.send(`I am now following ${streamName}!`);
        });

        
        this.dispatch.hook('!removeStream', (message) => {
            const streamName = message.content.slice('!removeStream'.length).trim();
            console.log(this.streamerMap);
            if (!this.streamerMap.has(streamName)) {
                return message.channel.send('That streamer isn\'t currently being followed!');
            }

            this.streamerMap.delete(streamName);

            db.run(`
            DELETE FROM picarto_streamers WHERE name=?`, streamName, (err) => {
                if (err) {
                    console.error(err.message);
                }
            });
            message.channel.send(`I am no longer following ${streamName}!`);
        });
    }
}

module.exports = PicartoModule;