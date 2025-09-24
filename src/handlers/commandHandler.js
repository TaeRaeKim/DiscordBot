const fs = require('fs');
const path = require('path');
const logger = require('../utils/logManager');

function loadCommands() {
    const commands = [];
    const commandHandlers = {};
    const commandsPath = path.join(__dirname, '..', 'commands');
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        const command = require(filePath);

        if ('data' in command && 'execute' in command) {
            // 모든 명령어에 DM 권한 제한 적용 (이미 설정된 경우 덮어쓰지 않음)
            if (command.data.dm_permission === undefined) {
                command.data.setDMPermission(false);
            }

            commands.push(command.data.toJSON());
            commandHandlers[command.data.name] = command;
        } else {
            logger.warn(`[경고] ${filePath}의 커맨드에 필수 "data" 또는 "execute" 속성이 누락되었습니다.`);
        }
    }

    return { commands, commandHandlers };
}

module.exports = { loadCommands };