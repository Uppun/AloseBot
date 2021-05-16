const Discord = require("discord.js"); 
const XMLHttpRequest = require("xmlhttprequest").XMLHttpRequest;
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

class PicartoModule {
    constructor(context) {
        this.dispatch = context.dispatch;
        this.config = context.config;
        this.client = context.client;
    }
}

export default PicartoModule;