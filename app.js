const boardEl = document.getElementById("board");
const statusText = document.getElementById("statusText");
const modeSelect = document.getElementById("modeSelect");
const difficultySelect = document.getElementById("difficultySelect");
const sideSelect = document.getElementById("sideSelect");
const restartBtn = document.getElementById("restartBtn");
const difficultyWrap = document.getElementById("difficultyWrap");
const sideWrap = document.getElementById("sideWrap");

const PIECE_NAMES = {
  k: "将",
  a: "士",
  b: "象",
  n: "马",
  r: "车",
  c: "炮",
  p: "兵",
};

const PIECE_SYMBOLS = {
  r: { k: "帥", a: "仕", b: "相", n: "傌", r: "俥", c: "炮", p: "兵" },
  b: { k: "將", a: "士", b: "象", n: "馬", r: "車", c: "砲", p: "卒" },
};

const PIECE_VALUES = {
  k: 12000,
  r: 600,
  c: 320,
  n: 300,
  b: 140,
  a: 130,
  p: 80,
};

const DIFFICULTY = {
  easy: { depth: 2, randomness: 0.35 },
  medium: { depth: 3, randomness: 0.1 },
  hard: { depth: 4, randomness: 0 },
};

const CENTER_COLS = new Set([3, 4, 5]);
let state = {};

function createInitialBoard() {
  const empty = () => Array.from({ length: 10 }, () => Array(9).fill(null));
  const board = empty();

  const put = (row, col, color, type) => {
    board[row][col] = { color, type };
  };

  [0, 8].forEach((c) => {
    put(0, c, "b", "r");
    put(9, c, "r", "r");
  });
  [1, 7].forEach((c) => {
    put(0, c, "b", "n");
    put(9, c, "r", "n");
  });
  [2, 6].forEach((c) => {
    put(0, c, "b", "b");
    put(9, c, "r", "b");
  });
  [3, 5].forEach((c) => {
    put(0, c, "b", "a");
    put(9, c, "r", "a");
  });

  put(0, 4, "b", "k");
  put(9, 4, "r", "k");

  [1, 7].forEach((c) => {
    put(2, c, "b", "c");
    put(7, c, "r", "c");
  });

  [0, 2, 4, 6, 8].forEach((c) => {
    put(3, c, "b", "p");
    put(6, c, "r", "p");
  });

  return board;
}

function cloneBoard(board) {
  return board.map((row) => row.map((piece) => (piece ? { ...piece } : null)));
}

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
  };

  render();
  maybeAIMove();
}

function inBounds(r, c) {
  return r >= 0 && r < 10 && c >= 0 && c < 9;
}

function isInPalace(color, r, c) {
  if (c < 3 || c > 5) return false;
  return color === "r" ? r >= 7 && r <= 9 : r >= 0 && r <= 2;
}

function crossedRiver(color, r) {
  return color === "r" ? r <= 4 : r >= 5;
}

function countBetweenStraight(board, from, to) {
  let count = 0;
  if (from.r === to.r) {
    const min = Math.min(from.c, to.c) + 1;
    const max = Math.max(from.c, to.c);
    for (let c = min; c < max; c += 1) {
      if (board[from.r][c]) count += 1;
    }
  } else if (from.c === to.c) {
    const min = Math.min(from.r, to.r) + 1;
    const max = Math.max(from.r, to.r);
    for (let r = min; r < max; r += 1) {
      if (board[r][from.c]) count += 1;
    }
  }
  return count;
}

function canPieceMove(board, from, to) {
  if (!inBounds(to.r, to.c)) return false;
  const piece = board[from.r][from.c];
  if (!piece) return false;
  const target = board[to.r][to.c];
  if (target && target.color === piece.color) return false;

  const dr = to.r - from.r;
  const dc = to.c - from.c;
  const adr = Math.abs(dr);
  const adc = Math.abs(dc);

  switch (piece.type) {
    case "k": {
      if (target?.type === "k" && from.c === to.c) {
        return countBetweenStraight(board, from, to) === 0;
      }
      if (!isInPalace(piece.color, to.r, to.c)) return false;
      return adr + adc === 1;
    }
    case "a":
      return isInPalace(piece.color, to.r, to.c) && adr === 1 && adc === 1;
    case "b": {
      if (adr !== 2 || adc !== 2) return false;
      if (piece.color === "r" && to.r < 5) return false;
      if (piece.color === "b" && to.r > 4) return false;
      const eyeR = from.r + dr / 2;
      const eyeC = from.c + dc / 2;
      return !board[eyeR][eyeC];
    }
    case "n": {
      if (!((adr === 2 && adc === 1) || (adr === 1 && adc === 2))) return false;
      const legR = adr === 2 ? from.r + dr / 2 : from.r;
      const legC = adc === 2 ? from.c + dc / 2 : from.c;
      return !board[legR][legC];
    }
    case "r": {
      if (from.r !== to.r && from.c !== to.c) return false;
      return countBetweenStraight(board, from, to) === 0;
    }
    case "c": {
      if (from.r !== to.r && from.c !== to.c) return false;
      const between = countBetweenStraight(board, from, to);
      if (!target) return between === 0;
      return between === 1;
    }
    case "p": {
      const forward = piece.color === "r" ? -1 : 1;
      if (dc === 0 && dr === forward) return true;
      if (dr === 0 && adc === 1 && crossedRiver(piece.color, from.r)) return true;
      return false;
    }
    default:
      return false;
  }
}

function findKing(board, color) {
  for (let r = 0; r < 10; r += 1) {
    for (let c = 0; c < 9; c += 1) {
      const p = board[r][c];
      if (p && p.color === color && p.type === "k") return { r, c };
    }
  }
  return null;
}

function isInCheck(board, color) {
  const king = findKing(board, color);
  if (!king) return true;

  const enemy = color === "r" ? "b" : "r";
  for (let r = 0; r < 10; r += 1) {
    for (let c = 0; c < 9; c += 1) {
      const p = board[r][c];
      if (p && p.color === enemy && canPieceMove(board, { r, c }, king)) {
        return true;
      }
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
      const p = board[r][c];
      if (!p || p.color !== color) continue;
      for (let tr = 0; tr < 10; tr += 1) {
        for (let tc = 0; tc < 9; tc += 1) {
          const from = { r, c };
          const to = { r: tr, c: tc };
          if (!canPieceMove(board, from, to)) continue;
          const next = makeMove(board, from, to);
          if (!isInCheck(next, color)) {
            moves.push({ from, to, capture: board[tr][tc] });
          }
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

      const side = p.color === aiColor ? 1 : -1;
      score += side * value;
    }
  }

  const aiMoves = getAllLegalMoves(board, aiColor).length;
  const enemyColor = aiColor === "r" ? "b" : "r";
  const enemyMoves = getAllLegalMoves(board, enemyColor).length;
  score += (aiMoves - enemyMoves) * 2;

  return score;
}

function minimax(board, depth, alpha, beta, currentColor, aiColor) {
  const moves = getAllLegalMoves(board, currentColor);
  if (depth === 0 || moves.length === 0) {
    if (moves.length === 0) {
      if (isInCheck(board, currentColor)) {
        return { score: currentColor === aiColor ? -999999 : 999999, move: null };
      }
      return { score: 0, move: null };
    }
    return { score: evaluate(board, aiColor), move: null };
  }

  const maximizing = currentColor === aiColor;
  let bestMove = null;

  if (maximizing) {
    let bestScore = -Infinity;
    for (const move of moves) {
      const next = makeMove(board, move.from, move.to);
      const result = minimax(next, depth - 1, alpha, beta, currentColor === "r" ? "b" : "r", aiColor);
      if (result.score > bestScore) {
        bestScore = result.score;
        bestMove = move;
      }
      alpha = Math.max(alpha, bestScore);
      if (beta <= alpha) break;
    }
    return { score: bestScore, move: bestMove };
  }

  let bestScore = Infinity;
  for (const move of moves) {
    const next = makeMove(board, move.from, move.to);
    const result = minimax(next, depth - 1, alpha, beta, currentColor === "r" ? "b" : "r", aiColor);
    if (result.score < bestScore) {
      bestScore = result.score;
      bestMove = move;
    }
    beta = Math.min(beta, bestScore);
    if (beta <= alpha) break;
  }
  return { score: bestScore, move: bestMove };
}

function chooseAIMove() {
  const config = DIFFICULTY[state.difficulty] ?? DIFFICULTY.easy;
  const moves = getAllLegalMoves(state.board, state.aiSide);
  if (!moves.length) return null;

  if (Math.random() < config.randomness) {
    return moves[Math.floor(Math.random() * Math.min(6, moves.length))];
  }

  return minimax(state.board, config.depth, -Infinity, Infinity, state.aiSide, state.aiSide).move;
}

function applyMove(from, to) {
  const piece = state.board[from.r][from.c];
  const target = state.board[to.r][to.c];
  state.board = makeMove(state.board, from, to);

  const enemy = piece.color === "r" ? "b" : "r";
  state.turn = enemy;
  state.selected = null;

  const legalMoves = getAllLegalMoves(state.board, enemy);
  if (legalMoves.length === 0) {
    state.gameOver = true;
    statusText.textContent = isInCheck(state.board, enemy)
      ? `${piece.color === "r" ? "红方" : "黑方"}将死获胜！`
      : "和棋（无合法走法）";
  } else if (target?.type === "k") {
    state.gameOver = true;
    statusText.textContent = `${piece.color === "r" ? "红方" : "黑方"}吃将获胜！`;
  } else {
    statusText.textContent = `${enemy === "r" ? "红方" : "黑方"}回合`;
  }
}

function handleCellClick(r, c) {
  if (state.gameOver) return;
  if (state.mode === "pve" && state.turn === state.aiSide) return;

  const piece = state.board[r][c];
  const isMyTurnPiece = piece && piece.color === state.turn;

  if (!state.selected) {
    if (isMyTurnPiece) {
      state.selected = { r, c };
      render();
    }
    return;
  }

  const selectedPiece = state.board[state.selected.r][state.selected.c];
  if (!selectedPiece) {
    state.selected = null;
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
  const next = makeMove(state.board, from, to);
  if (isInCheck(next, state.turn)) return;

  applyMove(from, to);
  render();
  maybeAIMove();
}

function maybeAIMove() {
  if (state.gameOver || state.mode !== "pve" || state.turn !== state.aiSide) return;

  statusText.textContent = "电脑思考中...";
  setTimeout(() => {
    const move = chooseAIMove();
    if (!move) {
      state.gameOver = true;
      statusText.textContent = "玩家获胜（电脑无合法走法）";
      render();
      return;
    }
    applyMove(move.from, move.to);
    render();
  }, 280);
}

function getValidTargets(from) {
  const targets = new Set();
  for (let r = 0; r < 10; r += 1) {
    for (let c = 0; c < 9; c += 1) {
      const to = { r, c };
      if (!canPieceMove(state.board, from, to)) continue;
      const next = makeMove(state.board, from, to);
      if (!isInCheck(next, state.turn)) targets.add(`${r},${c}`);
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
      cell.addEventListener("click", () => handleCellClick(r, c));

      if (state.selected && state.selected.r === r && state.selected.c === c) {
        cell.classList.add("selected");
      }
      if (validTargets.has(`${r},${c}`)) {
        cell.classList.add("valid");
      }

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

initGame();
