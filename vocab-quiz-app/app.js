"use strict";

/* ============================================================
 * テーマ（ライト／ダーク切り替え）
 * ============================================================ */
function getTheme() {
  return document.documentElement.getAttribute("data-theme") || "light";
}
function setTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("vocab-quiz-theme", theme);
  updateThemeIcons();
}
function updateThemeIcons() {
  const icon = getTheme() === "dark" ? "☀" : "☾";
  document.querySelectorAll(".theme-toggle").forEach((btn) => (btn.textContent = icon));
}
function toggleTheme() {
  setTheme(getTheme() === "dark" ? "light" : "dark");
}
document.querySelectorAll(".theme-toggle").forEach((btn) => btn.addEventListener("click", toggleTheme));
updateThemeIcons();

/* ============================================================
 * 状態
 * ============================================================ */
const state = {
  words: [],            // 読み込んだ全単語 [{chapter, ja, en, wrongEn:[], wrongJa:[]}]
  chapters: [],          // 出現する章番号（昇順）
  selectedChapters: new Set(),
  directionMode: "both", // "both" | "ja2en" | "en2ja"

  announcements: [],
  lastHomeScreen: "select",
  wordlistChapter: "all",

  currentSpecs: [],      // 今回の出題セット [{word, direction}]
  currentQuestions: [],  // シャッフル済み実問題 [{spec, prompt, answer, choices, correctIndex, chapter, direction}]
  qIndex: 0,
  score: 0,
  wrongSpecs: [],        // 今回まちがえた {spec} の配列（重複なし）
  answering: false,      // 連打防止
};

const el = (id) => document.getElementById(id);

const HOME_SCREENS = ["loading", "error", "select", "wordlist", "announcements"];
const NAV_SCREENS = ["select", "wordlist", "announcements"];

function showScreen(name) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.remove("is-active"));
  el("screen-" + name).classList.add("is-active");

  el("home-content").classList.toggle("is-visible", HOME_SCREENS.includes(name));

  const isNav = NAV_SCREENS.includes(name);
  el("home-header").classList.toggle("is-visible", isNav);
  el("bottom-nav").classList.toggle("is-visible", isNav);
  if (isNav) {
    state.lastHomeScreen = name;
    document.querySelectorAll(".nav-btn").forEach((b) =>
      b.classList.toggle("is-active", b.dataset.screen === name)
    );
  }

  // お知らせバナーは クイズ／単語帳 ホームでのみ表示し、お知らせ画面自体では隠す
  const showBanner = (name === "select" || name === "wordlist") && state.announcements.length > 0;
  el("announce-banner").classList.toggle("is-visible", showBanner);

  if (name === "announcements") {
    renderAnnouncements();
    if (state.announcements.length > 0) {
      localStorage.setItem("vocab-quiz-announce-seen", state.announcements[0].date);
    }
    updateAnnounceDot();
  }
}

/* ============================================================
 * CSV 読み込み・パース
 * ============================================================ */
function parseCSV(text) {
  const rows = [];
  let field = "", row = [], inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(field); rows.push(row); row = []; field = "";
      } else field += c;
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((v) => String(v).trim() !== ""));
}

function rowsToWords(rows) {
  if (rows.length === 0) return [];
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const idx = (name) => header.indexOf(name);
  const iChapter = idx("chapter");
  const iJa = idx("ja");
  const iEn = idx("en");
  const wrongEnIdx = [idx("wrong_en_1"), idx("wrong_en_2"), idx("wrong_en_3")];
  const wrongJaIdx = [idx("wrong_ja_1"), idx("wrong_ja_2"), idx("wrong_ja_3")];

  if (iChapter === -1 || iJa === -1 || iEn === -1) {
    throw new Error("列名が正しくありません。chapter, ja, en の列が必要です。");
  }

  const words = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const chapter = parseInt(String(row[iChapter]).trim(), 10);
    const ja = (row[iJa] || "").trim();
    const en = (row[iEn] || "").trim();
    if (!chapter || !ja || !en) continue;
    const wrongEn = wrongEnIdx.map((i) => (i >= 0 ? (row[i] || "").trim() : "")).filter(Boolean);
    const wrongJa = wrongJaIdx.map((i) => (i >= 0 ? (row[i] || "").trim() : "")).filter(Boolean);
    words.push({ chapter, ja, en, wrongEn, wrongJa });
  }
  return words;
}

async function loadAllSheets() {
  const all = [];
  for (const sheet of SHEET_CONFIG) {
    let text;
    try {
      const res = await fetch(sheet.url, { cache: "no-store" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      text = await res.text();
    } catch (e) {
      throw new Error(`「${sheet.label}」の読み込みに失敗しました（${sheet.url}）\n${e.message}`);
    }
    const rows = parseCSV(text);
    try {
      all.push(...rowsToWords(rows));
    } catch (e) {
      throw new Error(`「${sheet.label}」の形式が正しくありません。\n${e.message}`);
    }
  }
  return all;
}

async function loadAnnouncements() {
  try {
    const res = await fetch(ANNOUNCEMENTS_URL, { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    return data
      .filter((a) => a && a.date && a.title)
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  } catch (e) {
    console.warn("お知らせの読み込みに失敗しました:", e.message);
    return [];
  }
}

/* ============================================================
 * 初期化
 * ============================================================ */
async function init() {
  showScreen("loading");
  try {
    const [words, announcements] = await Promise.all([loadAllSheets(), loadAnnouncements()]);
    if (words.length === 0) throw new Error("有効な単語データが1件も見つかりませんでした。");
    state.words = words;
    state.chapters = [...new Set(words.map((w) => w.chapter))].sort((a, b) => a - b);
    state.announcements = announcements;
    buildSelectScreen();
    buildWordlistScreen();
    renderAnnounceBanner();
    updateAnnounceDot();
    showScreen("select");
  } catch (e) {
    el("error-detail").textContent = e.message;
    showScreen("error");
  }
}

/* ============================================================
 * 章選択画面
 * ============================================================ */
function buildSelectScreen() {
  // チェックリスト
  const list = el("chapter-list");
  list.innerHTML = "";
  state.chapters.forEach((ch) => {
    const count = state.words.filter((w) => w.chapter === ch).length;
    const row = document.createElement("label");
    row.className = "chapter-row";
    row.innerHTML = `
      <input type="checkbox" value="${ch}">
      <span class="ch-label">第${ch}章</span>
      <span class="ch-count">${count}語</span>
    `;
    const checkbox = row.querySelector("input");
    checkbox.addEventListener("change", () => {
      row.classList.toggle("is-checked", checkbox.checked);
      if (checkbox.checked) state.selectedChapters.add(ch);
      else state.selectedChapters.delete(ch);
      updateSelectionSummary();
    });
    list.appendChild(row);
  });

  // デフォルトで全章選択
  state.selectedChapters = new Set(state.chapters);
  syncCheckboxesFromSelection();
  updateSelectionSummary();
}

function syncCheckboxesFromSelection() {
  document.querySelectorAll(".chapter-row").forEach((row) => {
    const cb = row.querySelector("input");
    const checked = state.selectedChapters.has(parseInt(cb.value, 10));
    cb.checked = checked;
    row.classList.toggle("is-checked", checked);
  });
}

function updateSelectionSummary() {
  const count = state.words.filter((w) => state.selectedChapters.has(w.chapter)).length;
  el("selection-summary").textContent = count === 0 ? "章を1つ以上選んでください" : "";
  el("btn-start").disabled = count === 0;
}

document.querySelectorAll("#direction-toggle .seg-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    state.directionMode = btn.dataset.mode;
    document.querySelectorAll("#direction-toggle .seg-btn").forEach((b) =>
      b.classList.toggle("is-active", b === btn)
    );
  });
});
function initDirectionToggle() {
  document.querySelectorAll("#direction-toggle .seg-btn").forEach((b) =>
    b.classList.toggle("is-active", b.dataset.mode === state.directionMode)
  );
}
initDirectionToggle();

el("btn-select-all").addEventListener("click", () => {
  state.selectedChapters = new Set(state.chapters);
  syncCheckboxesFromSelection();
  updateSelectionSummary();
});

el("btn-select-none").addEventListener("click", () => {
  state.selectedChapters = new Set();
  syncCheckboxesFromSelection();
  updateSelectionSummary();
});

el("btn-start").addEventListener("click", () => {
  const pool = state.words.filter((w) => state.selectedChapters.has(w.chapter));
  const specs = pool.map((word) => ({ word, direction: pickDirection(word) }));
  startQuiz(shuffle(specs));
});

el("btn-quit").addEventListener("click", () => {
  if (confirm("クイズを中断して章の選択にもどりますか？")) {
    showScreen("select");
  }
});

/* ============================================================
 * 問題生成
 * ============================================================ */
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickDirection(word) {
  const okJa2En = word.wrongEn.length >= 3;
  const okEn2Ja = word.wrongJa.length >= 3;

  if (state.directionMode === "ja2en") return "ja2en";
  if (state.directionMode === "en2ja") return "en2ja";

  if (okJa2En && okEn2Ja) return Math.random() < 0.5 ? "ja2en" : "en2ja";
  if (okJa2En) return "ja2en";
  if (okEn2Ja) return "en2ja";
  // どちらも不十分な場合は、誤答候補が多い方を採用（後で不足分を補う）
  return word.wrongEn.length >= word.wrongJa.length ? "ja2en" : "en2ja";
}

function fillMissingWrong(list, correct, poolLang) {
  const need = 3 - list.length;
  if (need <= 0) return list.slice(0, 3);
  const others = new Set(
    state.words
      .map((w) => (poolLang === "en" ? w.en : w.ja))
      .filter((v) => v && v !== correct)
  );
  list.forEach((v) => others.delete(v));
  const extra = shuffle([...others]).slice(0, need);
  return list.concat(extra);
}

function buildQuestion(spec) {
  const { word, direction } = spec;
  const isJa2En = direction === "ja2en";
  const prompt = isJa2En ? word.ja : word.en;
  const answer = isJa2En ? word.en : word.ja;
  let wrongPool = isJa2En ? word.wrongEn.slice() : word.wrongJa.slice();
  wrongPool = fillMissingWrong(wrongPool, answer, isJa2En ? "en" : "ja");
  const choices = shuffle([answer, ...wrongPool]);
  return {
    spec,
    chapter: word.chapter,
    direction,
    prompt,
    answer,
    choices,
    correctIndex: choices.indexOf(answer),
  };
}

/* ============================================================
 * クイズ進行
 * ============================================================ */
function startQuiz(specs) {
  state.currentSpecs = specs;
  state.currentQuestions = specs.map(buildQuestion);
  state.qIndex = 0;
  state.score = 0;
  state.wrongSpecs = [];
  state.answering = false;
  showScreen("quiz");
  renderQuestion();
}

function renderQuestion() {
  const q = state.currentQuestions[state.qIndex];
  el("progress-label").textContent = `${state.qIndex + 1} / ${state.currentQuestions.length}`;
  el("progress-fill").style.width = `${(state.qIndex / state.currentQuestions.length) * 100}%`;
  el("quiz-chapter-tag").textContent = `第${q.chapter}章`;
  el("quiz-direction").textContent = q.direction === "ja2en" ? "日本語 → 英語" : "英語 → 日本語";
  el("quiz-question").textContent = q.prompt;

  const grid = el("quiz-choices");
  grid.innerHTML = "";
  q.choices.forEach((choice, i) => {
    const btn = document.createElement("button");
    btn.className = "choice-btn";
    btn.textContent = choice;
    btn.addEventListener("click", () => onAnswer(i));
    grid.appendChild(btn);
  });
  state.answering = false;
}

function onAnswer(choiceIndex) {
  if (state.answering) return;
  state.answering = true;

  const q = state.currentQuestions[state.qIndex];
  const buttons = el("quiz-choices").querySelectorAll(".choice-btn");
  const isCorrect = choiceIndex === q.correctIndex;

  buttons.forEach((b, i) => {
    b.disabled = true;
    if (i === q.correctIndex) b.classList.add("is-correct");
    else if (i === choiceIndex) b.classList.add("is-wrong");
    else b.classList.add("is-dim");
  });

  if (isCorrect) {
    state.score++;
  } else {
    state.wrongSpecs.push(q.spec);
  }

  const delay = isCorrect ? FEEDBACK_DELAY_CORRECT : FEEDBACK_DELAY_WRONG;
  setTimeout(() => {
    state.qIndex++;
    if (state.qIndex < state.currentQuestions.length) {
      renderQuestion();
    } else {
      finishQuiz();
    }
  }, delay);
}

function finishQuiz() {
  el("progress-fill").style.width = "100%";
  const total = state.currentQuestions.length;
  const score = state.score;
  const rate = Math.round((score / total) * 100);

  el("result-score").textContent = `${score} / ${total}`;
  el("result-rate").textContent = `正答率 ${rate}%`;

  // 重複除去（同じ単語を複数回間違えた場合はまとめる）
  const uniqueWrong = [];
  const seen = new Set();
  state.wrongSpecs.forEach((spec) => {
    const key = spec.word.ja + "|" + spec.word.en;
    if (!seen.has(key)) { seen.add(key); uniqueWrong.push(spec); }
  });

  state.lastUniqueWrongSpecs = uniqueWrong;
  const retryWrongBtn = el("btn-retry-wrong");
  retryWrongBtn.disabled = uniqueWrong.length === 0;
  retryWrongBtn.style.display = uniqueWrong.length === 0 ? "none" : "block";

  showScreen("result");
}

el("btn-retry-wrong").addEventListener("click", () => {
  const specs = state.lastUniqueWrongSpecs.map((s) => ({ word: s.word, direction: pickDirection(s.word) }));
  startQuiz(shuffle(specs));
});

el("btn-retry-same").addEventListener("click", () => {
  const specs = state.currentSpecs.map((s) => ({ word: s.word, direction: s.direction }));
  startQuiz(shuffle(specs));
});

el("btn-back-select").addEventListener("click", () => {
  showScreen("select");
});

/* ============================================================
 * ホームナビ（下部タブ）
 * ============================================================ */
document.querySelectorAll(".nav-btn").forEach((btn) => {
  btn.addEventListener("click", () => showScreen(btn.dataset.screen));
});

/* ============================================================
 * 単語帳（一覧）画面
 * ============================================================ */
function buildWordlistScreen() {
  const chipRow = el("wordlist-chips");
  chipRow.innerHTML = "";

  const allChip = document.createElement("button");
  allChip.className = "chip-btn is-active";
  allChip.textContent = "すべて";
  allChip.dataset.chapter = "all";
  chipRow.appendChild(allChip);

  state.chapters.forEach((ch) => {
    const chip = document.createElement("button");
    chip.className = "chip-btn";
    chip.textContent = `第${ch}章`;
    chip.dataset.chapter = String(ch);
    chipRow.appendChild(chip);
  });

  chipRow.querySelectorAll(".chip-btn").forEach((chip) => {
    chip.addEventListener("click", () => {
      state.wordlistChapter = chip.dataset.chapter;
      chipRow.querySelectorAll(".chip-btn").forEach((c) => c.classList.toggle("is-active", c === chip));
      renderWordlist();
    });
  });

  renderWordlist();
}

function renderWordlist() {
  const container = el("wordlist-items");
  container.innerHTML = "";

  const filterAll = state.wordlistChapter === "all";
  const targetChapter = filterAll ? null : parseInt(state.wordlistChapter, 10);
  const chaptersToShow = filterAll ? state.chapters : [targetChapter];

  chaptersToShow.forEach((ch) => {
    const words = state.words.filter((w) => w.chapter === ch);
    if (words.length === 0) return;
    if (filterAll) {
      const label = document.createElement("div");
      label.className = "wordlist-chapter-label";
      label.textContent = `第${ch}章`;
      container.appendChild(label);
    }
    words.forEach((w) => {
      const row = document.createElement("div");
      row.className = "wordlist-row";
      row.innerHTML = `<span class="wl-ja">${w.ja}</span><span class="wl-en">${w.en}</span>`;
      container.appendChild(row);
    });
  });
}

/* ============================================================
 * お知らせ画面
 * ============================================================ */
function updateAnnounceDot() {
  const dot = el("nav-announce-dot");
  if (state.announcements.length === 0) { dot.classList.remove("is-visible"); return; }
  const latest = state.announcements[0].date;
  const lastSeen = localStorage.getItem("vocab-quiz-announce-seen") || "";
  dot.classList.toggle("is-visible", latest > lastSeen);
}

function renderAnnounceBanner() {
  const banner = el("announce-banner");
  if (state.announcements.length === 0) return;
  const latest = state.announcements[0];
  el("announce-banner-text").textContent = latest.title;
  banner.dataset.ready = "1";
}

function renderAnnouncements() {
  const list = el("announce-list");
  list.innerHTML = "";
  if (state.announcements.length === 0) {
    const empty = document.createElement("div");
    empty.className = "announce-empty";
    empty.textContent = "お知らせはありません";
    list.appendChild(empty);
    return;
  }
  state.announcements.forEach((a) => {
    const item = document.createElement("div");
    item.className = "announce-item";
    item.innerHTML = `
      <div class="announce-date">${a.date}</div>
      <div class="announce-title">${a.title}</div>
      <div class="announce-body">${a.body || ""}</div>
    `;
    list.appendChild(item);
  });
}

el("announce-banner").addEventListener("click", () => showScreen("announcements"));

/* ============================================================
 * 起動
 * ============================================================ */
init();
