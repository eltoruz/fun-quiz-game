// ===== SOCKET CONNECTION =====
const socket = io();

// ===== GAME STATE =====
let currentQuestions = [];
let currentIndex = 0;
let score = 0;
let lives = 3;
let correctCount = 0;
let wrongCount = 0;
let timerInterval = null;
let timeLeft = 0;
const QUESTION_TIME = 15;
let myRoomCode = '';
let isAdmin = false;
let streak = 0;
let maxStreak = 0;
let myPlayerName = '';
let myRank = 0;

// ===== SESSION STORAGE =====
function saveSession(role, roomCode, name) {
    const session = { role, roomCode, name, timestamp: Date.now() };
    localStorage.setItem('kuis-session', JSON.stringify(session));
}

function getSession() {
    try {
        const data = localStorage.getItem('kuis-session');
        if (!data) return null;
        const session = JSON.parse(data);
        // Session expires after 2 hours
        if (Date.now() - session.timestamp > 2 * 60 * 60 * 1000) {
            clearSession();
            return null;
        }
        return session;
    } catch { return null; }
}

function clearSession() {
    localStorage.removeItem('kuis-session');
}

// ===== AUTO RECONNECT ON PAGE LOAD =====
function tryReconnect() {
    const session = getSession();
    if (!session) return;

    console.log('🔄 Attempting reconnect...', session);

    socket.emit('reconnect-room', {
        roomCode: session.roomCode,
        name: session.name,
        role: session.role
    }, (res) => {
        if (!res.success) {
            console.log('❌ Reconnect failed:', res.error);
            clearSession();
            return;
        }

        console.log('✅ Reconnected!', res);
        myRoomCode = session.roomCode;

        if (session.role === 'admin') {
            isAdmin = true;
            document.getElementById('room-code-text').textContent = session.roomCode;

            if (res.status === 'waiting') {
                // Back to lobby
                document.getElementById('player-count').textContent = res.count;
                renderPlayerList(res.players || []);
                const btn = document.getElementById('btn-start-game');
                btn.disabled = res.count === 0;
                if (res.count > 0) btn.classList.add('pulse');
                showScreen('admin-lobby-screen');
            } else if (res.status === 'playing' || res.status === 'finished') {
                // Back to live scoreboard
                if (res.players) renderLiveScoreboard(res.players);
                showScreen('admin-live-screen');
                if (res.status === 'finished') {
                    document.getElementById('live-status').textContent = '✅ SELESAI';
                    document.getElementById('live-status').classList.add('finished');
                    document.getElementById('all-finished-msg').style.display = 'block';
                    const sorted = [...res.players].sort((a, b) => b.score - a.score);
                    showPodium(sorted, 'podium');
                    document.getElementById('podium-section').style.display = 'block';
                }
            }
        } else {
            // Student reconnect
            myPlayerName = session.name;

            if (res.status === 'waiting') {
                document.getElementById('waiting-player-name').textContent = session.name;
                document.getElementById('waiting-room-code').textContent = session.roomCode;
                showScreen('waiting-screen');
            } else if (res.status === 'playing') {
                if (res.playerState && res.playerState.finished) {
                    // Already finished — show result
                    score = res.playerState.score;
                    correctCount = res.playerState.correct;
                    wrongCount = res.playerState.wrong;
                    showResultFromState();
                } else {
                    // Game in progress — restore state and continue
                    if (res.playerState) {
                        score = res.playerState.score;
                        correctCount = res.playerState.correct;
                        wrongCount = res.playerState.wrong;
                        currentIndex = res.playerState.currentQuestion || 0;
                    }
                    lives = 3 - wrongCount;
                    streak = 0;
                    maxStreak = 0;
                    currentQuestions = [...QUESTIONS];
                    // Re-shuffle with same order is not possible, just continue from current index
                    // We shuffle and start from beginning since we can't restore the exact shuffle
                    for (let i = currentQuestions.length - 1; i > 0; i--) {
                        const j = Math.floor(Math.random() * (i + 1));
                        [currentQuestions[i], currentQuestions[j]] = [currentQuestions[j], currentQuestions[i]];
                    }

                    updateStreakDisplay();
                    document.getElementById('quiz-score').textContent = score;
                    document.getElementById('quiz-lives').textContent = lives;
                    showScreen('quiz-screen');
                    loadQuestion();
                }
            } else if (res.status === 'finished') {
                if (res.playerState) {
                    score = res.playerState.score;
                    correctCount = res.playerState.correct;
                    wrongCount = res.playerState.wrong;
                }
                showResultFromState();
            }
        }
    });
}

function showResultFromState() {
    const total = QUESTIONS.length;
    const pct = total > 0 ? (correctCount / total) : 0;
    let stars = 0, emoji = '', title = '';
    if (pct >= 0.9) { stars = 3; emoji = '🏆'; title = 'Luar Biasa!'; }
    else if (pct >= 0.7) { stars = 2; emoji = '🌟'; title = 'Hebat Sekali!'; }
    else if (pct >= 0.5) { stars = 1; emoji = '👍'; title = 'Bagus!'; }
    else { stars = 0; emoji = '💪'; title = 'Ayo Coba Lagi!'; }

    document.getElementById('result-emoji').textContent = emoji;
    document.getElementById('result-title').textContent = title;
    document.getElementById('result-stars').textContent = '⭐'.repeat(stars) + '☆'.repeat(3 - stars);
    document.getElementById('result-correct').textContent = correctCount;
    document.getElementById('result-wrong').textContent = wrongCount;
    document.getElementById('result-score-final').textContent = score;
    showScreen('result-screen');
}

// Attempt reconnect when page loads
socket.on('connect', () => {
    tryReconnect();
});

// ===== SCREEN MANAGEMENT =====
function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
}

function goBack(screen) {
    clearSession();
    showScreen(screen + '-screen');
}

// ===== ADMIN FLOW =====
function createRoom() {
    const pin = document.getElementById('admin-pin').value.trim();
    const errorEl = document.getElementById('admin-pin-error');
    if (!pin) {
        errorEl.textContent = 'Masukkan PIN dulu! 🔐';
        return;
    }
    errorEl.textContent = '';

    socket.emit('create-room', pin, (res) => {
        if (res.success) {
            isAdmin = true;
            myRoomCode = res.roomCode;
            saveSession('admin', res.roomCode, '');
            document.getElementById('room-code-text').textContent = res.roomCode;
            showScreen('admin-lobby-screen');
        } else {
            errorEl.textContent = res.error;
            shakeElement(document.getElementById('admin-pin'));
        }
    });
}

function adminStartGame() {
    socket.emit('start-game', (res) => {
        if (res.success) {
            showScreen('admin-live-screen');
        } else {
            alert(res.error);
        }
    });
}

// Admin receives player join
socket.on('player-joined', ({ players, count }) => {
    document.getElementById('player-count').textContent = count;
    renderPlayerList(players);
    const btn = document.getElementById('btn-start-game');
    btn.disabled = count === 0;
    if (count > 0) btn.classList.add('pulse');
});

// Admin receives player leave
socket.on('player-left', ({ name, players, count }) => {
    document.getElementById('player-count').textContent = count;
    renderPlayerList(players);
    const btn = document.getElementById('btn-start-game');
    btn.disabled = count === 0;
});

// Admin receives score updates
socket.on('score-update', ({ players }) => {
    renderLiveScoreboard(players);
});

// All players finished — show podium for admin
socket.on('all-finished', ({ players }) => {
    document.getElementById('live-status').textContent = '✅ SELESAI';
    document.getElementById('live-status').classList.add('finished');
    document.getElementById('all-finished-msg').style.display = 'block';
    renderLiveScoreboard(players);

    const sorted = [...players].sort((a, b) => b.score - a.score);
    showPodium(sorted, 'podium');
    document.getElementById('podium-section').style.display = 'block';
    launchConfetti();
});

// Student receives podium data when all finish
socket.on('show-podium', ({ players }) => {
    const sorted = [...players].sort((a, b) => b.score - a.score);
    showPodium(sorted, 'student-podium');
    showScreen('podium-screen');
    launchConfetti();
});

function showPodium(sorted, prefix) {
    for (let i = 0; i < 3; i++) {
        const slot = document.getElementById(`${prefix}-${i + 1}`);
        if (!slot) continue;
        if (sorted[i]) {
            slot.querySelector('.podium-name').textContent = sorted[i].name;
            slot.querySelector('.podium-pts').textContent = sorted[i].score + ' pts';
        } else {
            slot.querySelector('.podium-name').textContent = '-';
            slot.querySelector('.podium-pts').textContent = '';
        }
    }
}

function renderPlayerList(players) {
    const list = document.getElementById('player-list');
    if (players.length === 0) {
        list.innerHTML = '<div class="no-players">Menunggu siswa bergabung...</div>';
        return;
    }
    list.innerHTML = players.map((p, i) => `
        <div class="player-item" style="--i:${i}">
            <span class="player-avatar">${getAvatar(i)}</span>
            <span class="player-name-tag">${escapeHtml(p.name)}</span>
            <span class="player-ready">✅</span>
        </div>
    `).join('');
}

function renderLiveScoreboard(players) {
    const sorted = [...players].sort((a, b) => b.score - a.score);
    const board = document.getElementById('live-scoreboard');
    board.innerHTML = sorted.map((p, i) => {
        const rankIcon = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`;
        const rankClass = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '';
        const statusIcon = p.finished ? '✅' : '✏️';
        const progress = p.currentQuestion !== undefined ? `Soal ${p.currentQuestion}/${QUESTIONS.length}` : '';
        return `<div class="live-entry ${p.finished ? 'entry-finished' : ''}" style="--i:${i}">
            <div class="live-rank ${rankClass}">${rankIcon}</div>
            <div class="live-details">
                <div class="live-name">${escapeHtml(p.name)} ${statusIcon}</div>
                <div class="live-meta">✅ ${p.correct} benar · ❌ ${p.wrong} salah ${!p.finished ? '· ' + progress : ''}</div>
            </div>
            <div class="live-score">${p.score}</div>
        </div>`;
    }).join('');
}

function getAvatar(index) {
    const avatars = ['🐶', '🐱', '🐰', '🦊', '🐼', '🐨', '🐯', '🦁', '🐸', '🐵', '🐧', '🦄', '🐳', '🦋', '🐢', '🐙', '🦜', '🐝', '🐞', '🦀'];
    return avatars[index % avatars.length];
}

// ===== STUDENT FLOW =====
function joinRoom() {
    const codeInput = document.getElementById('room-code-input');
    const nameInput = document.getElementById('player-name');
    const errorEl = document.getElementById('join-error');
    const roomCode = codeInput.value.trim();
    const name = nameInput.value.trim();

    if (!roomCode || roomCode.length !== 6) {
        errorEl.textContent = 'Masukkan kode room 6 digit!';
        shakeElement(codeInput);
        return;
    }
    if (!name) {
        errorEl.textContent = 'Tulis namamu dulu ya! 😊';
        shakeElement(nameInput);
        return;
    }
    errorEl.textContent = '';

    socket.emit('join-room', { roomCode, name }, (res) => {
        if (res.success) {
            myRoomCode = roomCode;
            myPlayerName = name;
            saveSession('student', roomCode, name);
            document.getElementById('waiting-player-name').textContent = name;
            document.getElementById('waiting-room-code').textContent = roomCode;
            showScreen('waiting-screen');
        } else {
            errorEl.textContent = res.error;
            shakeElement(codeInput);
        }
    });
}

// Student receives game start
socket.on('game-started', () => {
    showCountdown(() => {
        startGame();
    });
});

// Student receives room closed
socket.on('room-closed', () => {
    clearSession();
    alert('Room ditutup oleh guru! 😢');
    showScreen('landing-screen');
});

// Student receives leaderboard update
socket.on('leaderboard-update', ({ players }) => {
    showMiniLeaderboard(players);
});

// ===== COUNTDOWN =====
function showCountdown(callback) {
    const overlay = document.getElementById('countdown-overlay');
    const display = document.getElementById('countdown-display');
    overlay.style.display = 'flex';

    let count = 3;
    display.className = 'countdown-number';
    display.textContent = count;

    const interval = setInterval(() => {
        count--;
        if (count > 0) {
            display.className = 'countdown-number';
            display.textContent = count;
            display.style.animation = 'none';
            display.offsetHeight;
            display.style.animation = '';
        } else if (count === 0) {
            display.className = 'countdown-go';
            display.textContent = 'GO!';
            display.style.animation = 'none';
            display.offsetHeight;
            display.style.animation = '';
        } else {
            clearInterval(interval);
            overlay.style.display = 'none';
            callback();
        }
    }, 900);
}

// ===== MINI LEADERBOARD =====
function showMiniLeaderboard(players) {
    const overlay = document.getElementById('mini-leaderboard-overlay');
    const list = document.getElementById('mini-lb-list');

    const sorted = [...players].sort((a, b) => b.score - a.score);
    const myIdx = sorted.findIndex(p => p.name.toLowerCase() === myPlayerName.toLowerCase());
    myRank = myIdx + 1;

    const toShow = sorted.slice(0, 5);
    if (myIdx >= 5) toShow.push(sorted[myIdx]);

    list.innerHTML = toShow.map((p, i) => {
        const actualRank = sorted.indexOf(p);
        const rankIcon = actualRank === 0 ? '🥇' : actualRank === 1 ? '🥈' : actualRank === 2 ? '🥉' : `${actualRank + 1}`;
        const rankClass = actualRank === 0 ? 'gold' : actualRank === 1 ? 'silver' : actualRank === 2 ? 'bronze' : '';
        const isMe = p.name.toLowerCase() === myPlayerName.toLowerCase();
        return `<div class="mini-lb-entry ${isMe ? 'me' : ''}" style="--i:${i}">
            <div class="mini-lb-rank ${rankClass}">${rankIcon}</div>
            <div class="mini-lb-name">${escapeHtml(p.name)} ${isMe ? '(Kamu)' : ''}</div>
            <div class="mini-lb-score">${p.score}</div>
        </div>`;
    }).join('');

    overlay.classList.remove('hidden');
    setTimeout(() => overlay.classList.add('hidden'), 2500);
}

// ===== QUIZ LOGIC =====
function startGame() {
    currentQuestions = [...QUESTIONS];
    for (let i = currentQuestions.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [currentQuestions[i], currentQuestions[j]] = [currentQuestions[j], currentQuestions[i]];
    }
    currentIndex = 0;
    score = 0;
    lives = 3;
    correctCount = 0;
    wrongCount = 0;
    streak = 0;
    maxStreak = 0;

    updateStreakDisplay();
    document.getElementById('quiz-score').textContent = '0';
    document.getElementById('quiz-lives').textContent = '3';
    showScreen('quiz-screen');
    loadQuestion();
}

function loadQuestion() {
    if (currentIndex >= currentQuestions.length || lives <= 0) {
        endQuiz();
        return;
    }
    const q = currentQuestions[currentIndex];
    document.getElementById('quiz-question-num').textContent = `Soal ${currentIndex + 1}/${currentQuestions.length}`;
    document.getElementById('progress-bar').style.width = `${((currentIndex) / currentQuestions.length) * 100}%`;
    document.getElementById('question-text').textContent = q.q;

    const container = document.getElementById('answers-container');
    container.innerHTML = '';
    const icons = ['▲', '◆', '●', '■'];
    q.a.forEach((ans, i) => {
        const btn = document.createElement('button');
        btn.className = 'answer-btn';
        btn.innerHTML = `<span class="answer-icon">${icons[i]}</span>${ans}`;
        btn.onclick = () => selectAnswer(i);
        container.appendChild(btn);
    });

    const card = document.getElementById('quiz-card');
    card.classList.remove('slide-in');
    void card.offsetWidth;
    card.classList.add('slide-in');
    startTimer();
}

function startTimer() {
    clearInterval(timerInterval);
    timeLeft = QUESTION_TIME * 10;
    const bar = document.getElementById('timer-bar');
    bar.style.width = '100%';
    bar.className = 'timer-bar';

    timerInterval = setInterval(() => {
        timeLeft--;
        const pct = (timeLeft / (QUESTION_TIME * 10)) * 100;
        bar.style.width = pct + '%';
        if (pct < 30) bar.className = 'timer-bar danger';
        else if (pct < 60) bar.className = 'timer-bar warning';
        if (timeLeft <= 0) { clearInterval(timerInterval); selectAnswer(-1); }
    }, 100);
}

function getSpeedBonus(timeLeft) {
    const secondsLeft = timeLeft / 10;
    const pct = secondsLeft / QUESTION_TIME;

    if (pct >= 0.8) return { bonus: 20, label: '⚡ SUPER CEPAT! +20' };
    if (pct >= 0.6) return { bonus: 15, label: '🚀 Cepat! +15' };
    if (pct >= 0.4) return { bonus: 10, label: '👍 Lumayan! +10' };
    if (pct >= 0.2) return { bonus: 5, label: '⏱️ +5' };
    return { bonus: 2, label: '+2' };
}

function selectAnswer(index) {
    clearInterval(timerInterval);
    const q = currentQuestions[currentIndex];
    const btns = document.querySelectorAll('.answer-btn');
    btns.forEach(b => b.classList.add('disabled'));

    const isCorrect = index === q.correct;
    const isTimeout = index === -1;

    if (isCorrect) {
        btns[index].classList.add('correct');
        streak++;
        if (streak > maxStreak) maxStreak = streak;

        const speed = getSpeedBonus(timeLeft);
        const streakBonus = Math.floor(streak / 3) * 5;
        const totalPoints = 10 + speed.bonus + streakBonus;
        score += totalPoints;
        correctCount++;
        document.getElementById('quiz-score').textContent = score;
        updateStreakDisplay();
        showFeedback(true, null, false, streakBonus, speed);
    } else {
        if (index >= 0) btns[index].classList.add('wrong');
        btns[q.correct].classList.add('correct');
        streak = 0;
        lives--;
        wrongCount++;
        document.getElementById('quiz-lives').textContent = lives;
        updateStreakDisplay();
        if (isTimeout) {
            showFeedback(false, null, true);
        } else {
            showFeedback(false, q.a[q.correct]);
        }
    }

    socket.emit('answer-result', {
        correct: isCorrect,
        score: score,
        questionIndex: currentIndex,
        totalQuestions: currentQuestions.length
    });

    currentIndex++;

    if (currentIndex % 3 === 0 && currentIndex < currentQuestions.length && lives > 0) {
        socket.emit('request-leaderboard');
        setTimeout(loadQuestion, 4500);
    } else {
        setTimeout(loadQuestion, 1800);
    }
}

function updateStreakDisplay() {
    const badge = document.getElementById('streak-badge');
    const countEl = document.getElementById('streak-count');
    countEl.textContent = streak;
    if (streak >= 2) {
        badge.classList.add('visible');
    } else {
        badge.classList.remove('visible');
    }
}

function showFeedback(correct, correctAns, isTimeout, streakBonus = 0, speed = null) {
    const overlay = document.getElementById('feedback-overlay');
    const content = document.getElementById('feedback-content');
    let messages;
    if (correct) {
        messages = [
            { emoji: '🎉', text: 'Hebat!', sub: 'Jawabanmu benar!' },
            { emoji: '⭐', text: 'Keren!', sub: 'Lanjutkan!' },
            { emoji: '🚀', text: 'Mantap!', sub: 'Kamu pintar!' },
            { emoji: '💪', text: 'Wow!', sub: 'Terus semangat!' },
        ];
    } else if (isTimeout) {
        messages = [
            { emoji: '⏰', text: 'Waktu Habis!', sub: 'Yuk lebih cepat lagi!' },
            { emoji: '⌛', text: 'Waktu Habis!', sub: 'Ayo semangat!' },
            { emoji: '🕐', text: 'Terlalu Lama!', sub: 'Coba lebih cepat ya!' },
        ];
    } else {
        messages = [
            { emoji: '😅', text: 'Oops!', sub: `Jawaban benar: ${correctAns}` },
            { emoji: '💪', text: 'Semangat!', sub: `Jawaban benar: ${correctAns}` },
            { emoji: '🤔', text: 'Hampir!', sub: `Jawaban benar: ${correctAns}` },
        ];
    }
    const msg = messages[Math.floor(Math.random() * messages.length)];

    let extraHtml = '';
    if (correct && speed) {
        extraHtml += `<div class="speed-bonus">${speed.label}</div>`;
    }
    if (correct && streak >= 2) {
        extraHtml += `<div class="streak-msg">🔥 Streak x${streak}! ${streakBonus > 0 ? '+' + streakBonus + ' bonus' : ''}</div>`;
    }

    content.innerHTML = `
        <div class="emoji">${msg.emoji}</div>
        <h3 style="color:${correct ? 'var(--accent-green)' : 'var(--accent-red)'}">${msg.text}</h3>
        <p>${msg.sub}</p>
        ${extraHtml}`;
    overlay.classList.remove('hidden');
    setTimeout(() => overlay.classList.add('hidden'), 1500);
}

function endQuiz() {
    clearInterval(timerInterval);
    const pct = currentQuestions.length > 0 ? (correctCount / currentQuestions.length) : 0;
    let stars = 0, emoji = '', title = '';
    if (pct >= 0.9) { stars = 3; emoji = '🏆'; title = 'Luar Biasa!'; }
    else if (pct >= 0.7) { stars = 2; emoji = '🌟'; title = 'Hebat Sekali!'; }
    else if (pct >= 0.5) { stars = 1; emoji = '👍'; title = 'Bagus!'; }
    else { stars = 0; emoji = '💪'; title = 'Ayo Coba Lagi!'; }

    document.getElementById('result-emoji').textContent = emoji;
    document.getElementById('result-title').textContent = title;
    document.getElementById('result-stars').textContent = '⭐'.repeat(stars) + '☆'.repeat(3 - stars);
    document.getElementById('result-correct').textContent = correctCount;
    document.getElementById('result-wrong').textContent = wrongCount;
    document.getElementById('result-score-final').textContent = score;

    if (myRank > 0) {
        document.getElementById('result-ranking').style.display = 'block';
        document.getElementById('result-rank-num').textContent = `#${myRank}`;
    }

    showScreen('result-screen');
    if (pct >= 0.5) launchConfetti();

    socket.emit('quiz-finished', {
        score,
        correct: correctCount,
        wrong: wrongCount,
        total: currentQuestions.length,
        stars
    });
}

// ===== UTILITIES =====
function launchConfetti() {
    const container = document.getElementById('confetti-container');
    const colors = ['#a855f7', '#ec4899', '#3b82f6', '#22c55e', '#eab308', '#f97316', '#ef4444'];
    for (let i = 0; i < 80; i++) {
        const piece = document.createElement('div');
        piece.className = 'confetti-piece';
        piece.style.left = Math.random() * 100 + '%';
        piece.style.background = colors[Math.floor(Math.random() * colors.length)];
        piece.style.setProperty('--duration', (2 + Math.random() * 2) + 's');
        piece.style.setProperty('--delay', Math.random() * 0.5 + 's');
        piece.style.width = (6 + Math.random() * 10) + 'px';
        piece.style.height = (6 + Math.random() * 10) + 'px';
        container.appendChild(piece);
        setTimeout(() => piece.remove(), 4500);
    }
}

function escapeHtml(str) { const d = document.createElement('div'); d.textContent = str; return d.innerHTML; }

function shakeElement(el) {
    el.classList.add('shake-input');
    setTimeout(() => el.classList.remove('shake-input'), 600);
}

// Enter key handlers
document.getElementById('admin-pin').addEventListener('keypress', (e) => { if (e.key === 'Enter') createRoom(); });
document.getElementById('room-code-input').addEventListener('keypress', (e) => { if (e.key === 'Enter') document.getElementById('player-name').focus(); });
document.getElementById('player-name').addEventListener('keypress', (e) => { if (e.key === 'Enter') joinRoom(); });
