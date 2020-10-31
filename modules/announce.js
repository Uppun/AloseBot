
const fileTypes = [
    'jpg',
    'jpeg',
    'png',
    'gif',
    'mp4',
    'webm',
];

function checkAttachments(attachments) {
    if (attachments.length > 0) {
        const url = attachments[0].url;
        for (const fileType of fileTypes) {
            if (url.indexOf(fileType, url.length - fileType.length) !== -1) {
                return true
            }
        }
    }

    return false;
}

function makePings(message, client) {
    if (!message.includes('@')) {
        return message;
    }

    const guild = client.guilds.array()[0];
    let newMessage = (' ' + message).slice(1);
    const members = guild.members.array();
    for (const member of members) {
      if (newMessage.includes(('@' + member.user.username)) || newMessage.includes(('@' + member.user.username.toLowerCase())) ) {
        newMessage = newMessage.replace(('@' + member.user.username), ('<@' + member.user.id + '>'));
        newMessage = newMessage.replace(('@' + member.user.username.toLowerCase()), ('<@' + member.user.id + '>'));
      }
      if (member.nickname) {
        if (newMessage.includes(('@' + member.nickname)) || newMessage.includes(('@' + member.nickname.toLowerCase()))) {
          newMessage = newMessage.replace(('@' + member.nickname), ('<@!' + member.user.id + '>'));
          newMessage = newMessage.replace(('@' + member.nickname.toLowerCase()), ('<@!' + member.user.id + '>'));
        }
      }
    }

    return newMessage
}

class AnnounceModule {
    constructor(context) {
        this.dispatch = context.dispatch;
        this.config = context.config;
        this.client = context.client;

        this.dispatch.hook('!announce', (message) => {
            const channel = this.config.get('bot-channel');
            const announceChannel = this.config.get('announce-channel');
            if (message.channel.id === channel) {
                let attachments = message.attachments.array();
                checkAttachments(attachments) ? this.client.channels.resolve(announceChannel).send(makePings(message.content.slice('!announce'.length).trim(), this.client), 
                {
                    file: attachments[0].url,
                }) :
                this.client.channels.resolve(announceChannel).send(makePings(message.content.slice('!announce'.length).trim()));
            }
        });
    }
}

module.exports = AnnounceModule;