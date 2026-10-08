const status = document.querySelector("#status");
const categories = document.querySelector("#categories");

function renderCategories(categoryData) {
  categories.replaceChildren(
    ...categoryData.map((category) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = category.label;
      button.title = category.description;
      button.addEventListener("click", () => {
        categories.querySelectorAll("button").forEach((item) => {
          item.classList.remove("selected");
          item.setAttribute("aria-pressed", "false");
        });
        button.classList.add("selected");
        button.setAttribute("aria-pressed", "true");
      });
      button.setAttribute("aria-pressed", "false");
      return button;
    }),
  );
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
  } catch {
    status.textContent = "Service unavailable";
  }
}

loadApp();
