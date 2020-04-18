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
                const userId = args[1];
                const muteTime = args[2];
                if (!userId || !muteTime) {
                    return message.channel.send('The command is `?mute @user time`!');
                }
                const muted = message.members.guild.get(userId);
                if (!muted) {
                    return message.channel.send('I couldn\'t find that user...');
                }
                if (!muted.member.roles.find(r => muteId === r.id)) {
                    muted.addRole(muteId).then(member => {
                        message.channel.send(`I\'ve muted that user for ${muteTime} minutes!`);
                        member.send(`You have been muted in the Doghouse server for ${muteTime} minutes for bad behavior.`);
                    });
                }

                this.mutedUsers[muteId] = setTimeout(() => {
                    if (muted) {
                        muted.removeRole(muteId);
                        muted.send('The mute has expired!');
                    }
                }, parseInt(muteTime, 10) * 60000);
            }
        });

        this.dispatch.hook('?unmute', (message) => {
            const modIds = this.config.get('mod-ids');
            const muteId = this.config.get('mute-id');
            if (message.member.roles.find(r => modIds.includes(r.id))) {
                const args = message.content.split(' ');
                const userId = args[1];
                if (!userId) {
                    return message.channel.send('The command is `?unmute @user`!');
                }
                const unMuted = message.members.guild.get(userId);
                if (!unMuted) {
                    return message.channel.send('I couldn\'t find that user...');
                }
                if (!unMuted.member.roles.find(r => muteId === r.id)) {
                    return message.channel.send('That user is not currently muted.');
                }

                unMuted.removeRole(muteId).then(member => {
                    message.channel.send(`I\'ve un-muted that user!`);
                    member.send(`Your mute has been manually removed!`);
                });

                if (this.mutedUser[muteId]) {
                    clearTimeout(this.mutedUsers[muteId]);
                    delete this.mutedUsers[muteId];
                }
            }
        });
    }
}

module.exports = MuteModule;