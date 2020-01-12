const Discord = require('discord.js');
const fs = require('fs');
const parser = require('./parser');
const configTracker = require('./configtracker');
const modules = fs.readdirSync('./modules');

const client = new Discord.Client();
const dispatch = new parser();
const config = new configTracker();
const context = {dispatch, config, client};
let isAwake = true;
const logChannelId = config.get('log-channel');

let logChannel;


client.on('error', (error) => {
    console.error(new Date() + ": Discord client encountered an error");
    console.error(error);
});

client.once('ready', async () => {
    console.log('here i go');
    for (const moduleName of modules) {
        const Module = require('./modules/' + moduleName);
        const testModule = new Module(context);
    }
    logChannel = client.channels.get(logChannelId);
});

client.on('message', (msg) => {
    
    if (msg.content === '!sleep' && msg.channel.id === config.get('bot-channel')) {
        isAwake = !isAwake;
        isAwake ? 
            msg.channel.send(`I'm awake now!`) :
            msg.channel.send(`Oya...sumi...`);
    }

    if (isAwake) {
        dispatch.informModules(msg);
    }
});

client.on('messageDelete', (deletedMessage) => {
    console.log(deletedMessage)
    if (!deletedMessage.author.bot) {
        let messageToSend = ' ';
        if (deletedMessage.content) {
            messageToSend = deletedMessage.content;
        }
        logChannel.send(`The message: \`\`\`${messageToSend}\`\`\`by \`${deletedMessage.author.tag}\` was deleted.`);
        if (deletedMessage.attachments.size > 0) {
            let attachmentsString;
            for (const attachment of deletedMessage.attachments) {
                if (attachment.url) {
                    attachmentsString += attachment[1].url + '\n';
                }              
            }
            logChannel.send(`It had the following attachments:\n${attachmentsString}`)
        }
    }   
});

client.on('guildMemberRemove', (member) => {
    logChannel.send(`${member.username} has left the server.`);
});

client.on('guildMemberAdd', (member) => {
    logChannel.send(`${member.username} has joined the server.`);
})

client.login(config.get('bot-token'));  