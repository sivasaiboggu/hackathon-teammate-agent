const counterSelect = document.getElementById("counter");
const nameInput = document.getElementById("name");
const statusEl = document.getElementById("status");
const boardEl = document.getElementById("board");

async function loadCounters() {
  const res = await fetch("/api/counters");
  const counters = await res.json();
  counterSelect.innerHTML = counters.map((c) => `<option value="${c.id}">${c.name} (${c.waiting} waiting)</option>`).join("");
}

async function loadBoard() {
  const res = await fetch(`/api/counters/${counterSelect.value}`);
  const data = await res.json();
  boardEl.innerHTML = data.tokens.filter((t) => t.status !== "done").map((t) => `<li>#${t.id} ${t.name} — ${t.status}</li>`).join("");
}

document.getElementById("join").addEventListener("click", async () => {
  const res = await fetch(`/api/counters/${counterSelect.value}/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: nameInput.value }),
  });
  const data = await res.json();
  statusEl.textContent = res.ok ? `You are token #${data.token.id}, position ${data.position} in line.` : (data.error || "Could not join.");
  loadBoard();
});

document.getElementById("refresh").addEventListener("click", loadBoard);
counterSelect.addEventListener("change", loadBoard);
loadCounters().then(loadBoard);
