const sqlite3 = require('sqlite3').verbose();
const path = require('path');

class CurrencyModule {
    constructor(context) {
        this.dispatch = context.dispatch;
        this.config = context.config;
        this.db = new sqlite3.Database(path.join(__dirname, '../../sharedDBs/StoreDB.db'));
        this.coinCounter = 0;
        this.seenMessages = 0;
        this.coinsActive = false;
        this.grabCodes = [
            'test1',
            'test2',
            'test3',
            'test4',
            'test5',
        ];
        this.coinDropAmount = 0;

        this.db.run(`
        CREATE TABLE IF NOT EXISTS currency_db (
        user_id TEXT,
        currency TEXT,
        PRIMARY KEY (user_id)
        )`,
        (err) => {
            if (err) {
                console.error(err.message);
            }

            const currencySql = `SELECT user_id, currency FROM currency_db`;

            this.db.all(currencySql, [], (err, rows) => {
                if (err) {
                    throw err;
                }
                rows.forEach((row) => {
                    this.currencies[row.user_id] = row.currency;
                });
            });
            console.log('Currency DB loaded.')
        });

        this.db.run(`
        CREATE TABLE IF NOT EXISTS currency_countdown (
        countdown TEXT,
        PRIMARY KEY (countdown)
        )`,
        (err) => {
            if (err) {
                console.error(err.message)
            }

            const countdownSql = `SELECT countdown FROM currency_countdown`;

            this.db.all(countdownSql, [], (err, rows) => {
                if (err) {
                    throw err;
                }
                rows.forEach((row) => {
                    this.currencies = parseInt(row.countdown, 10);
                });
            });
        });

        this.dispatch.hook('!setcoin', (message) => {
            const botChannel = this.config.get('bot-channel');
            if ((/^!setcoin\s\d+$/).test(message.content) && message.channel.id === botChannel) {
                const countdownText = message.content.substr('!setcoin'.length).trim();
                this.coinCounter = parseInt(countdownText, 10);

                this.db.run(`
                UPDATE currency_countdown
                SET countdown = ?
                `, [countdownText], (err) => {
                    if (err) {
                        console.error(err.message);
                    }
                });

                const response = this.coinCounter <= 0 ? 
                    'Okay... I wont share my coins anymore...' : 
                    `Okay! I'll share my coins after ${this.coinCounter} messages!`;
                message.channel.send(response);
            }
        });

        this.dispatch.hook(null, (message) => {
            const channel = this.config.get('general-channel');
            if (message.channel.id === channel && !message.author.bot && this.coinCounter > 0 && !this.coinsActive) {
              this.seenMessages++;
              if (this.seenMessages === this.coinCounter) {
                this.seenMessages = 0;
                this.coinDropAmount = Math.floor(Math.random() * 49 + 1);
                this.currentGrab = this.grabCodes[Math.floor(Math.random() * this.grabCodes.length)];
                this.coinsActive = true;
                message.channel.send(`Alose dropped ${this.coinDropAmount} coins on the floor! Grab them with ${this.currentGrab}!`).then(msg => {

                });
              }
            }
          });
    }
}

module.exports = CurrencyModule;