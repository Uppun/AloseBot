const Discord = require('discord.js');
const fs = require('fs');
const codes = fs.readdirSync('./assets/SNOWFLAKES');

const codeMap = new Map();
for (const code of codes) {
    codeMap.set(code.substr(0, code.length-4), new Discord.MessageAttachment(`./assets/SNOWFLAKES/${code}`, `${code}`));
}

module.exports = codeMap;