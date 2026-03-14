// 팀/선수 등록 로직

// 자동완성 이름 목록
const PRESET_NAMES = [
    '갓필', '다막', '마수사', '백소', '2144', '묘아', '프리베른', '기메',
    '설화', '치즈는앙팡', '정당당', '차노', '하이시아', '하얀공돌이', '효단지', '리라지'
];

// 첫 글자 중복 여부 확인용 맵
const firstCharMap = {};
PRESET_NAMES.forEach(name => {
    const first = name.charAt(0);
    if (!firstCharMap[first]) firstCharMap[first] = [];
    firstCharMap[first].push(name);
});

// 자동완성 기능 설정
function setupAutocomplete(input, hint) {
    let currentSuggestion = '';

    input.addEventListener('input', () => {
        const val = input.value;
        currentSuggestion = '';
        hint.textContent = '';

        if (!val) return;

        const firstChar = val.charAt(0);
        const candidates = firstCharMap[firstChar] || [];

        // 첫 글자가 겹치는 이름이 있으면 두 번째 글자까지 필요
        if (candidates.length > 1 && val.length < 2) {
            return;
        }

        const match = PRESET_NAMES.find(name =>
            name.toLowerCase().startsWith(val.toLowerCase()) && name.toLowerCase() !== val.toLowerCase()
        );

        if (match) {
            currentSuggestion = match;
            hint.textContent = match;
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
}

// 모든 팀 등록 페이지의 자동완성 초기화
document.querySelectorAll('#teams-form .player-input-wrap').forEach(wrap => {
    const input = wrap.querySelector('input');
    const hint = wrap.querySelector('.autocomplete-hint');
    if (input && hint) setupAutocomplete(input, hint);
});

// 팀 데이터 저장
document.getElementById('save-teams').addEventListener('click', async () => {
    const statusEl = document.getElementById('teams-status');
    const teams = {};
    const teamColors = { team1: 'red', team2: 'blue', team3: 'yellow', team4: 'green' };

    document.querySelectorAll('.team-block').forEach(block => {
        const teamId = block.dataset.team;
        const name = block.querySelector('.team-name').value.trim();
        const players = Array.from(block.querySelectorAll('.player-name'))
            .map(input => input.value.trim())
            .filter(v => v !== '');
        const bonusPoints = parseInt(block.querySelector('.bonus-points').value) || 0;

        if (name) {
            teams[teamId] = { name, players, color: teamColors[teamId], bonusPoints };
        }
    });

    if (Object.keys(teams).length === 0) {
        statusEl.textContent = '팀 이름을 하나 이상 입력해주세요.';
        statusEl.style.color = '#ef5350';
        return;
    }

    try {
        await dbReady;

        // 기존 팀 데이터와 비교하여 이름 변경 감지
        const oldSnap = await db.ref('tournament/teams').once('value');
        const oldTeams = oldSnap.val();
        const nameChanges = {}; // { 옛이름: 새이름 }

        if (oldTeams) {
            for (const teamId of Object.keys(teams)) {
                const oldPlayers = (oldTeams[teamId] && oldTeams[teamId].players) || [];
                const newPlayers = teams[teamId].players || [];
                // 같은 인덱스(슬롯)에서 이름이 달라졌으면 변경으로 간주
                oldPlayers.forEach((oldName, i) => {
                    const newName = newPlayers[i];
                    if (oldName && newName && oldName !== newName) {
                        nameChanges[oldName] = newName;
                    }
                });
            }
        }

        // 팀 데이터 저장
        await db.ref('tournament/teams').set(teams);

        // 이름 변경이 있으면 대전 기록 일괄 업데이트
        if (Object.keys(nameChanges).length > 0) {
            const matchSnap = await db.ref('tournament/matches').once('value');
            const matches = matchSnap.val();

            if (matches) {
                let updated = false;
                for (const matchId of Object.keys(matches)) {
                    const match = matches[matchId];
                    if (!match.results) continue;
                    match.results.forEach(r => {
                        if (nameChanges[r.player]) {
                            r.player = nameChanges[r.player];
                            updated = true;
                        }
                    });
                }
                if (updated) {
                    await db.ref('tournament/matches').set(matches);
                }
            }

            const changedList = Object.entries(nameChanges).map(([o, n]) => `${o} → ${n}`).join(', ');
            statusEl.textContent = '저장 완료! 이름 변경 반영: ' + changedList;
        } else {
            statusEl.textContent = '저장 완료!';
        }
        statusEl.style.color = '#4caf80';
    } catch (e) {
        statusEl.textContent = '저장 실패: ' + e.message;
        statusEl.style.color = '#ef5350';
    }
});

// 팀 데이터 불러오기
async function loadTeams() {
    try {
        await dbReady;
        const snapshot = await db.ref('tournament/teams').once('value');
        const teams = snapshot.val();
        if (!teams) return null;

        document.querySelectorAll('.team-block').forEach(block => {
            const teamId = block.dataset.team;
            if (teams[teamId]) {
                block.querySelector('.team-name').value = teams[teamId].name || '';
                const playerInputs = block.querySelectorAll('.player-name');
                (teams[teamId].players || []).forEach((p, i) => {
                    if (playerInputs[i]) playerInputs[i].value = p;
                });
                block.querySelector('.bonus-points').value = teams[teamId].bonusPoints || 0;
            }
        });

        return teams;
    } catch (e) {
        console.error('팀 데이터 로드 실패:', e);
        return null;
    }
}

// 팀 데이터를 가져오는 헬퍼
async function getTeamsData() {
    await dbReady;
    const snapshot = await db.ref('tournament/teams').once('value');
    return snapshot.val();
}

// 등록된 선수 이름 목록 가져오기
async function getRegisteredPlayers() {
    const teams = await getTeamsData();
    if (!teams) return [];
    const players = [];
    for (const [teamId, team] of Object.entries(teams)) {
        (team.players || []).forEach(p => {
            players.push({ name: p, team: teamId, teamName: team.name, color: team.color });
        });
    }
    return players;
}

// 페이지 로드 시 팀 데이터 불러오기
dbReady.then(() => loadTeams());
