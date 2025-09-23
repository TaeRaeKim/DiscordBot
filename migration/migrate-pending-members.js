const fs = require('fs');
const path = require('path');
const database = require('../src/services/database');

async function migratePendingMembersToDatabase() {
    console.log('🚀 pending_members.json을 SQLite 데이터베이스로 마이그레이션을 시작합니다...\n');

    try {
        const pendingMembersPath = path.join(__dirname, '..', 'pending_members.json');

        // pending_members.json 파일 존재 확인
        if (!fs.existsSync(pendingMembersPath)) {
            console.log('⚠️  pending_members.json 파일이 없습니다. 마이그레이션을 건너뜁니다.');
            return;
        }

        // JSON 파일 읽기
        const jsonData = JSON.parse(fs.readFileSync(pendingMembersPath, 'utf8'));
        const entries = Object.entries(jsonData);

        if (entries.length === 0) {
            console.log('📄 pending_members.json 파일이 비어있습니다.');
            return;
        }

        console.log(`📋 ${entries.length}개의 대기 멤버 데이터를 발견했습니다.`);
        console.log('');

        let successCount = 0;
        let errorCount = 0;

        // 각 멤버 데이터를 데이터베이스에 저장
        for (const [key, memberData] of entries) {
            try {
                // JSON의 timestamp를 ISO 문자열로 변환
                const joinedAt = new Date(memberData.joinTime).toISOString();
                const timerExpiresAt = new Date(memberData.kickTime).toISOString();

                // 데이터베이스에 저장
                await database.setPendingMember(
                    memberData.guildId,
                    memberData.memberId,
                    memberData.username,
                    joinedAt,
                    timerExpiresAt
                );

                console.log(`✅ ${memberData.username} (${memberData.memberId}) 마이그레이션 완료`);
                successCount++;

            } catch (error) {
                console.error(`❌ ${memberData.username} (${memberData.memberId}) 마이그레이션 실패:`, error.message);
                errorCount++;
            }
        }

        console.log('');
        console.log('📊 마이그레이션 완료 결과:');
        console.log(`   성공: ${successCount}개`);
        console.log(`   실패: ${errorCount}개`);
        console.log(`   총계: ${entries.length}개`);

        if (successCount > 0) {
            console.log('');
            console.log('🎯 마이그레이션이 성공적으로 완료되었습니다!');
            console.log('');
            console.log('📋 다음 단계:');
            console.log('1. 봇을 재시작하여 데이터베이스 연결 확인');
            console.log('2. `/대기목록` 명령어로 데이터 확인');
            console.log('3. 모든 기능이 정상 작동하는지 테스트');
        }

    } catch (error) {
        console.error('❌ 마이그레이션 중 오류 발생:', error);
        process.exit(1);
    }
}


// 데이터베이스 확인 함수
async function verifyMigration(guildId) {
    try {
        const count = guildId ? await database.getPendingMembersCount(guildId) : 0;
        const members = await database.getAllPendingMembers();
        console.log(`\n🔍 데이터베이스 확인: 총 ${members.length}개의 대기 멤버가 저장되어 있습니다.`);

        if (members.length > 0) {
            console.log('\n📋 저장된 대기 멤버 목록:');
            members.forEach((member, index) => {
                const joinDate = new Date(member.joined_at).toLocaleString('ko-KR');
                const expireDate = new Date(member.timer_expires_at).toLocaleString('ko-KR');
                console.log(`   ${index + 1}. ${member.username} (Guild: ${member.guild_id}, 가입: ${joinDate}, 만료: ${expireDate})`);
            });
        }
    } catch (error) {
        console.error('❌ 데이터베이스 확인 중 오류:', error);
    }
}

// 스크립트 실행
if (require.main === module) {
    migratePendingMembersToDatabase()
        .then(() => verifyMigration())
        .then(() => {
            process.exit(0);
        })
        .catch((error) => {
            console.error('스크립트 실행 중 오류:', error);
            process.exit(1);
        });
}

module.exports = {
    migratePendingMembersToDatabase,
    verifyMigration
};