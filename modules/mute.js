const Discord = require('discord.js');

class MuteModule {
    constructor(context) {
        this.dispatch = context.dispatch;
        this.config = context.config;
        this.client = context.client;
        this.mutedUsers = {};

        this.dispatch.hook('?mute', (message) => {
            const modIds = this.config.get('mod-ids');
            const muteId = this.config.get('mute-id');
            if (message.member.roles.find(r => modIds.includes(r.id))) {
                const args = message.content.split(' ');
                const userId = args[1].match(/\d+/g);
                const muteTime = args[2];
                if (!userId[0] || !muteTime) {
                    return message.channel.send('The command is `?mute @user time`!');
                }
                const muted = message.guild.members.get(userId[0]);
                if (!muted) {
                    return message.channel.send('I couldn\'t find that user...');
                }

                if (!muted.roles.find(r => muteId === r.id)) {
                    muted.addRole(muteId).then(member => {
                        message.channel.send(`I\'ve muted that user for ${muteTime} minutes!`);
                        member.send(`Hello, I'm here to inform you that you've been muted in the Doghouse server for ${muteTime} minutes. Take this time to reflect and relax, and we'll see you soon.`);
                    });
                }

                this.mutedUsers[muteId] = setTimeout(() => {
                    if (muted) {
                        muted.removeRole(muteId);
                        muted.send('Hello again, here to let you know that the mute has expired now. Welcome back! :purple_heart:');
                    }
                }, parseInt(muteTime, 10) * 60000);
            }
        });

        this.dispatch.hook('?unmute', (message) => {
            const modIds = this.config.get('mod-ids');
            const muteId = this.config.get('mute-id');
            if (message.member.roles.find(r => modIds.includes(r.id))) {
                const args = message.content.split(' ');
                const userId = args[1].match(/\d+/g);
                if (!userId[0]) {
                    return message.channel.send('The command is `?unmute @user`!');
                }
                const unMuted = message.guild.members.get(userId[0]);
                if (!unMuted) {
                    return message.channel.send('I couldn\'t find that user...');
                }
                if (!unMuted.roles.find(r => muteId === r.id)) {
                    return message.channel.send('That user is not currently muted.');
                }

                unMuted.removeRole(muteId).then(member => {
                    message.channel.send(`I\'ve un-muted that user!`);
                    member.send(`Hello again, here to let you know that the mute has been manually removed. Welcome back! :purple_heart:`);
                });

                if (this.mutedUsers[muteId]) {
                    clearTimeout(this.mutedUsers[muteId]);
                    delete this.mutedUsers[muteId];
                }
            }
        });
    }
}

module.exports = MuteModule;