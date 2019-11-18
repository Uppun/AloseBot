class EightBallModule {
    constructor(context) {
        this.dispatch = context.dispatch;
        this.config = context.config;
        this.replies = [
            '🡸 Alose catches the ball mid-air!\`\`\`✅ It is certain.',
            '🡸 Alose chases after the ball, running back to you excitedly and dropping it at your feet.\`\`\`✅ Without a doubt.',
            '🡸 Alose snatches the ball, scampering back to you with it in her mouth as her tail wags ferociously.\`\`\`✅ Yes - definitely.',
            '🡸 Alose chases after the ball, losing it momentarily before finding it and returning it to you.\`\`\`✅ Most likely.',
            '🡸 Alose bounds after the ball, returning with it and some puppy kisses too.\`\`\`✅ Outlook good.',
            '🡸 Alose catches it, returning it swiftly to you. Drool and all!\`\`\`✅ Yes.',
            '🡸 Alose returns it, dropping it on the ground and tilting her head.\`\`\`❔ Reply hazy, try again.',
            '🡸 Alose runs after the ball and brings you back a stick.\`\`\`❔ Ask again later.',
            '🡸 Alose runs after the ball but leaves it where it is, returning to you empty handed.\`\`\`❔ Better not tell you now.',
            '🡸 Alose runs after the ball and catches it.. but refuses to return it.\`\`\`❔ Cannot predict now.',
            '🡸 Alose is bonked in the head by the ball from your misaimed throw.\`\`\`❔ Concentrate and ask again.',
            '🡸 Alose watches you throw the ball.. just watches you.\`\`\`🅾️ Don’t count on it.',
            '🡸 Alose believes you haven\'t thrown the ball at all.\`\`\`🅾️ My reply is no.',
            '🡸 Alose runs in the direction of the ball... and then past it, she\'s clearly lost her way.\`\`\`🅾️ My sources say no.',
            '🡸 Alose doesn\'t chase the ball, preferring to chase her tail instead.\`\`\`🅾️ Outlook not so good.',
            '🡸 Alose chases after the ball before accidentally swallowing it whole.\`\`\`🅾️ Very doubtful.',
        ];

        this.dispatch.hook('!8ball', (message) => {
            const botChannel = this.config.get('bot-channel');
            const botSpeakChannel = this.config.get('bot-speak-channel');
            if ((message.channel.id === botSpeakChannel || message.channel.id === botChannel)) {
                let eightBallString =  `\`\`\`🡺 ${message.member.displayName} throws the magic 8ball.\n…\n`
                eightBallString += eightBallReplies[Math.floor(Math.random() * eightBallReplies.length)];
                message.channel.send(eightBallString);
            }
        });
    }
}