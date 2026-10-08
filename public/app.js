const status = document.querySelector("#status");

async function checkHealth() {
  try {
    const response = await fetch("/api/health");
    if (!response.ok) throw new Error("Health check failed");

    const health = await response.json();
    if (health.ok === true) {
      status.textContent = "Ready";
      status.classList.add("ready");
      return;
    }

    throw new Error("Unexpected health response");
  } catch {
    status.textContent = "Service unavailable";
  }
}

checkHealth();
