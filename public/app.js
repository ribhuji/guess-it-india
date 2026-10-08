const status = document.querySelector("#status");
const selectionView = document.querySelector("#selection-view");
const categories = document.querySelector("#categories");
const selectedCategory = document.querySelector("#selected-category");
const startGameButton = document.querySelector("#start-game");
const gameArea = document.querySelector("#game-area");
const gameCategory = document.querySelector("#game-category");
const questionsLeft = document.querySelector("#questions-left");
const giveUpButton = document.querySelector("#give-up");
const answer = document.querySelector("#answer");
const newGameButton = document.querySelector("#new-game");
const questionForm = document.querySelector("#question-form");
const questionInput = document.querySelector("#question-input");
const askQuestionButton = document.querySelector("#ask-question");
const history = document.querySelector("#history");
const gameMessage = document.querySelector("#game-message");

let selectedCategoryId = null;
let sessionId = null;

function rememberSession() {
  try { sessionStorage.setItem("guess-it-india-session", sessionId); } catch { /* convenience only */ }
}

function forgetSession() {
  try { sessionStorage.removeItem("guess-it-india-session"); } catch { /* convenience only */ }
}

function renderCategories(categoryData) {
  categories.replaceChildren(
    ...categoryData.map((category) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "category-button";
      button.innerHTML = `<span class="category-label"></span><span class="category-arrow" aria-hidden="true">→</span><span class="category-description"></span>`;
      button.querySelector(".category-label").textContent = category.label;
      button.querySelector(".category-description").textContent = category.description;
      button.title = category.description;
      button.addEventListener("click", () => {
        categories.querySelectorAll("button").forEach((item) => {
          item.classList.remove("selected");
          item.setAttribute("aria-pressed", "false");
        });
        button.classList.add("selected");
        button.setAttribute("aria-pressed", "true");
        selectedCategoryId = category.id;
        selectedCategory.textContent = `${category.label} selected`;
        selectedCategory.hidden = false;
        startGameButton.hidden = false;
      });
      button.setAttribute("aria-pressed", "false");
      return button;
    }),
  );
}

function resetToCategorySelection() {
  forgetSession();
  sessionId = null;
  selectedCategoryId = null;
  selectionView.hidden = false;
  categories.hidden = false;
  selectedCategory.hidden = true;
  startGameButton.hidden = true;
  gameArea.hidden = true;
  history.replaceChildren();
  gameMessage.textContent = "";
  questionInput.value = "";
  questionInput.disabled = false;
  askQuestionButton.disabled = false;
  answer.hidden = true;
  newGameButton.hidden = true;
  giveUpButton.hidden = false;
  categories.querySelectorAll("button").forEach((button) => {
    button.classList.remove("selected");
    button.setAttribute("aria-pressed", "false");
  });
}

function showGame(game) {
  selectionView.hidden = true;
  categories.hidden = true;
  selectedCategory.hidden = true;
  startGameButton.hidden = true;
  gameArea.hidden = false;
  gameCategory.textContent = game.category.label;
  questionsLeft.textContent = String(game.questionsLeft);
  history.replaceChildren();
  (game.history || []).forEach((entry) => appendHistory(entry.question, entry.answer));
  if (game.finished) finishGame();
  else {
    questionInput.disabled = false;
    askQuestionButton.disabled = false;
    questionInput.focus();
  }
}

async function startGame() {
  if (!selectedCategoryId) return;

  startGameButton.disabled = true;
  try {
    const response = await fetch("/api/games", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ category: selectedCategoryId }),
    });
    if (!response.ok) throw new Error("Unable to start game");

    const game = await response.json();
    sessionId = game.sessionId;
    rememberSession();
    showGame(game);
  } catch {
    status.textContent = "Unable to start game";
  } finally {
    startGameButton.disabled = false;
  }
}

function appendHistory(question, gameAnswer) {
  const entry = document.createElement("div");
  entry.className = "history-entry";
  entry.dataset.number = String(history.children.length + 1).padStart(2, "0");
  const userLine = document.createElement("p");
  userLine.textContent = `You: ${question}`;
  const gameLine = document.createElement("p");
  gameLine.textContent = answerMessage(gameAnswer);
  entry.append(userLine, gameLine);
  history.appendChild(entry);
}

function answerMessage(gameAnswer) {
  if (gameAnswer === "YES") return "Yes";
  if (gameAnswer === "NO") return "No";
  if (gameAnswer === "MAYBE") return "Maybe";
  return "Correct! 🎉";
}

function finishGame() {
  forgetSession();
  questionInput.disabled = true;
  askQuestionButton.disabled = true;
  giveUpButton.hidden = true;
  newGameButton.hidden = false;
}

async function submitQuestion(event) {
  event.preventDefault();
  if (!sessionId || askQuestionButton.disabled) return;

  const question = questionInput.value.trim();
  if (!question) return;

  askQuestionButton.disabled = true;
  questionInput.disabled = true;
  try {
    const response = await fetch(`/api/games/${sessionId}/questions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Unable to submit question");

    appendHistory(question, result.answer);
    questionsLeft.textContent = String(result.questionsLeft);
    questionInput.value = "";
    if (result.answer === "CORRECT") {
      gameMessage.textContent = `You got it in ${result.questionsUsed} questions.`;
      answer.textContent = result.secret;
      answer.hidden = false;
    } else if (result.finished) {
      gameMessage.textContent = "Out of questions! The answer was";
      answer.textContent = result.secret;
      answer.hidden = false;
    } else {
      gameMessage.textContent = answerMessage(result.answer);
    }

    if (result.finished) {
      forgetSession();
      finishGame();
    } else {
      questionInput.disabled = false;
      askQuestionButton.disabled = false;
      questionInput.focus();
    }
  } catch (error) {
    gameMessage.textContent = error instanceof Error ? error.message : "Unable to submit question. Try again.";
    questionInput.disabled = false;
    askQuestionButton.disabled = false;
    questionInput.focus();
  }
}

async function giveUp() {
  if (!sessionId) return;

  giveUpButton.disabled = true;
  try {
    const response = await fetch(`/api/games/${sessionId}/give-up`, { method: "POST" });
    if (!response.ok) throw new Error("Unable to give up");

    const result = await response.json();
    answer.textContent = result.secret;
    answer.hidden = false;
    gameMessage.textContent = "The answer was";
    forgetSession();
    finishGame();
    giveUpButton.hidden = true;
    newGameButton.hidden = false;
  } catch {
    gameMessage.textContent = "Unable to give up. Try again.";
  } finally {
    giveUpButton.disabled = false;
  }
}

async function restoreSession() {
  let savedSessionId = null;
  try { savedSessionId = sessionStorage.getItem("guess-it-india-session"); } catch { return; }
  if (!savedSessionId) return;
  try {
    const response = await fetch(`/api/games/${encodeURIComponent(savedSessionId)}`);
    if (!response.ok) { forgetSession(); return; }
    const game = await response.json();
    if (game.finished) { forgetSession(); return; }
    sessionId = savedSessionId;
    showGame(game);
  } catch {
    status.textContent = "Ready · saved game unavailable";
  }
}

async function loadApp() {
  try {
    const [healthResponse, categoriesResponse] = await Promise.all([
      fetch("/api/health"),
      fetch("/api/categories"),
    ]);
    if (!healthResponse.ok || !categoriesResponse.ok) {
      throw new Error("App bootstrap failed");
    }

    const health = await healthResponse.json();
    const categoryData = await categoriesResponse.json();
    if (health.ok !== true || !Array.isArray(categoryData.categories)) {
      throw new Error("Unexpected bootstrap response");
    }

    renderCategories(categoryData.categories);
    status.textContent = "Ready";
    status.classList.add("ready");
    await restoreSession();
  } catch {
    status.textContent = "Service unavailable";
  }
}

startGameButton.addEventListener("click", startGame);
giveUpButton.addEventListener("click", giveUp);
newGameButton.addEventListener("click", resetToCategorySelection);
questionForm.addEventListener("submit", submitQuestion);
loadApp();
