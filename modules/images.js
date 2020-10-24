const sqlite3 = require('sqlite3').verbose();

const fileTypes = [
    'jpg',
    'jpeg',
    'png',
    'gif',
    'mp4',
    'webm',
];

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


class ImageModule {
    constructor(context) {
        this.dispatch = context.dispatch;
        this.config = context.config;
        this.client = context.client;
        this.prompts = {};
        this.db = new sqlite3.Database(path.join(__dirname, '../db/AloseDB.db'));

        this.db.run(`
        CREATE TABLE IF NOT EXISTS storedpics (
        prompt_text TEXT,
        url_text TEXT,
        PRIMARY KEY (prompt_text, url_text)
    )`, 
    (err) => { 
        if (err) {
            console.error(err.message);
        }
        const promptSql = `SELECT prompt_text, url_text FROM storedpics`;

        this.db.all(promptSql, [], (err, rows) => {
            if (err) {
                throw err;
            }
            rows.forEach((row) => {
                this.prompts[row.prompt_text] = row.url_text;
            });
        });

        console.log('Stored pics loaded!');
    });

        this.dispatch.hook('!storepic', (message) => {
            const channel = this.config.get('bot-channel');
            if (message.channel.id === channel) {
                let attachments = message.attachments.array();
                if (attachments.length === 0) {
                    message.channel.send('You need to attach an image file for me to store!');
                    return;
                }
                
                const prompt = message.content.slice('!storepic'.length).trim();
                if (!prompt) {
                    message.channel.send('You need to include a prompt!');
                    return;
                }

                this.prompts[prompt] = attachments[0].url;

                this.db.run(`
                INSERT INTO storedpics (prompt_text, url_text)
                VALUES (?, ?)
                `, [prompt, this.prompts[prompt]], (err) => {
                  if (err) {
                    console.error(err.message);
                  }
                });
            }
        });
    }
}

module.exports = ImageModule;