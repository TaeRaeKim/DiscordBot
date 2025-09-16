const fs = require('fs');
const path = require('path');
const util = require('util');

class LogManager {
    constructor() {
        this.logDir = path.join(process.cwd(), 'logs');
        this.currentLogFile = null;
        this.writeStream = null;

        // 로그 디렉토리 생성
        if (!fs.existsSync(this.logDir)) {
            fs.mkdirSync(this.logDir, { recursive: true });
        }

        // 초기 로그 파일 설정
        this.updateLogFile();

        // 24시간마다 로그 정리 및 파일 갱신
        setInterval(() => {
            this.cleanOldLogs();
            this.updateLogFile();
        }, 24 * 60 * 60 * 1000); // 24시간

        // 프로세스 종료 시 스트림 정리
        process.on('exit', () => {
            if (this.writeStream) {
                this.writeStream.end();
            }
        });
    }

    // 현재 날짜의 로그 파일 설정 (한국 시간 기준)
    updateLogFile() {
        const date = new Date();
        const kstDate = new Date(date.getTime() + (9 * 60 * 60 * 1000)); // UTC + 9
        const fileName = `${kstDate.getUTCFullYear()}-${String(kstDate.getUTCMonth() + 1).padStart(2, '0')}-${String(kstDate.getUTCDate()).padStart(2, '0')}.log`;
        const filePath = path.join(this.logDir, fileName);

        // 파일이 변경되었을 경우만 스트림 재생성
        if (this.currentLogFile !== filePath) {
            // 기존 스트림 종료
            if (this.writeStream) {
                this.writeStream.end();
            }

            this.currentLogFile = filePath;
            this.writeStream = fs.createWriteStream(filePath, { flags: 'a' });
        }
    }

    // 7일 이상 된 로그 파일 삭제
    cleanOldLogs() {
        try {
            const files = fs.readdirSync(this.logDir);
            const now = Date.now();
            const sevenDaysInMs = 7 * 24 * 60 * 60 * 1000;

            files.forEach(file => {
                if (file.endsWith('.log')) {
                    const filePath = path.join(this.logDir, file);
                    const stats = fs.statSync(filePath);
                    const fileAge = now - stats.mtimeMs;

                    if (fileAge > sevenDaysInMs) {
                        fs.unlinkSync(filePath);
                        this.writeLog('INFO', `오래된 로그 파일 삭제: ${file}`);
                    }
                }
            });
        } catch (error) {
            this.writeLog('ERROR', `로그 정리 실패: ${error.message}`);
        }
    }

    // 로그 포맷팅 (한국 시간 기준)
    formatMessage(level, ...args) {
        const now = new Date();
        const kstOffset = 9 * 60; // KST는 UTC+9
        const kstTime = new Date(now.getTime() + kstOffset * 60 * 1000);

        // YYYY-MM-DD HH:mm:ss 형식으로 포맷팅
        const year = kstTime.getUTCFullYear();
        const month = String(kstTime.getUTCMonth() + 1).padStart(2, '0');
        const day = String(kstTime.getUTCDate()).padStart(2, '0');
        const hours = String(kstTime.getUTCHours()).padStart(2, '0');
        const minutes = String(kstTime.getUTCMinutes()).padStart(2, '0');
        const seconds = String(kstTime.getUTCSeconds()).padStart(2, '0');
        const milliseconds = String(kstTime.getUTCMilliseconds()).padStart(3, '0');

        const timestamp = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${milliseconds} KST`;

        const messages = args.map(arg => {
            if (typeof arg === 'object') {
                return util.inspect(arg, { depth: 3, colors: false });
            }
            return String(arg);
        });

        return `[${timestamp}] [${level}] ${messages.join(' ')}`;
    }

    // 파일에 로그 작성
    writeLog(level, ...args) {
        const message = this.formatMessage(level, ...args);

        // 콘솔 출력 (레벨에 따라 색상 다르게)
        const consoleColors = {
            'ERROR': '\x1b[31m',   // 빨강
            'WARN': '\x1b[33m',    // 노랑
            'INFO': '\x1b[36m',    // 청록
            'DEBUG': '\x1b[90m',   // 회색
            'SUCCESS': '\x1b[32m'  // 초록
        };

        const color = consoleColors[level] || '\x1b[0m';
        console.log(`${color}${message}\x1b[0m`);

        // 파일에 쓰기
        if (this.writeStream && !this.writeStream.destroyed) {
            this.writeStream.write(message + '\n');
        }
    }

    // 로그 레벨별 메서드
    log(...args) {
        this.writeLog('INFO', ...args);
    }

    info(...args) {
        this.writeLog('INFO', ...args);
    }

    error(...args) {
        this.writeLog('ERROR', ...args);
    }

    warn(...args) {
        this.writeLog('WARN', ...args);
    }

    debug(...args) {
        this.writeLog('DEBUG', ...args);
    }

    success(...args) {
        this.writeLog('SUCCESS', ...args);
    }
}

// 싱글톤 인스턴스
const logger = new LogManager();

module.exports = logger;