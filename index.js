const Discord = require('discord.js');
const fs = require('fs');
const parser = require('./parser');
const configTracker = require('./configtracker');
const modules = fs.readdirSync('./modules');

const client = new Discord.Client();
const messageParser = new parser();
const config = new configTracker();
let isAwake = true;

for (const moduleName of modules) {
    const module = require('./modules/' + moduleName);
    const testModule = new module(messageParser);
}

client.on('error', (error) => {
    console.error(new Date() + ": Discord client encountered an error");
    console.error(error);
})

client.on('ready', async () => {
    console.log('here i go')
})

client.on('message', (msg) => {
    
    if (msg.content === '!sleep' && msg.channel.id === config.get('bot-channel')) {
        isAwake = !isAwake;
        isAwake ? 
            msg.channel.send(`I'm awake now!`) :
            msg.channel.send(`Oya...sumi...`);
    }

    if (isAwake) {
        if (config.get('listen-channels').includes(msg.channel.id)) {
            messageParser.informModules(msg);
        }
    }
});

client.login(config.get('bot-token'));