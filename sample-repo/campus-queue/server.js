const express = require("express");
const path = require("path");
const { createQueue, join, position, callNext, markDone, leave } = require("./src/queue");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const counters = {
  "main-canteen": createQueue("Main Canteen"),
  "juice-corner": createQueue("Juice Corner"),
};

app.get("/api/counters", (req, res) => {
  res.json(Object.keys(counters).map((id) => ({ id, name: counters[id].counter, waiting: counters[id].tokens.filter((t) => t.status === "waiting").length })));
});

app.get("/api/counters/:id", (req, res) => {
  const queue = counters[req.params.id];
  if (!queue) return res.status(404).json({ error: "unknown counter" });
  res.json({ counter: queue.counter, tokens: queue.tokens });
});

app.post("/api/counters/:id/join", (req, res) => {
  const queue = counters[req.params.id];
  if (!queue) return res.status(404).json({ error: "unknown counter" });
  try {
    const token = join(queue, req.body.name);
    res.status(201).json({ token, position: position(queue, token.id) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post("/api/counters/:id/next", (req, res) => {
  const queue = counters[req.params.id];
  if (!queue) return res.status(404).json({ error: "unknown counter" });
  const token = callNext(queue);
  if (!token) return res.status(409).json({ error: "queue is empty" });
  res.json({ token });
});

app.post("/api/counters/:id/done/:tokenId", (req, res) => {
  const queue = counters[req.params.id];
  if (!queue) return res.status(404).json({ error: "unknown counter" });
  const token = markDone(queue, Number(req.params.tokenId));
  if (!token) return res.status(404).json({ error: "unknown token" });
  res.json({ token });
});

app.post("/api/counters/:id/leave/:tokenId", (req, res) => {
  const queue = counters[req.params.id];
  if (!queue) return res.status(404).json({ error: "unknown counter" });
  if (!leave(queue, Number(req.params.tokenId))) return res.status(404).json({ error: "unknown token" });
  res.json({ ok: true });
});

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => console.log(`Campus Queue listening on ${PORT}`));
}
module.exports = app;
