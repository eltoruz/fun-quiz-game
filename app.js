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
const API_URL = window.location.origin;

// ===== SCREEN MANAGEMENT =====
function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
}

function goBack(screen) { showScreen(screen + '-screen'); }

function startGame() {
    const name = document.getElementById('player-name').value.trim();
    if (!name) {
        const input = document.getElementById('player-name');
        input.style.borderColor = '#e17055';
        input.placeholder = 'Tulis namamu dulu ya! 😊';
        input.classList.add('shake-input');
        setTimeout(() => { input.classList.remove('shake-input'); input.style.borderColor = ''; }, 600);
        return;
    }
    // Shuffle questions
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
    q.a.forEach((ans, i) => {
        const btn = document.createElement('button');
        btn.className = 'answer-btn';
        btn.textContent = ans;
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

function selectAnswer(index) {
    clearInterval(timerInterval);
    const q = currentQuestions[currentIndex];
    const btns = document.querySelectorAll('.answer-btn');
    btns.forEach(b => b.classList.add('disabled'));

    const isCorrect = index === q.correct;
    if (isCorrect) {
        btns[index].classList.add('correct');
        const bonus = Math.ceil(timeLeft / 10);
        score += 10 + bonus;
        correctCount++;
        document.getElementById('quiz-score').textContent = score;
        showFeedback(true);
    } else {
        if (index >= 0) btns[index].classList.add('wrong');
        btns[q.correct].classList.add('correct');
        lives--;
        wrongCount++;
        document.getElementById('quiz-lives').textContent = lives;
        showFeedback(false, q.a[q.correct]);
    }
    currentIndex++;
    setTimeout(loadQuestion, 1800);
}

function showFeedback(correct, correctAns) {
    const overlay = document.getElementById('feedback-overlay');
    const content = document.getElementById('feedback-content');
    const messages = correct
        ? [
            { emoji: '🎉', text: 'Hebat!', sub: 'Jawabanmu benar!' },
            { emoji: '⭐', text: 'Keren!', sub: 'Lanjutkan!' },
            { emoji: '🚀', text: 'Mantap!', sub: 'Kamu pintar!' },
            { emoji: '💪', text: 'Wow!', sub: 'Terus semangat!' },
        ]
        : [
            { emoji: '😅', text: 'Oops!', sub: `Jawaban benar: ${correctAns}` },
            { emoji: '💪', text: 'Semangat!', sub: `Jawaban benar: ${correctAns}` },
            { emoji: '🤔', text: 'Hampir!', sub: `Jawaban benar: ${correctAns}` },
        ];
    const msg = messages[Math.floor(Math.random() * messages.length)];
    content.innerHTML = `
        <div class="emoji">${msg.emoji}</div>
        <h3 style="color:${correct ? 'var(--green)' : 'var(--red)'}">${msg.text}</h3>
        <p>${msg.sub}</p>`;
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
    showScreen('result-screen');
    if (pct >= 0.5) launchConfetti();

    const name = document.getElementById('player-name').value.trim();
    saveScore({ name, score, correct: correctCount, total: currentQuestions.length, stars, date: new Date().toISOString() });
}

// ===== SCOREBOARD (API) =====
async function saveScore(entry) {
    try {
        await fetch(API_URL + '/api/scores', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(entry) });
    } catch (e) {
        const scores = JSON.parse(localStorage.getItem('quizScores') || '[]');
        scores.push(entry);
        localStorage.setItem('quizScores', JSON.stringify(scores));
    }
}

async function getScores() {
    try {
        const res = await fetch(API_URL + '/api/scores');
        if (!res.ok) throw new Error('err');
        return await res.json();
    } catch (e) {
        return JSON.parse(localStorage.getItem('quizScores') || '[]');
    }
}

async function showScoreboard() {
    showScreen('scoreboard-screen');
    await renderScoreboard();
}

async function renderScoreboard() {
    let scores = await getScores();
    scores.sort((a, b) => b.score - a.score);
    const list = document.getElementById('scoreboard-list');
    if (scores.length === 0) {
        list.innerHTML = '<div class="no-scores">Belum ada skor 😊<br>Ayo mulai bermain!</div>';
        return;
    }
    list.innerHTML = scores.slice(0, 20).map((s, i) => {
        const rankClass = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '';
        const rankIcon = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`;
        const dateStr = s.date ? new Date(s.date).toLocaleDateString('id-ID') : '';
        return `<div class="score-entry" style="--i:${i}">
            <div class="score-rank ${rankClass}">${rankIcon}</div>
            <div class="score-details">
                <div class="score-name">${escapeHtml(s.name)}</div>
                <div class="score-meta">${'⭐'.repeat(s.stars || 0)} • ${s.correct}/${s.total} benar • ${dateStr}</div>
            </div>
            <div class="score-value">${s.score}</div>
        </div>`;
    }).join('');
}

async function clearScoreboard() {
    if (!confirm('Hapus semua skor? 🤔')) return;
    try { await fetch(API_URL + '/api/scores', { method: 'DELETE' }); } catch (e) { localStorage.removeItem('quizScores'); }
    renderScoreboard();
}

function launchConfetti() {
    const container = document.getElementById('confetti-container');
    const colors = ['#FF6B6B', '#fdcb6e', '#55efc4', '#74b9ff', '#a29bfe', '#fd79a8', '#e17055'];
    for (let i = 0; i < 60; i++) {
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

document.getElementById('player-name').addEventListener('keypress', (e) => { if (e.key === 'Enter') startGame(); });
