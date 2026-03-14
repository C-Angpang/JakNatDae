// 점수 등록 로직

let editingMatchId = null; // 수정 모드 시 매치 ID

// 점수 등록 탭 UI 초기화
async function loadScoreUI() {
    const players = await getRegisteredPlayers();

    // 점수 입력 페이지의 자동완성 설정
    document.querySelectorAll('#scores .score-entry').forEach(entry => {
        const input = entry.querySelector('.score-player-name');
        const hint = entry.querySelector('.autocomplete-hint');
        if (!input || !hint) return;

        // 기존 이벤트 제거를 위해 새 input으로 교체하지 않고, 플래그로 관리
        if (input.dataset.acInit) return;
        input.dataset.acInit = 'true';

        let currentSuggestion = '';

        input.addEventListener('input', () => {
            const val = input.value;
            currentSuggestion = '';
            hint.textContent = '';

            if (!val) return;

            const match = players.find(p =>
                p.name.toLowerCase().startsWith(val.toLowerCase()) && p.name.toLowerCase() !== val.toLowerCase()
            );

            if (match) {
                currentSuggestion = match.name;
                hint.textContent = match.name;
            }
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Tab' && currentSuggestion) {
                e.preventDefault();
                input.value = currentSuggestion;
                currentSuggestion = '';
                hint.textContent = '';
            }
        });

        input.addEventListener('blur', () => {
            hint.textContent = '';
            currentSuggestion = '';
        });

        input.addEventListener('focus', () => {
            input.dispatchEvent(new Event('input'));
        });
    });
}

// 실시간 합계 계산
document.querySelectorAll('.score-input').forEach(input => {
    input.addEventListener('input', updateScoreSum);
});

function updateScoreSum() {
    const scores = Array.from(document.querySelectorAll('#scores .score-input'))
        .map(input => parseFloat(input.value) || 0);
    const sum = scores.reduce((a, b) => a + b, 0);
    const diff = sum - 100000;
    const display = document.getElementById('score-sum-display');

    display.textContent = diff.toLocaleString();

    if (diff === 0) {
        display.className = 'sum-zero';
    } else {
        display.className = 'sum-nonzero';
    }
}

// 승점 계산 함수
function calculatePoints(results) {
    // results: [{ player, team, wind, rawScore }]
    // 점수 높은 순 정렬 (동점 시 東→南→西→北 순)
    const windOrder = { '東': 0, '南': 1, '西': 2, '北': 3 };
    const sorted = [...results].sort((a, b) => {
        if (b.rawScore !== a.rawScore) return b.rawScore - a.rawScore;
        return windOrder[a.wind] - windOrder[b.wind];
    });

    const rankPoints = [45, 5, -15, -35];

    sorted.forEach((entry, idx) => {
        entry.rank = idx + 1;
        entry.rankPoints = rankPoints[idx];

        // 보너스: (원점수 - 25000) / 1000, 소수점 이하 버림
        const diff = entry.rawScore - 25000;
        entry.bonusPoints = Math.trunc(diff / 1000);

        entry.totalPoints = entry.rankPoints + entry.bonusPoints;
    });

    return sorted;
}

// 제출 버튼
document.getElementById('submit-score').addEventListener('click', async () => {
    const statusEl = document.getElementById('score-status');
    statusEl.textContent = '';
    const entries = document.querySelectorAll('#scores .score-entry');
    const results = [];
    let hasEmptyPlayer = false;
    let hasEmptyScore = false;

    // 팀 매핑 가져오기 (DB에서 또는 HTML에서)
    let playerTeamMap = {};
    try {
        const players = await getRegisteredPlayers();
        players.forEach(p => { playerTeamMap[p.name] = p.team; });
    } catch (e) {
        // DB 연결 실패 시 HTML에서 팀-선수 매핑 구축
        document.querySelectorAll('.team-block').forEach(block => {
            const teamId = block.dataset.team;
            block.querySelectorAll('.player-name').forEach(input => {
                const name = input.value.trim();
                if (name) playerTeamMap[name] = teamId;
            });
        });
    }

    entries.forEach(entry => {
        const wind = entry.dataset.wind;
        const playerName = entry.querySelector('.score-player-name').value.trim();
        const scoreVal = entry.querySelector('.score-input').value;

        if (!playerName) {
            hasEmptyPlayer = true;
            return;
        }

        if (scoreVal === '') {
            hasEmptyScore = true;
            return;
        }

        results.push({
            player: playerName,
            team: playerTeamMap[playerName] || '',
            wind,
            rawScore: parseFloat(scoreVal) || 0
        });
    });

    // 검증
    if (hasEmptyPlayer || results.length !== 4) {
        showModal('참여자를 모두 입력해주세요.');
        return;
    }

    if (hasEmptyScore) {
        showModal('점수를 모두 입력해주세요.');
        return;
    }

    const sum = results.reduce((a, b) => a + b.rawScore, 0);
    if (sum !== 100000) {
        showModal('점수 합계가 100,000이 아닙니다.\n현재 합계: ' + sum.toLocaleString());
        return;
    }

    // 중복 참가자 확인
    const names = results.map(r => r.player);
    if (new Set(names).size !== 4) {
        showModal('같은 참가자가 중복 입력되었습니다.');
        return;
    }

    // 승점 계산
    const calculated = calculatePoints(results);

    const matchData = {
        timestamp: Date.now(),
        results: calculated.map(r => ({
            player: r.player,
            team: r.team,
            wind: r.wind,
            rawScore: r.rawScore,
            rank: r.rank,
            rankPoints: r.rankPoints,
            bonusPoints: r.bonusPoints,
            totalPoints: r.totalPoints
        }))
    };

    try {
        await dbReady;

        if (editingMatchId) {
            await db.ref('tournament/matches/' + editingMatchId).set(matchData);
            editingMatchId = null;
        } else {
            const matchRef = db.ref('tournament/matches').push();
            await matchRef.set(matchData);
        }

        statusEl.textContent = '제출이 완료되었습니다.';
        statusEl.style.color = '#4caf80';

        // 입력 초기화
        document.querySelectorAll('#scores .score-player-name').forEach(input => input.value = '');
        document.querySelectorAll('#scores .score-input').forEach(input => input.value = '');
        document.querySelectorAll('#scores .autocomplete-hint').forEach(hint => hint.textContent = '');
        updateScoreSum();

    } catch (e) {
        statusEl.textContent = '저장 실패: ' + e.message;
        statusEl.style.color = '#ef5350';
    }
});

// 수정 모드: 경기 데이터를 폼에 로드
function loadMatchForEdit(matchId, matchData) {
    editingMatchId = matchId;

    // 점수 등록 탭으로 이동
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.querySelector('[data-tab="scores"]').classList.add('active');
    document.getElementById('scores').classList.add('active');

    const entries = document.querySelectorAll('#scores .score-entry');
    const winds = ['東', '南', '西', '北'];

    matchData.results.forEach(r => {
        const windIdx = winds.indexOf(r.wind);
        if (windIdx >= 0 && entries[windIdx]) {
            entries[windIdx].querySelector('.score-player-name').value = r.player;
            entries[windIdx].querySelector('.score-input').value = r.rawScore;
        }
    });

    updateScoreSum();
    loadScoreUI();

    document.getElementById('score-status').textContent = '수정 모드 - 경기 기록을 수정 후 제출해주세요.';
    document.getElementById('score-status').style.color = '#ffd700';
}
