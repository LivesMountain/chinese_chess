const boardEl = document.getElementById("board");
const statusText = document.getElementById("statusText");
const modeSelect = document.getElementById("modeSelect");
const difficultySelect = document.getElementById("difficultySelect");
const sideSelect = document.getElementById("sideSelect");
const restartBtn = document.getElementById("restartBtn");
const undoBtn = document.getElementById("undoBtn");
const difficultyWrap = document.getElementById("difficultyWrap");
const sideWrap = document.getElementById("sideWrap");

const PIECE_NAMES = { k: "将", a: "士", b: "象", n: "马", r: "车", c: "炮", p: "兵" };
const PIECE_SYMBOLS = {
  r: { k: "帥", a: "仕", b: "相", n: "傌", r: "俥", c: "炮", p: "兵" },
  b: { k: "將", a: "士", b: "象", n: "馬", r: "車", c: "砲", p: "卒" },
};
const PIECE_VALUES = { k: 12000, r: 600, c: 320, n: 300, b: 140, a: 130, p: 80 };
const DIFFICULTY = {
  easy: { depth: 2, randomness: 0.35 },
  medium: { depth: 3, randomness: 0.1 },
  hard: { depth: 4, randomness: 0 },
};
const CENTER_COLS = new Set([3, 4, 5]);

let state = {};

function createInitialBoard() {
  const board = Array.from({ length: 10 }, () => Array(9).fill(null));
  const put = (r, c, color, type) => (board[r][c] = { color, type });
  [0, 8].forEach((c) => (put(0, c, "b", "r"), put(9, c, "r", "r")));
  [1, 7].forEach((c) => (put(0, c, "b", "n"), put(9, c, "r", "n")));
  [2, 6].forEach((c) => (put(0, c, "b", "b"), put(9, c, "r", "b")));
  [3, 5].forEach((c) => (put(0, c, "b", "a"), put(9, c, "r", "a")));
  put(0, 4, "b", "k");
  put(9, 4, "r", "k");
  [1, 7].forEach((c) => (put(2, c, "b", "c"), put(7, c, "r", "c")));
  [0, 2, 4, 6, 8].forEach((c) => (put(3, c, "b", "p"), put(6, c, "r", "p")));
  return board;
}

const cloneBoard = (board) => board.map((row) => row.map((p) => (p ? { ...p } : null)));
const inBounds = (r, c) => r >= 0 && r < 10 && c >= 0 && c < 9;
const crossedRiver = (color, r) => (color === "r" ? r <= 4 : r >= 5);
const isInPalace = (color, r, c) => c >= 3 && c <= 5 && (color === "r" ? r >= 7 && r <= 9 : r <= 2);

function initGame() {
  const mode = modeSelect.value;
  const humanSide = sideSelect.value;
  state = {
    board: createInitialBoard(),
    turn: "r",
    selected: null,
    gameOver: false,
    mode,
    difficulty: difficultySelect.value,
    humanSide,
    aiSide: mode === "pve" ? (humanSide === "r" ? "b" : "r") : null,
    moveHistory: [],
    isAnimating: false,
  };
  updateStatus("红方先行");
  render();
  maybeAIMove();
}

function countBetweenStraight(board, from, to) {
  let count = 0;
  if (from.r === to.r) {
    for (let c = Math.min(from.c, to.c) + 1; c < Math.max(from.c, to.c); c += 1) if (board[from.r][c]) count += 1;
  } else if (from.c === to.c) {
    for (let r = Math.min(from.r, to.r) + 1; r < Math.max(from.r, to.r); r += 1) if (board[r][from.c]) count += 1;
  }
  return count;
}

function canPieceMove(board, from, to) {
  if (!inBounds(to.r, to.c)) return false;
  const piece = board[from.r][from.c];
  const target = board[to.r][to.c];
  if (!piece || (target && target.color === piece.color)) return false;

  const dr = to.r - from.r;
  const dc = to.c - from.c;
  const adr = Math.abs(dr);
  const adc = Math.abs(dc);

  switch (piece.type) {
    case "k":
      if (target?.type === "k" && from.c === to.c) return countBetweenStraight(board, from, to) === 0;
      return isInPalace(piece.color, to.r, to.c) && adr + adc === 1;
    case "a":
      return isInPalace(piece.color, to.r, to.c) && adr === 1 && adc === 1;
    case "b": {
      if (adr !== 2 || adc !== 2) return false;
      if ((piece.color === "r" && to.r < 5) || (piece.color === "b" && to.r > 4)) return false;
      return !board[from.r + dr / 2][from.c + dc / 2];
    }
    case "n": {
      if (!((adr === 2 && adc === 1) || (adr === 1 && adc === 2))) return false;
      const legR = adr === 2 ? from.r + dr / 2 : from.r;
      const legC = adc === 2 ? from.c + dc / 2 : from.c;
      return !board[legR][legC];
    }
    case "r":
      return (from.r === to.r || from.c === to.c) && countBetweenStraight(board, from, to) === 0;
    case "c": {
      if (from.r !== to.r && from.c !== to.c) return false;
      const between = countBetweenStraight(board, from, to);
      return target ? between === 1 : between === 0;
    }
    case "p": {
      const forward = piece.color === "r" ? -1 : 1;
      if (dc === 0 && dr === forward) return true;
      return dr === 0 && adc === 1 && crossedRiver(piece.color, from.r);
    }
    default:
      return false;
  }
}

function findKing(board, color) {
  for (let r = 0; r < 10; r += 1) for (let c = 0; c < 9; c += 1) if (board[r][c]?.color === color && board[r][c]?.type === "k") return { r, c };
  return null;
}

function isInCheck(board, color) {
  const king = findKing(board, color);
  if (!king) return true;
  const enemy = color === "r" ? "b" : "r";
  for (let r = 0; r < 10; r += 1) {
    for (let c = 0; c < 9; c += 1) {
      if (board[r][c]?.color === enemy && canPieceMove(board, { r, c }, king)) return true;
    }
  }
  return false;
}

function makeMove(board, from, to) {
  const next = cloneBoard(board);
  next[to.r][to.c] = next[from.r][from.c];
  next[from.r][from.c] = null;
  return next;
}

function movePriority(board, move) {
  const mover = board[move.from.r][move.from.c];
  const target = board[move.to.r][move.to.c];
  let score = 0;
  if (target) score += PIECE_VALUES[target.type] * 10 - PIECE_VALUES[mover.type];
  if (CENTER_COLS.has(move.to.c)) score += 15;
  if (mover.type === "p" && crossedRiver(mover.color, move.to.r)) score += 30;
  return score;
}

function getAllLegalMoves(board, color) {
  const moves = [];
  for (let r = 0; r < 10; r += 1) {
    for (let c = 0; c < 9; c += 1) {
      if (board[r][c]?.color !== color) continue;
      for (let tr = 0; tr < 10; tr += 1) {
        for (let tc = 0; tc < 9; tc += 1) {
          const from = { r, c };
          const to = { r: tr, c: tc };
          if (!canPieceMove(board, from, to)) continue;
          const next = makeMove(board, from, to);
          if (!isInCheck(next, color)) moves.push({ from, to, capture: board[tr][tc] });
        }
      }
    }
  }
  moves.sort((a, b) => movePriority(board, b) - movePriority(board, a));
  return moves;
}

function evaluate(board, aiColor) {
  let score = 0;
  for (let r = 0; r < 10; r += 1) {
    for (let c = 0; c < 9; c += 1) {
      const p = board[r][c];
      if (!p) continue;
      let value = PIECE_VALUES[p.type];
      if (p.type === "p" && crossedRiver(p.color, r)) value += 35;
      if (p.type === "n" && CENTER_COLS.has(c)) value += 20;
      if (p.type === "r" && CENTER_COLS.has(c)) value += 8;
      score += p.color === aiColor ? value : -value;
    }
  }
  const enemy = aiColor === "r" ? "b" : "r";
  score += (getAllLegalMoves(board, aiColor).length - getAllLegalMoves(board, enemy).length) * 2;
  return score;
}

function minimax(board, depth, alpha, beta, currentColor, aiColor) {
  const moves = getAllLegalMoves(board, currentColor);
  if (depth === 0 || moves.length === 0) {
    if (!moves.length) {
      if (isInCheck(board, currentColor)) return { score: currentColor === aiColor ? -999999 : 999999, move: null };
      return { score: 0, move: null };
    }
    return { score: evaluate(board, aiColor), move: null };
  }

  let bestMove = null;
  if (currentColor === aiColor) {
    let best = -Infinity;
    for (const move of moves) {
      const score = minimax(makeMove(board, move.from, move.to), depth - 1, alpha, beta, currentColor === "r" ? "b" : "r", aiColor).score;
      if (score > best) {
        best = score;
        bestMove = move;
      }
      alpha = Math.max(alpha, best);
      if (beta <= alpha) break;
    }
    return { score: best, move: bestMove };
  }

  let best = Infinity;
  for (const move of moves) {
    const score = minimax(makeMove(board, move.from, move.to), depth - 1, alpha, beta, currentColor === "r" ? "b" : "r", aiColor).score;
    if (score < best) {
      best = score;
      bestMove = move;
    }
    beta = Math.min(beta, best);
    if (beta <= alpha) break;
  }
  return { score: best, move: bestMove };
}

function chooseAIMove() {
  const config = DIFFICULTY[state.difficulty] ?? DIFFICULTY.easy;
  const moves = getAllLegalMoves(state.board, state.aiSide);
  if (!moves.length) return null;
  if (Math.random() < config.randomness) return moves[Math.floor(Math.random() * Math.min(6, moves.length))];
  return minimax(state.board, config.depth, -Infinity, Infinity, state.aiSide, state.aiSide).move;
}

function updateStatus(text) {
  statusText.textContent = text;
}

function recordHistory(beforeBoard, move, prevTurn) {
  state.moveHistory.push({ board: cloneBoard(beforeBoard), turn: prevTurn, move, gameOver: state.gameOver });
}

function getCellCenter(r, c) {
  const cell = boardEl.querySelector(`[data-pos="${r},${c}"]`);
  const boardRect = boardEl.getBoundingClientRect();
  const rect = cell.getBoundingClientRect();
  return { x: rect.left - boardRect.left + rect.width / 2, y: rect.top - boardRect.top + rect.height / 2 };
}

function animateMove(move, movingPiece) {
  const ghost = document.createElement("span");
  ghost.className = `piece piece-${movingPiece.color} animating`;
  ghost.textContent = PIECE_SYMBOLS[movingPiece.color][movingPiece.type];
  boardEl.appendChild(ghost);

  const from = getCellCenter(move.from.r, move.from.c);
  const to = getCellCenter(move.to.r, move.to.c);
  const half = 24;
  ghost.style.left = `${from.x - half}px`;
  ghost.style.top = `${from.y - half}px`;
  requestAnimationFrame(() => {
    ghost.style.transform = `translate(${to.x - from.x}px, ${to.y - from.y}px)`;
  });

  return new Promise((resolve) => {
    ghost.addEventListener("transitionend", () => {
      ghost.remove();
      resolve();
    }, { once: true });
  });
}

async function applyMove(from, to) {
  const move = { from: { ...from }, to: { ...to } };
  const movingPiece = state.board[from.r][from.c];
  const target = state.board[to.r][to.c];
  const prevBoard = cloneBoard(state.board);
  const prevTurn = state.turn;

  state.isAnimating = true;
  await animateMove(move, movingPiece);

  state.board = makeMove(state.board, from, to);
  state.turn = movingPiece.color === "r" ? "b" : "r";
  state.selected = null;
  recordHistory(prevBoard, move, prevTurn);

  const enemy = state.turn;
  const legalMoves = getAllLegalMoves(state.board, enemy);
  if (!legalMoves.length) {
    state.gameOver = true;
    updateStatus(isInCheck(state.board, enemy) ? `${movingPiece.color === "r" ? "红方" : "黑方"}将死获胜！` : "和棋（无合法走法）");
  } else if (target?.type === "k") {
    state.gameOver = true;
    updateStatus(`${movingPiece.color === "r" ? "红方" : "黑方"}吃将获胜！`);
  } else {
    updateStatus(`${enemy === "r" ? "红方" : "黑方"}回合`);
  }

  state.isAnimating = false;
  render();
}

async function handleUndo() {
  if (state.isAnimating) return;
  if (!state.moveHistory.length) {
    updateStatus("当前没有可悔棋的步骤");
    return;
  }

  if (state.mode === "pvp") {
    const currentSide = state.turn === "r" ? "红方" : "黑方";
    const agreed = window.confirm(`${currentSide}请求悔棋，是否同意？`);
    if (!agreed) {
      updateStatus("对方拒绝悔棋");
      return;
    }
  }

  if (state.mode === "pve") {
    if (state.moveHistory.length >= 2) {
      state.moveHistory.pop();
      const entry = state.moveHistory.pop();
      state.board = cloneBoard(entry.board);
      state.turn = entry.turn;
    } else {
      const entry = state.moveHistory.pop();
      state.board = cloneBoard(entry.board);
      state.turn = entry.turn;
    }
  } else {
    const entry = state.moveHistory.pop();
    state.board = cloneBoard(entry.board);
    state.turn = entry.turn;
  }

  state.selected = null;
  state.gameOver = false;
  updateStatus(`${state.turn === "r" ? "红方" : "黑方"}回合`);
  render();
}

async function handleCellClick(r, c) {
  if (state.gameOver || state.isAnimating) return;
  if (state.mode === "pve" && state.turn === state.aiSide) return;

  const piece = state.board[r][c];
  const isMyTurnPiece = piece && piece.color === state.turn;

  if (!state.selected) {
    if (isMyTurnPiece) state.selected = { r, c };
    render();
    return;
  }

  if (state.selected.r === r && state.selected.c === c) {
    state.selected = null;
    render();
    return;
  }

  if (isMyTurnPiece) {
    state.selected = { r, c };
    render();
    return;
  }

  const from = state.selected;
  const to = { r, c };
  if (!canPieceMove(state.board, from, to)) return;
  if (isInCheck(makeMove(state.board, from, to), state.turn)) return;

  await applyMove(from, to);
  maybeAIMove();
}

function maybeAIMove() {
  if (state.gameOver || state.mode !== "pve" || state.turn !== state.aiSide || state.isAnimating) return;
  updateStatus("电脑思考中...");
  setTimeout(async () => {
    const move = chooseAIMove();
    if (!move) {
      state.gameOver = true;
      updateStatus("玩家获胜（电脑无合法走法）");
      render();
      return;
    }
    await applyMove(move.from, move.to);
  }, 260);
}

function getValidTargets(from) {
  const targets = new Set();
  for (let r = 0; r < 10; r += 1) {
    for (let c = 0; c < 9; c += 1) {
      const to = { r, c };
      if (!canPieceMove(state.board, from, to)) continue;
      if (!isInCheck(makeMove(state.board, from, to), state.turn)) targets.add(`${r},${c}`);
    }
  }
  return targets;
}

function edgeClasses(r, c) {
  const classes = [];
  if (r === 0) classes.push("no-top");
  if (r === 9) classes.push("no-bottom");
  if (c === 0) classes.push("no-left");
  if (c === 8) classes.push("no-right");
  if (r === 4) classes.push("river-top");
  if (r === 5) classes.push("river-bottom");
  return classes.join(" ");
}

function render() {
  boardEl.innerHTML = "";
  const validTargets = state.selected ? getValidTargets(state.selected) : new Set();

  for (let r = 0; r < 10; r += 1) {
    for (let c = 0; c < 9; c += 1) {
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = `cell ${edgeClasses(r, c)}`;
      cell.dataset.pos = `${r},${c}`;
      cell.addEventListener("click", () => handleCellClick(r, c));

      if (state.selected?.r === r && state.selected?.c === c) cell.classList.add("selected");
      if (validTargets.has(`${r},${c}`)) cell.classList.add("valid");

      const piece = state.board[r][c];
      if (piece) {
        const pieceEl = document.createElement("span");
        pieceEl.className = `piece piece-${piece.color}`;
        pieceEl.textContent = PIECE_SYMBOLS[piece.color][piece.type];
        pieceEl.title = `${piece.color === "r" ? "红" : "黑"}${PIECE_NAMES[piece.type]}`;
        cell.appendChild(pieceEl);
      }
      boardEl.appendChild(cell);
    }
  }
}

modeSelect.addEventListener("change", () => {
  const isPve = modeSelect.value === "pve";
  difficultyWrap.classList.toggle("hidden", !isPve);
  sideWrap.classList.toggle("hidden", !isPve);
  initGame();
});

difficultySelect.addEventListener("change", initGame);
sideSelect.addEventListener("change", initGame);
restartBtn.addEventListener("click", initGame);
undoBtn.addEventListener("click", handleUndo);

initGame();
