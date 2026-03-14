// 순위 계산 및 표시 로직

const TEAM_COLOR_CLASS = {
    red: 'row-red',
    blue: 'row-blue',
    yellow: 'row-yellow',
    green: 'row-green'
};

const TEAM_BG_CLASS = {
    red: 'bg-red',
    blue: 'bg-blue',
    yellow: 'bg-yellow',
    green: 'bg-green'
};

async function loadRankings() {
    try {
        await dbReady;
        const [teamsSnap, matchesSnap] = await Promise.all([
            db.ref('tournament/teams').once('value'),
            db.ref('tournament/matches').once('value')
        ]);

        const teams = teamsSnap.val();
        const matches = matchesSnap.val();

        if (!teams) return;

        // 개인별 통계 초기화
        const playerStats = {};
        for (const [teamId, team] of Object.entries(teams)) {
            (team.players || []).forEach(player => {
                playerStats[player] = {
                    name: player,
                    teamId,
                    teamName: team.name,
                    color: team.color,
                    totalPoints: 0,
                    ranks: { 1: 0, 2: 0, 3: 0, 4: 0 },
                    games: 0
                };
            });
        }

        // 매치 데이터 집계
        if (matches) {
            for (const match of Object.values(matches)) {
                for (const result of match.results) {
                    const key = result.player;
                    if (!playerStats[key]) {
                        // 등록 안 된 선수
                        const teamName = teams[result.team] ? teams[result.team].name : result.team;
                        const color = teams[result.team] ? teams[result.team].color : '';
                        playerStats[key] = {
                            name: result.player,
                            teamId: result.team,
                            teamName,
                            color,
                            totalPoints: 0,
                            ranks: { 1: 0, 2: 0, 3: 0, 4: 0 },
                            games: 0
                        };
                    }

                    playerStats[key].totalPoints += result.totalPoints;
                    playerStats[key].games += 1;
                    if (result.rank >= 1 && result.rank <= 4) {
                        playerStats[key].ranks[result.rank] += 1;
                    }
                }
            }
        }

        // === 팀 순위 ===
        const teamAgg = {};
        for (const [teamId, team] of Object.entries(teams)) {
            teamAgg[teamId] = {
                name: team.name,
                color: team.color,
                totalPoints: team.bonusPoints || 0,
                ranks: { 1: 0, 2: 0, 3: 0, 4: 0 },
                mvp: '-',
                mvpPoints: -Infinity
            };
        }

        for (const ps of Object.values(playerStats)) {
            if (!teamAgg[ps.teamId]) continue;
            teamAgg[ps.teamId].totalPoints += ps.totalPoints;
            for (let r = 1; r <= 4; r++) {
                teamAgg[ps.teamId].ranks[r] += ps.ranks[r];
            }
            if (ps.totalPoints > teamAgg[ps.teamId].mvpPoints && ps.games > 0) {
                teamAgg[ps.teamId].mvpPoints = ps.totalPoints;
                teamAgg[ps.teamId].mvp = ps.name;
            }
        }

        const sortedTeams = Object.values(teamAgg).sort((a, b) => b.totalPoints - a.totalPoints);
        const teamBody = document.querySelector('#team-ranking-table tbody');
        teamBody.innerHTML = sortedTeams.map((team, i) => {
            const scoreClass = team.totalPoints >= 0 ? 'score-positive' : 'score-negative';
            const rowClass = TEAM_COLOR_CLASS[team.color] || '';
            const bgClass = TEAM_BG_CLASS[team.color] || '';
            return `<tr class="${rowClass}">
                <td>${i + 1}</td>
                <td class="${bgClass}">${team.name}</td>
                <td class="${scoreClass}">${team.totalPoints}</td>
                <td>${team.ranks[1]}</td>
                <td>${team.ranks[2]}</td>
                <td>${team.ranks[3]}</td>
                <td>${team.ranks[4]}</td>
                <td>${team.mvp}</td>
            </tr>`;
        }).join('');

        // === 개인 순위 ===
        const sortedPlayers = Object.values(playerStats)
            .filter(p => p.games > 0)
            .sort((a, b) => b.totalPoints - a.totalPoints);

        const playerBody = document.querySelector('#player-ranking-table tbody');
        if (sortedPlayers.length === 0) {
            playerBody.innerHTML = '<tr><td colspan="8" style="color:#888">매치 기록 없음</td></tr>';
        } else {
            playerBody.innerHTML = sortedPlayers.map((player, i) => {
                const scoreClass = player.totalPoints >= 0 ? 'score-positive' : 'score-negative';
                const totalGames = player.games;
                const topCount = player.ranks[1] + player.ranks[2];
                const winRate = totalGames > 0 ? ((topCount / totalGames) * 100).toFixed(2) : '0.00';

                const playerBg = TEAM_BG_CLASS[player.color] || '';
                return `<tr>
                    <td>${i + 1}</td>
                    <td class="${playerBg}">${player.name}</td>
                    <td class="${scoreClass}">${player.totalPoints}</td>
                    <td>${player.ranks[1]}</td>
                    <td>${player.ranks[2]}</td>
                    <td>${player.ranks[3]}</td>
                    <td>${player.ranks[4]}</td>
                    <td>${winRate}%</td>
                </tr>`;
            }).join('');
        }
    } catch (e) {
        console.error('순위 로드 실패:', e);
    }
}
