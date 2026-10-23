// Tetris gate: the visitor plays against a heuristic bot and must clear
// one line before it does to enter the site. No dependencies.
(() => {
    'use strict';

    const COLS = 10;
    const ROWS = 18;
    const GRAVITY_MS = 650;
    // Time from one bot placement to the next (thinking plus the visible drop).
    // The heuristic needs a median of 6 pieces for its first clear on an empty
    // board, so 10000ms puts that clear around 60 seconds in.
    const BOT_MOVE_INTERVAL = 10000;
    // Time per row while a bot piece falls into place.
    const BOT_DROP_STEP = 30;
    // How long a cleared row flashes before the result overlay appears.
    const FLASH_MS = 450;
    const STORAGE_KEY = 'ah-gate-entered';
    const TYPES = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];

    const SHAPES = {
        I: [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]],
        O: [[1, 1], [1, 1]],
        T: [[0, 1, 0], [1, 1, 1], [0, 0, 0]],
        S: [[0, 1, 1], [1, 1, 0], [0, 0, 0]],
        Z: [[1, 1, 0], [0, 1, 1], [0, 0, 0]],
        J: [[1, 0, 0], [1, 1, 1], [0, 0, 0]],
        L: [[0, 0, 1], [1, 1, 1], [0, 0, 0]],
    };

    const rotateCW = (m) => m[0].map((_, c) => m.map((row) => row[c]).reverse());

    const ROTATIONS = {};
    TYPES.forEach((type) => {
        const list = [SHAPES[type]];
        for (let i = 1; i < 4; i++) list.push(rotateCW(list[i - 1]));
        ROTATIONS[type] = list;
    });

    const emptyRow = () => new Array(COLS).fill(null);
    const emptyBoard = () => Array.from({ length: ROWS }, emptyRow);
    const copyBoard = (board) => board.map((row) => row.slice());

    const pick = (list) => list[Math.floor(Math.random() * list.length)];

    function shuffle(list) {
        for (let i = list.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [list[i], list[j]] = [list[j], list[i]];
        }
        return list;
    }

    // Shuffled bag of all seven pieces, refilled when empty.
    function createBag() {
        let bag = [];
        return () => {
            if (!bag.length) bag = shuffle(TYPES.slice());
            return bag.pop();
        };
    }

    // Opening queue for the player: 3 or 4 pieces whose spawn-orientation
    // bottom rows add up to exactly 10 cells, so they tile the bottom row
    // using only left/right moves and drops.
    const OPENING_WIDTHS = [[4, 4, 2], [4, 3, 3], [3, 3, 2, 2], [4, 2, 2, 2]];
    const PIECES_BY_WIDTH = { 4: ['I'], 3: ['T', 'L', 'J'], 2: ['O'] };
    const BOTTOM_WIDTH = { I: 4, O: 2, T: 3, L: 3, J: 3 };

    function createOpening() {
        return shuffle(pick(OPENING_WIDTHS).map((w) => pick(PIECES_BY_WIDTH[w])));
    }

    function collides(board, matrix, x, y) {
        for (let r = 0; r < matrix.length; r++) {
            for (let c = 0; c < matrix[r].length; c++) {
                if (!matrix[r][c]) continue;
                const bx = x + c;
                const by = y + r;
                if (bx < 0 || bx >= COLS || by >= ROWS) return true;
                if (by >= 0 && board[by][bx]) return true;
            }
        }
        return false;
    }

    // Writes a piece into the board. Returns false if any cell sits above the top.
    function merge(board, matrix, x, y, type) {
        let fits = true;
        for (let r = 0; r < matrix.length; r++) {
            for (let c = 0; c < matrix[r].length; c++) {
                if (!matrix[r][c]) continue;
                if (y + r < 0) fits = false;
                else board[y + r][x + c] = type;
            }
        }
        return fits;
    }

    const fullRows = (board) => board.reduce((rows, row, i) => (row.every(Boolean) ? rows.concat(i) : rows), []);

    function clearLines(board) {
        const kept = board.filter((row) => row.some((cell) => !cell));
        const cleared = ROWS - kept.length;
        while (kept.length < ROWS) kept.unshift(emptyRow());
        board.splice(0, ROWS, ...kept);
        return cleared;
    }

    function dropY(board, matrix, x, y) {
        while (!collides(board, matrix, x, y + 1)) y++;
        return y;
    }

    // ---------------------------------------------------------------
    // Bot
    // ---------------------------------------------------------------

    const HEURISTIC_WEIGHTS = { height: -0.51, holes: -0.36, bumpiness: -0.18, lines: 0.76 };

    function boardFeatures(board) {
        let height = 0;
        let holes = 0;
        let bumpiness = 0;
        let prev = null;
        for (let c = 0; c < COLS; c++) {
            let top = ROWS;
            for (let r = 0; r < ROWS; r++) {
                if (board[r][c]) { top = r; break; }
            }
            for (let r = top + 1; r < ROWS; r++) {
                if (!board[r][c]) holes++;
            }
            const h = ROWS - top;
            height += h;
            if (prev !== null) bumpiness += Math.abs(prev - h);
            prev = h;
        }
        return { height, holes, bumpiness };
    }

    // A bot is any object with chooseMove(board, type) that returns
    // { rotation, x, y, score } for the placement it wants, or null if
    // nothing fits. To swap in a port of a Tetris ML Arena agent, write
    // another factory with the same shape and pass it to setBot().
    function createHeuristicBot(weights = HEURISTIC_WEIGHTS) {
        return {
            name: 'heuristic',
            chooseMove(board, type) {
                let best = null;
                ROTATIONS[type].forEach((matrix, rotation) => {
                    for (let x = -3; x < COLS; x++) {
                        const startY = -matrix.length;
                        if (collides(board, matrix, x, startY)) continue;
                        const y = dropY(board, matrix, x, startY);
                        const trial = copyBoard(board);
                        if (!merge(trial, matrix, x, y, type)) continue;
                        const lines = clearLines(trial);
                        const f = boardFeatures(trial);
                        const score = weights.height * f.height
                            + weights.holes * f.holes
                            + weights.bumpiness * f.bumpiness
                            + weights.lines * lines;
                        if (!best || score > best.score) best = { rotation, x, y, score };
                    }
                });
                return best;
            },
        };
    }

    const core = {
        COLS, ROWS, ROTATIONS, TYPES, BOTTOM_WIDTH, emptyBoard, createBag, createOpening,
        collides, merge, fullRows, clearLines, dropY, createHeuristicBot,
    };

    if (typeof document === 'undefined') {
        globalThis.TetrisCore = core;
        return;
    }

    // ---------------------------------------------------------------
    // Gate UI
    // ---------------------------------------------------------------

    const root = document.documentElement;
    const gate = document.getElementById('gate');
    if (!gate) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const $ = (sel) => gate.querySelector(sel);
    const els = {
        start: $('[data-gate-start]'),
        lines: $('[data-gate-lines]'),
        player: $('#player-board'),
        hint: $('[data-gate-hint]'),
        rowHint: $('[data-row-hint]'),
        nextSlots: gate.querySelectorAll('[data-next-slot]'),
        nextText: $('[data-next-text]'),
        result: $('#gate-result'),
        resultKicker: $('[data-result-kicker]'),
        resultTitle: $('[data-result-title]'),
        resultAction: $('[data-result-action]'),
        resultSkip: $('[data-result-skip]'),
        botStatus: $('[data-bot-status]'),
        botPieces: $('[data-bot-pieces]'),
        botLines: $('[data-bot-lines]'),
        botEval: $('[data-bot-eval]'),
        live: $('#gate-live'),
    };

    function createView(container) {
        const cells = [];
        const current = [];
        const frag = document.createDocumentFragment();
        for (let i = 0; i < ROWS * COLS; i++) {
            const cell = document.createElement('div');
            cell.className = 'cell';
            cells.push(cell);
            current.push('cell');
            frag.appendChild(cell);
        }
        container.appendChild(frag);

        return function draw(board, piece, options = {}) {
            const next = board.map((row) => row.map((v) => (v ? `cell blk b-${v.toLowerCase()}` : 'cell')));
            if (piece) {
                const matrix = ROTATIONS[piece.type][piece.rotation];
                const paint = (y, cls) => {
                    matrix.forEach((row, r) => row.forEach((on, c) => {
                        const by = y + r;
                        if (on && by >= 0 && by < ROWS) next[by][piece.x + c] = cls;
                    }));
                };
                if (options.ghost) {
                    const gy = dropY(board, matrix, piece.x, piece.y);
                    if (gy !== piece.y) paint(gy, `cell ghost g-${piece.type.toLowerCase()}`);
                }
                paint(piece.y, `cell blk b-${piece.type.toLowerCase()}`);
            }
            (options.flash || []).forEach((r) => {
                next[r] = next[r].map((cls) => `${cls} flash`);
            });
            for (let r = 0; r < ROWS; r++) {
                for (let c = 0; c < COLS; c++) {
                    const i = r * COLS + c;
                    if (current[i] !== next[r][c]) {
                        current[i] = next[r][c];
                        cells[i].className = next[r][c];
                    }
                }
            }
        };
    }

    const drawPlayerView = createView($('#player-board [data-grid]'));
    const drawBotView = createView($('#bot-board [data-grid]'));

    // NEXT preview: each slot is a 4 x 2 grid showing a piece in spawn
    // orientation, centered and resting on the slot's bottom row.
    const NEXT_W = 4;
    const NEXT_H = 2;
    const nextCells = Array.from(els.nextSlots, (slot) => {
        const cells = [];
        for (let i = 0; i < NEXT_W * NEXT_H; i++) {
            const cell = document.createElement('div');
            cell.className = 'cell';
            slot.appendChild(cell);
            cells.push(cell);
        }
        return cells;
    });

    function drawNext(types) {
        nextCells.forEach((cells, i) => {
            const type = types[i];
            cells.forEach((cell) => { cell.className = 'cell'; });
            if (!type) return;
            const matrix = ROTATIONS[type][0].filter((row) => row.some(Boolean));
            const width = matrix[0].length;
            const dx = Math.floor((NEXT_W - width) / 2);
            const dy = NEXT_H - matrix.length;
            matrix.forEach((row, r) => row.forEach((on, c) => {
                if (on) cells[(r + dy) * NEXT_W + c + dx].className = `cell blk b-${type.toLowerCase()}`;
            }));
        });
        els.nextText.textContent = `Next pieces: ${types.slice(0, 2).join(', ')}`;
    }

    const state = {
        running: false,
        over: false,
        result: null,
        gravity: null,
        timers: new Set(),
        agent: createHeuristicBot(),
        lastOpening: '',
        player: null,
        bot: null,
    };

    function later(fn, ms) {
        const id = setTimeout(() => {
            state.timers.delete(id);
            fn();
        }, ms);
        state.timers.add(id);
    }

    function stopTimers() {
        clearInterval(state.gravity);
        state.gravity = null;
        state.timers.forEach(clearTimeout);
        state.timers.clear();
    }

    const announce = (text) => { els.live.textContent = text; };

    const drawPlayer = (flash) => drawPlayerView(state.player.board, state.player.piece, { ghost: true, flash });
    const drawBot = (flash) => drawBotView(state.bot.board, state.bot.piece, { flash });

    function setBotStatus(text, searching) {
        els.botStatus.textContent = text;
        els.botStatus.classList.toggle('is-searching', !!searching);
    }

    function updateBotStats() {
        els.botPieces.textContent = state.bot.pieces;
        els.botLines.textContent = state.bot.lines;
        els.botEval.textContent = state.bot.lastScore === null ? '--' : state.bot.lastScore.toFixed(2);
    }

    function reset() {
        stopTimers();
        state.running = false;
        state.over = false;
        state.result = null;
        // A fresh opening every game, never the same as the one before it.
        let opening = createOpening();
        while (opening.join('') === state.lastOpening) opening = createOpening();
        state.lastOpening = opening.join('');
        state.player = { board: emptyBoard(), piece: null, upcoming: opening, bag: createBag() };
        fillUpcoming();
        state.bot = { board: emptyBoard(), piece: null, pieces: 0, lines: 0, lastScore: null, next: createBag() };
        els.lines.textContent = '0';
        els.result.hidden = true;
        els.hint.hidden = false;
        els.rowHint.classList.remove('is-done');
        drawNext(state.player.upcoming);
        setBotStatus('waiting for you', false);
        updateBotStats();
        drawPlayer();
        drawBot();
    }

    function start() {
        if (state.running) {
            els.player.focus();
            return;
        }
        if (state.over) reset();
        state.running = true;
        els.hint.hidden = true;
        els.result.hidden = true;
        spawnPlayer();
        if (!state.running) return;
        state.gravity = setInterval(() => {
            if (!tryMove(0, 1)) lockPiece();
        }, GRAVITY_MS);
        botTurn();
        els.player.focus();
        announce(`Game started. Fill the bottom row. First piece: ${state.player.piece.type}. ${els.nextText.textContent}.`);
    }

    function finish() {
        stopTimers();
        state.running = false;
        state.over = true;
    }

    // -- Player ------------------------------------------------------

    // Opening pieces first, then the 7-bag. Keeps enough queued for the preview.
    function fillUpcoming() {
        const p = state.player;
        while (p.upcoming.length < 3) p.upcoming.push(p.bag());
    }

    function spawnPlayer() {
        const p = state.player;
        const type = p.upcoming.shift();
        fillUpcoming();
        drawNext(p.upcoming);
        const x = type === 'O' ? 4 : 3;
        const y = type === 'I' ? -1 : 0;
        p.piece = { type, rotation: 0, x, y };
        if (collides(p.board, ROTATIONS[type][0], x, y)) {
            lose('topout');
            return;
        }
        drawPlayer();
    }

    function tryMove(dx, dy, turn = 0) {
        const piece = state.player.piece;
        if (!state.running || !piece) return false;
        const rotation = (piece.rotation + turn) % 4;
        if (collides(state.player.board, ROTATIONS[piece.type][rotation], piece.x + dx, piece.y + dy)) return false;
        piece.x += dx;
        piece.y += dy;
        piece.rotation = rotation;
        drawPlayer();
        return true;
    }

    function softDrop() {
        if (state.running && !tryMove(0, 1)) lockPiece();
    }

    function hardDrop() {
        const piece = state.player.piece;
        if (!state.running || !piece) return;
        piece.y = dropY(state.player.board, ROTATIONS[piece.type][piece.rotation], piece.x, piece.y);
        lockPiece();
    }

    function lockPiece() {
        const p = state.player;
        const piece = p.piece;
        if (!piece) return;
        const fits = merge(p.board, ROTATIONS[piece.type][piece.rotation], piece.x, piece.y, piece.type);
        p.piece = null;
        els.rowHint.classList.add('is-done');
        if (!fits) {
            lose('topout');
            return;
        }
        const rows = fullRows(p.board);
        if (rows.length) {
            win(rows);
            return;
        }
        spawnPlayer();
    }

    // -- Bot ---------------------------------------------------------

    function botTurn() {
        if (!state.running) return;
        const bot = state.bot;
        const type = bot.next();
        const move = state.agent.chooseMove(bot.board, type);
        setBotStatus('searching placements...', true);

        if (!move) {
            // The bot topped out. Give it a fresh board and keep going.
            bot.board = emptyBoard();
            drawBot();
            later(botTurn, BOT_MOVE_INTERVAL);
            return;
        }

        const startY = -ROTATIONS[type][move.rotation].length;
        const dropMs = reducedMotion.matches ? 0 : (move.y - startY + 1) * BOT_DROP_STEP;

        later(() => {
            bot.lastScore = move.score;
            setBotStatus(`placing ${type} piece`, false);
            updateBotStats();
            let y = startY;
            const step = () => {
                if (!state.running) return;
                if (dropMs && y <= move.y) {
                    bot.piece = { type, rotation: move.rotation, x: move.x, y };
                    drawBot();
                    y++;
                    later(step, BOT_DROP_STEP);
                    return;
                }
                bot.piece = null;
                merge(bot.board, ROTATIONS[type][move.rotation], move.x, move.y, type);
                bot.pieces++;
                const rows = fullRows(bot.board);
                if (rows.length) {
                    bot.lines += rows.length;
                    updateBotStats();
                    lose('bot', rows);
                    return;
                }
                updateBotStats();
                drawBot();
                botTurn();
            };
            step();
        }, Math.max(0, BOT_MOVE_INTERVAL - dropMs));
    }

    // -- Results -----------------------------------------------------

    const RESULTS = {
        win: {
            kicker: 'LINE CLEARED',
            title: 'Access granted',
            action: 'Enter the site',
            message: 'Line cleared. Access granted. Press Enter the site to continue.',
        },
        bot: {
            kicker: '',
            title: 'THE BOT CLEARED FIRST',
            action: 'Try again',
            message: 'The bot cleared first. Try again, or skip the game.',
        },
        topout: {
            kicker: '',
            title: 'TOPPED OUT',
            action: 'Try again',
            message: 'Topped out. Try again, or skip the game.',
        },
    };

    // Briefly flash cleared rows, then clear them and run done().
    function flashRows(draw, board, rows, done) {
        if (reducedMotion.matches) {
            clearLines(board);
            draw();
            done();
            return;
        }
        draw(rows);
        later(() => {
            clearLines(board);
            draw();
            done();
        }, FLASH_MS);
    }

    function win(rows) {
        finish();
        els.lines.textContent = '1';
        setBotStatus('stopped', false);
        flashRows(drawPlayer, state.player.board, rows, () => showResult('win'));
    }

    function lose(reason, rows) {
        finish();
        if (reason === 'bot') {
            setBotStatus('line cleared', false);
            flashRows(drawBot, state.bot.board, rows, () => showResult('bot'));
            return;
        }
        setBotStatus('stopped', false);
        drawPlayer();
        showResult(reason);
    }

    function showResult(kind) {
        // The gate may have closed while a row was flashing.
        if (!root.classList.contains('gate-open')) return;
        const r = RESULTS[kind];
        state.result = kind;
        els.result.className = `board-result is-${kind === 'win' ? 'win' : 'lose'}`;
        els.resultKicker.textContent = r.kicker;
        els.resultKicker.hidden = !r.kicker;
        els.resultTitle.textContent = r.title;
        els.resultTitle.classList.toggle('pixel', kind !== 'win');
        els.resultAction.textContent = r.action;
        els.resultSkip.hidden = kind === 'win';
        els.result.hidden = false;
        els.resultAction.focus();
        announce(r.message);
    }

    // -- Open and close ----------------------------------------------

    function enterSite() {
        finish();
        try { localStorage.setItem(STORAGE_KEY, '1'); } catch (e) { /* storage unavailable */ }
        gate.setAttribute('inert', '');
        const close = () => {
            root.classList.remove('gate-open');
            gate.classList.remove('is-leaving');
            gate.removeAttribute('inert');
            const heading = document.getElementById('site-title');
            if (heading) heading.focus();
        };
        if (reducedMotion.matches) {
            close();
        } else {
            gate.classList.add('is-leaving');
            // Tracked with later() so reopening the gate mid-fade cancels it.
            later(close, 400);
        }
    }

    function openGate() {
        reset();
        gate.classList.remove('is-leaving');
        gate.removeAttribute('inert');
        root.classList.add('gate-open');
        gate.scrollTop = 0;
        els.start.focus();
    }

    // -- Input -------------------------------------------------------

    const KEY_ACTIONS = {
        ArrowLeft: () => tryMove(-1, 0),
        ArrowRight: () => tryMove(1, 0),
        ArrowUp: () => tryMove(0, 0, 1),
        ArrowDown: softDrop,
        ' ': hardDrop,
        Spacebar: hardDrop,
    };

    els.player.addEventListener('keydown', (e) => {
        const action = KEY_ACTIONS[e.key];
        if (!action) return;
        e.preventDefault();
        if (!state.running) {
            if ((e.key === ' ' || e.key === 'Spacebar') && !state.over) start();
            return;
        }
        action();
    });

    const BUTTON_ACTIONS = {
        left: () => tryMove(-1, 0),
        right: () => tryMove(1, 0),
        rotate: () => tryMove(0, 0, 1),
        drop: hardDrop,
    };

    gate.querySelectorAll('[data-move]').forEach((btn) => {
        // Keep keyboard focus on the board when the buttons are clicked with a mouse.
        btn.addEventListener('mousedown', (e) => e.preventDefault());
        btn.addEventListener('click', () => {
            if (!state.running) {
                if (!state.over) start();
                return;
            }
            BUTTON_ACTIONS[btn.dataset.move]();
        });
    });

    // Touch: swipe left or right to move, tap to rotate, swipe down to hard drop.
    let touch = null;
    els.player.addEventListener('touchstart', (e) => {
        const t = e.changedTouches[0];
        touch = { x: t.clientX, y: t.clientY, shifted: 0, maxDist: 0 };
    }, { passive: true });

    els.player.addEventListener('touchmove', (e) => {
        if (!touch) return;
        e.preventDefault();
        const t = e.changedTouches[0];
        const dx = t.clientX - touch.x;
        const dy = t.clientY - touch.y;
        touch.maxDist = Math.max(touch.maxDist, Math.abs(dx), Math.abs(dy));
        if (Math.abs(dy) > Math.abs(dx)) return;
        const cell = els.player.querySelector('.cell').getBoundingClientRect().width || 26;
        const target = Math.trunc(dx / (cell + 2));
        while (touch.shifted < target && tryMove(1, 0)) touch.shifted++;
        while (touch.shifted > target && tryMove(-1, 0)) touch.shifted--;
    }, { passive: false });

    els.player.addEventListener('touchend', (e) => {
        if (!touch) return;
        const t = e.changedTouches[0];
        const dx = t.clientX - touch.x;
        const dy = t.clientY - touch.y;
        const tap = touch.maxDist < 10 && Math.abs(dx) < 10 && Math.abs(dy) < 10;
        touch = null;
        if (tap) {
            e.preventDefault();
            if (state.running) tryMove(0, 0, 1);
            else if (!state.over) start();
        } else if (dy > 40 && dy > Math.abs(dx)) {
            hardDrop();
        }
    });

    els.start.addEventListener('click', start);

    els.resultAction.addEventListener('click', () => {
        if (state.result === 'win') {
            enterSite();
        } else {
            reset();
            start();
        }
    });

    gate.querySelectorAll('[data-gate-skip]').forEach((link) => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            enterSite();
        });
    });

    // Keep Tab inside the gate while it covers the page.
    gate.addEventListener('keydown', (e) => {
        if (e.key !== 'Tab') return;
        const focusable = Array.from(gate.querySelectorAll('a[href], button, [tabindex="0"]'))
            .filter((el) => !el.closest('[hidden]') && el.getClientRects().length);
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
        }
    });

    reset();

    window.TetrisGate = {
        open: openGate,
        enter: enterSite,
        setBot(agent) { state.agent = agent; },
        core,
    };
})();
