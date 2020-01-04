const Discord = require('discord.js');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

class RoleAssignmentModule {
    constructor(context) {
        this.dispatch = context.dispatch;
        this.config = context.config;
        this.client = context.client;
        this.db = new sqlite3.Database(path.join(__dirname, '../db/AloseDB.db'));
        this.roles = {};

        this.db.run(`
            CREATE TABLE IF NOT EXISTS assignable_roles (
            role_id TEXT,
            role_name TEXT,
            PRIMARY KEY (role_id, role_name)
        )`, 
        (err) => { 
            if (err) {
                console.error(err.message);
            }
            const roleSql = `SELECT role_id, role_name FROM assignable_roles`;

            this.db.all(roleSql, [], (err, rows) => {
                if (err) {
                    throw err;
                }
                rows.forEach((row) => {
                    this.roles[row.role_name] = row.role_id;
                });
            });
    
            console.log('roles loaded');
        });

        this.dispatch.hook('!asar', (message) => {
            const channel = this.config.get('bot-channel');
            if (channel === message.channel.id) {
                const name = message.content.substr('!asar'.length).trim();
                const role = message.guild.roles.find(role => role.name === name);
                if (role) {
                    const id = role.id;
                    this.db.run(`
                    INSERT INTO assignable_roles (role_id, role_name)
                    VALUES (?, ?)
                    `, [id, name], (err) => {
                      if (err) {
                        console.error(err.message);
                      }
                    });
                    this.roles[name] = id;

                    message.channel.send(`${name} added to the list of assignable roles!`);
                } else {
                    message.channel.send(`Role not found...`);
                }
            }
        });

        this.dispatch.hook('!rsar', (message) => {
            const channel = this.config.get('bot-channel');
            if (channel === message.channel.id) {
                const name = message.content.substr('!rsar'.length).trim();
                const role = message.guild.roles.find(role => role.name === name);
                if (role) {
                    this.db.run(`
                    DELETE FROM assignable_roles WHERE role_name=?`, name, (err) => {
                      if (err) {
                        console.error(err.message);
                      }
                    });
                    delete this.roles[name];
                    
                    message.channel.send(`${name} removed from the list of assignable roles!`)
                } else {
                    message.channel.send(`Role not found...`);
                }
            }
        });

        this.dispatch.hook('!lsar', (message) => {
            const botChannel = this.config.get('bot-speak-channel');
            const modChannel = this.config.get('bot-channel');
            if ((message.channel.id === botChannel) || (message.channel.id === modChannel)) {
                const roles = Object.keys(this.roles);
                let roleString = '';
                for (const [i, role] of roles.entries()) {
                    roleString += role;
                    if (i + 1 < roles.length) {
                        roleString += '\n';
                    }
                }

                const rolesEmbed = new Discord.RichEmbed()
                    .setColor('#89cff0')
                    .setTitle(`There are ${roles.length} self-assignable roles.`)
                    .setDescription(roleString);
                message.channel.send(rolesEmbed);
            }
        });

        this.dispatch.hook('!iam', (message) => {
            const botChannel = this.config.get('bot-speak-channel');
            if (message.channel.id === botChannel) {
                const role = message.content.substr('!iam'.length).trim();
                const roleId = this.roles[role];
                if (roleId) {
                    if (!message.member.roles.find(role => role.id === roleId)) {
                        message.member.addRole(roleId).then(member => {
                            message.channel.send(`${member.displayName} you now have the ${role} role!`)
                        });
                    } else {
                        message.channel.send(`You already have that role!`)
                    }
                }
            } else {
                message.channel.send('That is not a role that I can give you!');
            }
        });

        this.dispatch.hook('!iamnot', (message) => {
            const botChannel = this.config.get('bot-speak-channel');
            if (message.channel.id === botChannel) {
                const role = message.content.substr('!iamnot'.length).trim();
                const roleId = this.roles[role];
                if (roleId) {
                    if(message.member.roles.find(role => role.id === roleId)) {
                        message.member.removeRole(roleId).then(member => {
                            message.channel.send(`${member.displayName} you no longer have the ${role} role!`)
                        });
                    } else {
                        message.channel.send(`You don't have that role!`)
                    }
                }
            } else {
                message.channel.send('That is not a role that I role I can remove from you!');
            }
        });
    }
}

module.exports = RoleAssignmentModule;