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

client.on('messageDelete', async (deletedMessage) => {
    if (!deletedMessage.author.bot) {
        const deleteLog = await deletedMessage.guild.fetchAuditLogs({type: 'MESSAGE_DELETE'}).then(logs => logs.entries.first());
        const deleter = deleteLog.executor;
        let messageToSend = ' ';
        if (deletedMessage.content) {
            messageToSend = deletedMessage.content;
        }
        logChannel.send(`${deleter.username} deleted the message: \`\`\`${messageToSend}\`\`\`by \`${deletedMessage.author.tag}\`.`);
        if (deletedMessage.attachments.size > 0) {
            let attachmentsString = '';
            for (const attachment of deletedMessage.attachments) {
                if (attachment[1].url) {
                    attachmentsString += attachment[1].url + '\n';
                }              
            }
            logChannel.send(`It had the following attachments:\n${attachmentsString}`)
        }
    }   
});

client.on('guildBanAdd', (guild, user) => {
    logChannel.send(`${user.username} has been banned from the server.`);
});

client.on('guildMemberRemove', (member) => {
    const leaveEmbed = new Discord.RichEmbed()
        .setTitle('A user has left the server!')
        .setDescription(`${member.user.username}#${member.user.discriminator}`)
        .setThumbnail(`https://cdn.discordapp.com/avatars/${member.user.id}/${member.user.avatar}.jpg`)
    logChannel.send(leaveEmbed);
});

client.on('guildMemberAdd', (member) => {
    const generalChat = config.get('general-channel');
    const generalChannel = client.channels.get(generalChat);
    generalChannel.send(`Hello <@!${member.id}>, welcome to The Doghouse! :house_with_garden: Please read <#$528514915502260225> and familiarize yourself with the <#$535286698360438784>! :wolf:  You can also visit <#$562770736037494854> and assign yourself some roles~`);
    const joinEmbed = new Discord.RichEmbed()
        .setTitle('A user has joined the server!')
        .setDescription(`${member.user.username}#${member.user.discriminator}`)
        .setThumbnail(`https://cdn.discordapp.com/avatars/${member.user.id}/${member.user.avatar}.jpg`);
    logChannel.send(joinEmbed);
});

client.on('voiceStateUpdate', (oldMember, newMember) => {
    const currentVoice = newMember.voiceChannelID;
    const roleId = config.get('voice-role-id');
    const voiceIDs = config.get('voice-channel-id');
    if (voiceIDs.includes(currentVoice)) {
            newMember.addRole(roleId);
    } else {
        if (newMember.roles.find(r => r.id === roleId)) {
            newMember.removeRole(roleId);
        }
    }
});

client.login(config.get('bot-token'));  