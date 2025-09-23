const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const sslDir = path.join(__dirname, '..', 'ssl');

// SSL 디렉토리 생성
if (!fs.existsSync(sslDir)) {
    fs.mkdirSync(sslDir);
}

const keyPath = path.join(sslDir, 'private.key');
const certPath = path.join(sslDir, 'certificate.crt');

// 개발용 자체 서명 SSL 인증서 생성
try {
    console.log('SSL 인증서 생성 중...');

    // OpenSSL 명령어를 사용하여 개발용 SSL 인증서 생성
    const openSSLCommand = `openssl req -x509 -newkey rsa:4096 -keyout "${keyPath}" -out "${certPath}" -days 365 -nodes -subj "/C=KR/ST=Seoul/L=Seoul/O=ForkTower/CN=localhost"`;

    execSync(openSSLCommand, { stdio: 'inherit' });

    console.log('✅ SSL 인증서가 성공적으로 생성되었습니다!');
    console.log(`- 개인키: ${keyPath}`);
    console.log(`- 인증서: ${certPath}`);
    console.log('\n⚠️  개발용 자체 서명 인증서입니다. 프로덕션에서는 신뢰할 수 있는 인증 기관의 인증서를 사용하세요.');

} catch (error) {
    console.error('❌ OpenSSL이 설치되지 않았거나 경로에 없습니다.');
    console.log('\n수동으로 SSL 인증서를 생성하는 방법:');
    console.log('1. OpenSSL 설치: https://www.openssl.org/source/');
    console.log('2. 다음 명령어 실행:');
    console.log(`   openssl req -x509 -newkey rsa:4096 -keyout "${keyPath}" -out "${certPath}" -days 365 -nodes`);
    console.log('\n또는 다른 방법으로 SSL 인증서를 생성하여 다음 경로에 저장:');
    console.log(`- 개인키: ${keyPath}`);
    console.log(`- 인증서: ${certPath}`);
}