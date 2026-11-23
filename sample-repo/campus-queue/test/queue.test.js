const test = require("node:test");
const assert = require("node:assert/strict");
const { createQueue, join, position, callNext, markDone, leave } = require("../src/queue");

test("join hands out tokens in order", () => {
  const q = createQueue("Main Canteen");
  const a = join(q, "Ananya");
  const b = join(q, "Rahul");
  assert.equal(a.id, 1);
  assert.equal(b.id, 2);
  assert.equal(position(q, b.id), 2);
});

test("callNext picks the earliest waiting token", () => {
  const q = createQueue("Main Canteen");
  join(q, "Ananya");
  join(q, "Rahul");
  assert.equal(callNext(q).name, "Ananya");
  assert.equal(position(q, 2), 1);
});

test("leave removes a token and done marks it", () => {
  const q = createQueue("Juice Corner");
  const a = join(q, "Meera");
  assert.equal(leave(q, a.id), true);
  assert.equal(position(q, a.id), null);
  const b = join(q, "Kiran");
  assert.equal(markDone(q, b.id).status, "done");
});

test("join rejects a blank name", () => {
  const q = createQueue("Main Canteen");
  assert.throws(() => join(q, "   "), /name is required/);
});
