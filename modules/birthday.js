const sqlite3 = require('sqlite3').verbose();
const path = require('path');

function longTimeout(cb, delay, client) {
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

class BirthdayModule {
    constructor(context) {
        this.dispatch = context.dispatch;
        this.config = context.config;
        this.client = context.client;
        this.db = new sqlite3.Database(path.join(__dirname, '../db/AloseDB.db'));
        this.birthdays = {};

        this.db.run(`
        CREATE TABLE IF NOT EXISTS birthdays (
          user_id TEXT,
          date_text TEXT,
          PRIMARY KEY (user_id)
        )`, (err) => { 
            if(err) {
                console.error(err.message);
            }
            console.log('Birthday table created.');
        });

        const birthdaySql = `SELECT user_id, date_text FROM birthdays ORDER by user_id`;

        this.db.all(birthdaySql, [], (err, rows) => {
            if (err) {
                throw err;
            }
            rows.forEach((row) => {
                this.birthdays[row.user_id] = row.date_text;
            });

            console.log('birthdays loaded')
        });

        Object.keys(this.birthdays).forEach((id) => {
            const date = this.birthdays[id];
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
                    this.client.channels.get(config.get('general-channel')).send(`It's <@${id}> 's birthday!`);
                }, birthDate.getTime() - currentDate.getTime(), this.client);
            }
        });
        
        this.dispatch.hook('!mybirthday', (message) => {
            const channel = this.config.get('bot-speak-channel');
            const botChannel = this.config.get('bot-channel');
            if (message.channel.id === channel && (/^!mybirthday\s\d{1,2}\/\d{1,2}$/).test(message.content)) {
                const splitMessage = message.content.split(' ');
                const dateString = splitMessage[1].split('/');
                if (parseInt(dateString[0], 10) < 13 && parseInt(dateString[1], 10) < 32) {
                    this.birthdays[message.author.id] = splitMessage[1];
                    this.db.run(`
                    INSERT INTO birthdays (user_id, date_text)
                    VALUES (?, ?)
                    `, [message.author.id, splitMessage[1]], (err) => {
                      if (err) {
                        console.error(err.message);
                      }
                    });
                    this.client.channels.get(channel).send('> Alose will remember this date.');
                    this.client.channels.get(botChannel).send(`<@${message.author.id}> set their birthday to ${splitMessage[1]}!`);
                }
            }
        });
    }
}

module.exports = BirthdayModule;