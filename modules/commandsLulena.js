const Discord = require('discord.js');

class CommandModule {
    constructor(context) {
        this.dispatch = context.dispatch;
        this.config = context.config;
        this.botChannel = this.config.get('bot-channel');
        this.botSpeakChannel = this.config.get('bot-speak-channel');
        this.commandList = `
            ?iam \`role name\` - Only usable in bot-commands, allows you to add a self-assignable role to your profile!\n
            ?iamnot \`role name\` - Only usable in bot-commands, allows you to remove a self-assignable role from your profile. `
        this.dispatch.hook('?commands', (message) => {
            if ((message.channel.id === this.botSpeakChannel || message.channel.id === this.botChannel)) {
                message.channel.send(this.commandList);
            } 
        });
    }
}

module.exports = CommandModule;