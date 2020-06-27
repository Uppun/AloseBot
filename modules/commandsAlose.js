const Discord = require('discord.js');

class CommandModule {
    constructor(context) {
        this.dispatch = context.dispatch;
        this.config = context.config;
        this.botChannel = this.config.get('bot-channel');
        this.botSpeakChannel = this.config.get('bot-speak-channel');
        this.commandList = `
        !mybirthday month/day - Only works in bot-commands channel, put in the numerical representation of your birth month and day, when the date is reached Alose will announce in general!\n
        !8ball - Works only in bot-commands, ask Alose a question and she will predict your future!\n
        !pick this or that - Ask alose to choose between two choices, either ‘this’ or ‘that’, choices must be separated by an or!`
        this.dispatch.hook('!commands', (message) => {
            if ((message.channel.id === this.botSpeakChannel || message.channel.id === this.botChannel)) {
                message.channel.send(this.commandList);
            } 
        });
    }
}

module.exports = CommandModule;