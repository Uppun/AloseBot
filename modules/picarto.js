const Discord = require("discord.js"); 
const XMLHttpRequest = require("xmlhttprequest").XMLHttpRequest;
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const DELAY = 45000;
const DELAYMULTIPLIER = 5;
const APILINK = "https://api.picarto.tv/v1/online?adult=true&gaming=true&categories=";
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

        return false;
    } catch (err) {
        console.log("An error has occured getting the API link:\n" + err);
    }
}

function checkStatus(streamName) {
    const request = new XMLHttpRequest();
    try {
        request.open("GET", "https://api.picarto.tv/v1/channel/name/" + streamerName, false);
        request.send();
        if (request.status === 200) {
            const reply = JSON.parse(request.responseText);
            return reply.online;
        }
    } catch {
        console.log("An error has occured getting the API link:\n" + err);
    }
}
function request(streamerMap, botChannel, cb) {
    const request = XMLHttpRequest();
    try {
        request.onloadend = () => {
            if (request.status === 200) {
                timeoutRequest();
                const reply = JSON.parse(request.responseText);
                const nameArray = [];
                for (const element of reply) {
                    nameArray.push(element.name);
                }
                cb(streamerMap, botChannel, nameArray.slice());
            } else {
                console.log('Error reaching picarto\'s API ' + request.status);
                timeoutRequest(streamerMap, true);
            }
        };
        request.open('GET', APILINK, false);
        request.send();
    } catch (error) {
        console.log(error);
    }
}

function checkStatus(streamerMap, botChannel, currentlyOnline) {
    if (streamerMap.size !== null && streamerMap.size > 0) {
        for(const streamer of streamerMap.entries()) {
            const onlineStatus = currentlyOnline.includes(streamer[0]);
            if (onlineStatus) {
                streamerMap.set(streamer.name, {onlineState: 1, id: streamer[2]});
                db.run(`
                UPDATE picarto_streamers SET onlineState = ? WHERE name = ?`,
                [1, streamer[0]], (err) => {
                    if (err) {
                        console.error(err.message);
                    }          
                });
                botChannel.send(`${streamer[0]} is streaming!`);
            } else {
                streamerMap.set(streamer.name, {onlineState: 0, id: streamer[2]});
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
        this.botChannel = this.client.channels.fetch(this.config.get('bot-channel'));

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
            const streamerSql = `SELECT name FROM picarto_streamers`;

            db.all(streamerSql, [], (err, rows) => {
                if (err) {
                    throw err;
                }
                rows.forEach((row) => {
                    this.streamerObj.set(row.name, {onlineState: row.onlineState, id: row.id});
                });
            });

            console.log('streamers loaded');
        });

        this.dispatch.hook('!addStream', (message) => {
            const streamName = message.content.slice('!addStream'.length).trim();
            if (streamerMap.has(streamerName)) {
                return message.channel.send('That streamer is already being followed!');
            }
            if (!checkIfStreamExists(streamerName)) {
                return message.channel.send('I cannot find that stream!');
            }

            streamerMap.set(streamerName, {onlineState: null});
            db.run(`
            INSERT INTO picarto_streamers (name, onlineState, id)
            VALUES (?, ?, ?)
            `, [streamerName, null, message.author.id], (err) => {
              if (err) {
                console.error(err.message);
              }
            });

            message.channel.send(`I am now following ${streamerName}!`);
        });

        this.dispatch.hook('!removeStream', (message) => {
            const streamName = message.content.slice('!removeStream'.length).trim();
            if (streamerMap.has(streamerName)) {
                return message.channel.send('That streamer isn\'t currently being followed!');
            }

            streamerMap.delete(streamerName);

            db.run(`
            DELETE FROM picarto_streamers WHERE streamerName=?`, streamerName, (err) => {
                if (err) {
                    console.error(err.message);
                }
            });
            message.channel.send(`I am no longer following ${streamerName}!`);
        });
    }
}

module.exports = PicartoModule;