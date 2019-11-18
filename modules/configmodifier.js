class ConfigModifier {
    constructor(context) {
        this.dispatch = context.dispatch;
        this.config = context.config;

        this.dispatch.hook('!setconfig', (message) => {
            const botChannel = this.config.get('bot-channel');
            if (message.channel.id === botChannel && (/^!setconfig\s([a-zA-Z'-]+)\s(\w+)$/).test(message.content)) {
                const splitMessage = message.content.split(' ');
                const option = splitMessage[1];
                const value = splitMessage[2];
                const optionToChange = this.config.get(option);
                let newOption;

                if (optionToChange) {
                    newOption = Array.isArray(optionToChange) ? optionToChange.push(value) : value;
                    this.config.set(option, newOption);
                    message.channel.send('Config option set!');
                } else {
                    message.channel.send('Config option not found!');
                }
                
            }
        });

        this.dispatch.hook('!addconfig', (message) => {
            const botChannel = this.config.get('bot-channel');
            if (message.channel.id === botChannel && (/^!addconfig\s([a-zA-Z'-]+)\s(\w+)$/).test(message.content)) {
                const splitMessage = message.content.split(' ');
                const option = splitMessage[1];
                const value = splitMessage[2];

                if (!this.config.get(option)) {
                    this.config.set(option, value);
                    message.channel.send('Config option added!');
                } else {
                    message.channel.send('Config option already exists!');
                }
            }
        });

        this.dispatch.hook('!removeconfig', (message) => {
            const botChannel = this.config.get('bot-channel');
            if (message.channel.id === botChannel && (/^!removeconfig\s([a-zA-Z'-]+)$/).test(message.content)) {
                const splitMessage = message.content.split(' ');
                const option = splitMessage[1];
                const current = this.config.get(option);

                if (current) {
                    this.config.set(option, null);
                    message.channel.send('Config option removed!');
                } else {
                    message.channel.send('Config option doesn\'t exist!');
                }
            }
        });

        this.dispatch.hook('!appendconfig', (message) => {
            const botChannel = this.config.get('bot-channel');
            if (message.channel.id === botChannel && (/^!appendconfig\s([a-zA-Z'-]+)\s(\w+)$/).test(message.content)) {
                const splitMessage = message.content.split(' ');
                const option = splitMessage[1];
                const value = splitMessage[2];
                const current = this.config.get(option);

                if (current) {
                    let newValue;

                    if (Array.isArray(current)) {
                        newValue = [...current, value];
                    } else {
                        newValue = [current, value];
                    }
                    this.config.set(option, newValue);
                    message.channel.send('Config option updated!')      
                } else {
                    message.channel.send('Config option doesn\'t exist! Use !addconfig to add a new option.');
                }
            }
        });

        this.dispatch.hook('!detachconfig', (message) => {
            const botChannel = this.config.get('bot-channel');
            if (message.channel.id === botChannel && (/^!detachconfig\s([a-zA-Z'-]+)\s(\w+)$/).test(message.content)) {
                const splitMessage = message.content.split(' ');
                const option = splitMessage[1];
                const value = splitMessage[2];
                const current = this.config.get(option);

                if (current) {
                    if (Array.isArray(current)) {
                        const index = current.indexOf(value);
                        if (index >= 0) {
                            current.splice(index, 1);
                            this.config.set(option, current);
                            message.channel.send('Config option removed from list!');
                        } else {
                            message.channel.send('Config option not found in list!');
                        }
                    } else {
                        message.channel.send('You can only remove an option from a list using this command, if you want to remove an option entirely use !removeconfig');
                    }
                }
            }
        });
    }
}

module.exports = ConfigModifier;