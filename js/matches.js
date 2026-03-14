// 대전 기록 표시 로직

async function loadMatchHistory() {
    const container = document.getElementById('match-history');
    const teams = await getTeamsData();

    // 선수→팀 색상 매핑
    const playerColorMap = {};
    if (teams) {
        for (const [teamId, team] of Object.entries(teams)) {
            const bgClass = { red: 'bg-red', blue: 'bg-blue', yellow: 'bg-yellow', green: 'bg-green' }[team.color] || '';
            (team.players || []).forEach(p => { playerColorMap[p] = bgClass; });
        }
    }

    try {
        await dbReady;
        const snapshot = await db.ref('tournament/matches').once('value');
        const matches = snapshot.val();

        if (!matches) {
            container.innerHTML = '<p class="no-records">기록 없음</p>';
            return;
        }

        // 최신순 정렬
        const entries = Object.entries(matches).sort((a, b) => b[1].timestamp - a[1].timestamp);

        container.innerHTML = entries.map(([key, match], idx) => {
            // 점수 높은 순으로 정렬
            const sortedResults = [...match.results].sort((a, b) => b.rawScore - a.rawScore);

            const cardsHTML = sortedResults.map(r => {
                const scoreClass = r.rawScore >= 25000 ? 'score-positive' : 'score-negative';
                const pointsClass = r.totalPoints >= 0 ? 'score-positive' : 'score-negative';
                const cardBg = playerColorMap[r.player] || '';
                return `
                    <div class="match-player-card ${cardBg}">
                        <div class="player-name-text">${r.player} (${r.wind})</div>
                        <div class="player-score-text ${scoreClass}">${r.rawScore.toLocaleString()}</div>
                        <div class="player-points-text ${pointsClass}">${r.totalPoints >= 0 ? '+' : ''}${r.totalPoints}pt</div>
                    </div>
                `;
            }).join('');

            const matchNum = entries.length - idx;

            return `
                <div class="match-record">
                    <div class="match-record-header">
                        <span>제 ${matchNum}국</span>
                        <div class="btn-group">
                            <button class="btn-edit" onclick="editMatch('${key}')">수정</button>
                            <button class="btn-danger" onclick="deleteMatch('${key}')">삭제</button>
                        </div>
                    </div>
                    <div class="match-record-results">${cardsHTML}</div>
                </div>
            `;
        }).join('');
    } catch (e) {
        container.innerHTML = '<p style="color:#ef5350;">로드 실패</p>';
        console.error('대전 기록 로드 실패:', e);
    }
}

// 매치 수정
async function editMatch(matchId) {
    try {
        await dbReady;
        const snapshot = await db.ref('tournament/matches/' + matchId).once('value');
        const matchData = snapshot.val();
        if (matchData) {
            loadMatchForEdit(matchId, matchData);
        }
    } catch (e) {
        alert('데이터 로드 실패: ' + e.message);
    }
}

// 매치 삭제
async function deleteMatch(matchId) {
    if (!confirm('이 경기 기록을 삭제하시겠습니까?')) return;

    try {
        await dbReady;
        await db.ref('tournament/matches/' + matchId).remove();
        loadMatchHistory();
    } catch (e) {
        alert('삭제 실패: ' + e.message);
    }
}
