const { Client, GatewayIntentBits } = require('discord.js');
const config = require('./config.json');
const { loadCommands } = require('./src/handlers/commandHandler');
const { loadEvents } = require('./src/handlers/eventHandler');
const logger = require('./src/utils/logManager');

// 봇 클라이언트 생성
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// 커맨드 로드
const { commands, commandHandlers } = loadCommands();

// 이벤트 로드
loadEvents(client, commands, commandHandlers, config);

// 에러 처리
client.on('error', (error) => {
    logger.error('봇 에러:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('처리되지 않은 Promise 거부:', reason);
});

// 봇 로그인
client.login(config.token);