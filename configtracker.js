const fs = require('fs');

class ConfigTracker {
    getConfig() {
        const channels = JSON.parse(fs.readFileSync('channels.txt', 'utf8'));
        return channels;
    }
    addConfig(channelId) {
        const channels = JSON.parse(fs.readFileSync('channels.txt', 'utf8'));
        channels.push(channelId);
        JSON.stringify(fs.writeFileSync('channels.txt', 'utf8'));
    }
    removeConfig(channelId) {
        let channels = JSON.parse(fs.readFileSync('channels.txt', 'utf8'));
        const index = channels.indexOf(channelId);

    }
}