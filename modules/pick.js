const Discord = require('discord.js');

class PickModule {
    constructor(context) {
        this.dispatch = context.dispatch;
        this.config = context.config;
        this.botChannel = this.config.get('bot-channel');
        this.botSpeakChannel = this.config.get('bot-speak-channel');

        this.dispatch.hook('!pick', (message) => {
            if (message.channel.id === this.botSpeakChannel || message.channel.id === this.botChannel) {
                const trimmedMessage = message.content.slice('!pick'.length).trim();
                const choices = trimmedMessage.split((/\sor\s/));
                const result = Math.floor(Math.random() * choices.length);
                message.channel.send(choices[result]);
            } 
        });
    }
}

module.exports = PickModule;