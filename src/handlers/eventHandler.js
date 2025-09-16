const fs = require('fs');
const path = require('path');
const logger = require('../utils/logManager');

function loadEvents(client, commands, commandHandlers, config) {
    const eventsPath = path.join(__dirname, '..', 'events');
    const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

    for (const file of eventFiles) {
        const filePath = path.join(eventsPath, file);
        const event = require(filePath);

        if (event.name === 'interactionCreate') {
            // interactionCreate는 Discord.js가 interaction을 첫 번째 인자로 전달
            client.on(event.name, (interaction) => {
                event.execute(client, interaction, commands, commandHandlers, config);
            });
        } else if (event.name === 'clientReady') {
            client.once(event.name, () => {
                event.execute(client, commands, config);
            });
        } else if (event.name === 'guildMemberAdd' || event.name === 'guildMemberRemove') {
            // 멤버 이벤트는 member를 첫 번째 인자로 전달
            client.on(event.name, (member) => {
                event.execute(client, member, config);
            });
        } else if (event.name === 'threadCreate') {
            // threadCreate 이벤트는 thread를 첫 번째 인자로 전달
            client.on(event.name, (thread) => {
                event.execute(thread);
            });
        } else {
            // 기타 이벤트
            if (event.once) {
                client.once(event.name, (...args) => event.execute(client, ...args, commands, commandHandlers, config));
            } else {
                client.on(event.name, (...args) => event.execute(client, ...args, commands, commandHandlers, config));
            }
        }

        logger.info(`✅ 이벤트 로드됨: ${event.name}`);
    }
}

module.exports = { loadEvents };