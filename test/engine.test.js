/* Run: node test/engine.test.js   (no dependencies) */
"use strict";
var assert = require("assert");
var E = require("../engine.js");

var passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log("  ok  " + name); }
  catch (err) { console.log("  FAIL " + name + "\n       " + err.message); process.exitCode = 1; }
}

var NAMES = ["Aksel", "Emma", "Leo", "Maja", "Noah", "Nora", "Oliver", "Sofie", "Ida", "Jonas", "Ella", "Filip", "Hedda", "Isak"];
function squad(n, carry) {
  return NAMES.slice(0, n).map(function (nm, i) { return { id: "p" + i, name: nm, carry: carry ? carry[i] || 0 : 0 }; });
}
function runAuto(s, step) {
  for (var e = 0; e <= s.lenSec; e += step || 1) E.stepAuto(s, e);
  return E.finish(s, s.lenSec);
}
function spread(times) {
  var v = Object.keys(times).map(function (k) { return times[k]; });
  return Math.max.apply(null, v) - Math.min.apply(null, v);
}

console.log("Engine tests");

test("fairness sweep: every config within one period of equal", function () {
  var worst = 0, configs = 0;
  [3, 4, 5, 6, 7, 8, 10].forEach(function (slots) {
    for (var n = slots + 1; n <= Math.min(slots + 6, NAMES.length); n++) {
      [10, 15, 20, 25, 30, 40].forEach(function (len) {
        [2.5, 3, 4].forEach(function (iv) {
          var s = E.create({ players: squad(n), slots: slots, lenSec: len * 60, mode: "auto", segCount: E.segmentsFor(len, iv) });
          var t = runAuto(s);
          var sp = spread(t) / s.intSec;
          configs++;
          if (sp > worst) worst = sp;
          assert.ok(sp <= 1.0001, "n=" + n + " slots=" + slots + " len=" + len + " iv=" + iv + " spread=" + sp.toFixed(2) + " periods");
        });
      });
    }
  });
  console.log("       " + configs + " configs, worst spread " + worst.toFixed(2) + " period");
});

test("total pitch time is conserved (slots x length)", function () {
  var s = E.create({ players: squad(8), slots: 5, lenSec: 1200, mode: "auto", segCount: 7 });
  var t = runAuto(s);
  var sum = Object.keys(t).reduce(function (a, k) { return a + t[k]; }, 0);
  assert.ok(Math.abs(sum - 5 * 1200) < 1e-6, "sum=" + sum);
});

test("8 players, 5 on pitch, 20 min: everyone gets 12:30 +- one period", function () {
  var s = E.create({ players: squad(8), slots: 5, lenSec: 1200, mode: "auto", segCount: 7 });
  var t = runAuto(s);
  Object.keys(t).forEach(function (k) {
    assert.ok(Math.abs(t[k] - 750) <= s.intSec, k + " " + t[k]);
  });
});

test("carry-over: players with less time earlier in the day start", function () {
  var carry = [600, 600, 600, 0, 0, 0, 0, 0];
  var s = E.create({ players: squad(8, carry), slots: 5, lenSec: 900, mode: "auto", segCount: 5 });
  ["p0", "p1", "p2"].forEach(function (id) { assert.ok(s.bench.indexOf(id) >= 0, id + " should start on bench"); });
});

test("carry-over evens out across two matches", function () {
  var s1 = E.create({ players: squad(7), slots: 5, lenSec: 900, mode: "auto", segCount: 5 });
  var t1 = runAuto(s1);
  var carry = squad(7).map(function (p) { return t1[p.id]; });
  var s2 = E.create({ players: squad(7, carry), slots: 5, lenSec: 900, mode: "auto", segCount: 5 });
  var t2 = runAuto(s2);
  var both = {};
  Object.keys(t1).forEach(function (k) { both[k] = t1[k] + t2[k]; });
  assert.ok(spread(both) <= s2.intSec + 1e-6, "day spread " + spread(both));
});

test("manual swap: the queue adapts to who actually played", function () {
  var s = E.create({ players: squad(7), slots: 5, lenSec: 1200, mode: "auto", segCount: 6 });
  // At 1:00 the coach keeps the first bench player out and puts the second in.
  var benchFirst = E.rankIn(s, 60)[0], benchSecond = E.rankIn(s, 60)[1];
  var outId = E.rankOut(s, 60)[0];
  E.swap(s, 60, [[outId, benchSecond]], "manual");
  // The player kept on the bench must now be first in line.
  assert.strictEqual(E.rankIn(s, 120)[0], benchFirst);
  // And the player who just came on is not suggested to go off at the next boundary.
  var next = E.suggest(s, E.nextDue(s));
  next.forEach(function (p) { assert.notStrictEqual(p[0], benchSecond); });
});

test("manual mode never swaps on its own", function () {
  var s = E.create({ players: squad(8), slots: 5, lenSec: 1200, mode: "manual", segCount: 7 });
  var before = s.onField.slice();
  for (var e = 0; e <= 1200; e += 5) E.stepAuto(s, e);
  assert.deepStrictEqual(s.onField, before);
  assert.strictEqual(E.nextDue(s), null);
  assert.ok(E.best(s, 300), "still suggests a swap");
});

test("injury: player leaves rotation, replacement comes on, time stops", function () {
  var s = E.create({ players: squad(8), slots: 5, lenSec: 1200, mode: "auto", segCount: 7 });
  var hurt = s.onField[0];
  var rep = E.sideline(s, 100, hurt);
  assert.ok(rep, "replacement chosen");
  assert.ok(s.onField.indexOf(rep) >= 0);
  assert.ok(s.onField.indexOf(hurt) < 0 && s.bench.indexOf(hurt) < 0);
  assert.strictEqual(s.onField.length, 5);
  var t = runAuto(s);
  assert.ok(Math.abs(t[hurt] - 100) < 1e-6, "hurt player stops at 100s, got " + t[hurt]);
  E.reinstate(s, 1200, hurt);
  assert.ok(s.bench.indexOf(hurt) >= 0, "back on the bench");
});

test("projection matches what auto actually does", function () {
  var s = E.create({ players: squad(9), slots: 5, lenSec: 1500, mode: "auto", segCount: 8 });
  var plan = E.project(s, 0);
  var real = [];
  for (var e = 0; e <= s.lenSec; e++) {
    var done = E.stepAuto(s, e);
    if (done.length) real.push(done.map(function (p) { return p[1]; }).join(","));
  }
  assert.deepStrictEqual(plan.map(function (p) { return p.ins.join(","); }), real);
});

test("catch-up: a tab asleep for minutes applies all missed boundaries", function () {
  var a = E.create({ players: squad(8), slots: 5, lenSec: 1200, mode: "auto", segCount: 7 });
  var b = JSON.parse(JSON.stringify(a));
  for (var e = 0; e <= 1200; e++) E.stepAuto(a, e);
  E.stepAuto(b, 100); E.stepAuto(b, 1200); // asleep from 1:40 to the end
  assert.deepStrictEqual(E.finish(a, 1200), E.finish(b, 1200));
});

test("no bench: no swaps, everyone plays the full match", function () {
  var s = E.create({ players: squad(5), slots: 5, lenSec: 900, mode: "auto", segCount: 5 });
  var t = runAuto(s);
  Object.keys(t).forEach(function (k) { assert.strictEqual(t[k], 900); });
  assert.strictEqual(E.project(s, 0).length, 0);
});

test("state survives a JSON round trip (page reload)", function () {
  var s = E.create({ players: squad(8), slots: 5, lenSec: 1200, mode: "auto", segCount: 7 });
  E.stepAuto(s, 400);
  var r = JSON.parse(JSON.stringify(s));
  E.stepAuto(s, 1200); E.stepAuto(r, 1200);
  assert.deepStrictEqual(E.finish(s, 1200), E.finish(r, 1200));
});

console.log(passed + " passed" + (process.exitCode ? ", some FAILED" : ""));
