const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const SCORES_FILE = path.join(__dirname, 'scores.json');

// Middleware
app.use(express.json());
app.use(express.static(__dirname)); // serve frontend files

// Ensure scores file exists
if (!fs.existsSync(SCORES_FILE)) {
    fs.writeFileSync(SCORES_FILE, '[]');
}

// GET all scores
app.get('/api/scores', (req, res) => {
    try {
        const data = fs.readFileSync(SCORES_FILE, 'utf8');
        res.json(JSON.parse(data));
    } catch (e) {
        res.json([]);
    }
});

// POST new score
app.post('/api/scores', (req, res) => {
    try {
        const { name, score, category, correct, total, stars, date } = req.body;
        if (!name || score === undefined) {
            return res.status(400).json({ error: 'Missing fields' });
        }
        const scores = JSON.parse(fs.readFileSync(SCORES_FILE, 'utf8'));
        scores.push({ name, score, category: category || 'umum', correct, total, stars, date });
        fs.writeFileSync(SCORES_FILE, JSON.stringify(scores, null, 2));
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: 'Server error' });
    }
});

// DELETE all scores
app.delete('/api/scores', (req, res) => {
    fs.writeFileSync(SCORES_FILE, '[]');
    res.json({ success: true });
});

app.listen(PORT, () => {
    console.log(`🌟 Kuis Pintar server running at http://localhost:${PORT}`);
});
