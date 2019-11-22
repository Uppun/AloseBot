class AnnounceModule {
    constructor(context) {
        this.dispatch = context.dispatch;
        this.config = context.config;

        this.dispatch.hook('!alosay', (message) => {
            const channel = this.config.get('mod-channel');
            const generalChannel = this.config.get('general-channel');
            if (message.channel.id === channel) {
                let attachments = message.attachments.array();
                checkAttachments(attachments) ? client.channels.get(generalChannel).send(makePings(message.content.slice('!alosay'.length).trim()), 
                {
                    file: attachments[0].url,
                }) :
                client.channels.get(generalChannel).send(makePings(message.content.slice('!alosay'.length).trim()));
            }
        });

        this.dispatch.hook('!announce', (message) => {
            const channel = this.config.get('mod-channel');
            const announceChannel = this.config.get('announce-channel');
            if (message.channel.id === channel) {
                let attachments = message.attachments.array();
                checkAttachments(attachments) ? client.channels.get(announceChannel).send(makePings(message.content.slice('!announce'.length).trim()), 
                {
                    file: attachments[0].url,
                }) :
                client.channels.get(announceChannel).send(makePings(message.content.slice('!announce'.length).trim()));
            }
        });
    }
}

module.exports = AnnounceModule;