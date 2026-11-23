// Campus Queue — in-memory queue logic. No database: state resets on restart.
// A queue is a list of tokens: { id, name, joinedAt, status }.
// status is "waiting", "called" or "done".
function createQueue(counterName) {
  return { counter: counterName, tokens: [], nextNumber: 1 };
}

function join(queue, name) {
  if (!name || !name.trim()) throw new Error("name is required");
  const token = { id: queue.nextNumber, name: name.trim(), joinedAt: new Date().toISOString(), status: "waiting" };
  queue.nextNumber += 1;
  queue.tokens.push(token);
  return token;
}

function position(queue, tokenId) {
  const waiting = queue.tokens.filter((t) => t.status === "waiting");
  const index = waiting.findIndex((t) => t.id === tokenId);
  return index === -1 ? null : index + 1;
}

function callNext(queue) {
  const next = queue.tokens.find((t) => t.status === "waiting");
  if (!next) return null;
  next.status = "called";
  return next;
}

function markDone(queue, tokenId) {
  const token = queue.tokens.find((t) => t.id === tokenId);
  if (!token) return null;
  token.status = "done";
  return token;
}

function leave(queue, tokenId) {
  const before = queue.tokens.length;
  queue.tokens = queue.tokens.filter((t) => t.id !== tokenId);
  return queue.tokens.length < before;
}

module.exports = { createQueue, join, position, callNext, markDone, leave };
