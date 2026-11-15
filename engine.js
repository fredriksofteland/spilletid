/*
 * Spilletid engine: pure rotation logic, no DOM, no clock.
 *
 * Every function takes the match time `e` (seconds of played match clock,
 * pauses excluded) as an argument, so the same code runs in the browser,
 * in tests, and later inside a native wrapper.
 *
 * Fairness rule: the player with the MOST total time (this session's carry-over
 * + time on the pitch this match) goes OUT, the bench player with the LEAST
 * total time comes IN. Because suggestions are computed from actual time,
 * manual swaps, injuries and pauses are absorbed automatically.
 *
 * State is plain JSON so it can be saved and restored (page reloads, native
 * handoff). Written as ES2017 without optional chaining so it also runs on
 * old Node versions for the tests.
 */
(function (root) {
  "use strict";

  function nameCmp(names) {
    return function (a, b) {
      var x = names[a] || "", y = names[b] || "";
      return x < y ? -1 : x > y ? 1 : 0;
    };
  }

  /** Number of auto periods for a match length and a wanted interval (minutes). */
  function segmentsFor(lenMin, intervalMin) {
    return Math.max(1, Math.round(lenMin / intervalMin));
  }

  /**
   * opts: {
   *   players: [{id, name, carry}],   // rotating outfield players (keeper excluded)
   *   slots: number,                  // outfield places on the pitch
   *   lenSec: number,                 // match length in seconds
   *   mode: "auto" | "manual",
   *   segCount: number,               // auto periods (segmentsFor)
   *   keeperId, keeperName            // optional, informational
   * }
   */
  function create(opts) {
    var names = {}, carry = {}, acc = {}, since = {};
    opts.players.forEach(function (p) {
      names[p.id] = p.name;
      carry[p.id] = p.carry || 0;
      acc[p.id] = 0;
      since[p.id] = 0;
    });
    var cmp = nameCmp(names);
    // Least carried-over time starts, so the day evens out across matches.
    var order = opts.players.map(function (p) { return p.id; }).sort(function (a, b) {
      return (carry[a] - carry[b]) || cmp(a, b);
    });
    var segCount = Math.max(1, opts.segCount || 1);
    return {
      v: 1,
      mode: opts.mode === "manual" ? "manual" : "auto",
      slots: opts.slots,
      lenSec: opts.lenSec,
      segCount: segCount,
      intSec: opts.lenSec / segCount,
      keeperId: opts.keeperId || null,
      keeperName: opts.keeperName || null,
      names: names,
      carry: carry,
      acc: acc,          // seconds on the pitch, credited up to lastCredit
      since: since,      // match time the player entered the pitch / bench
      onField: order.slice(0, opts.slots),
      bench: order.slice(opts.slots),
      out: [],           // injured / unavailable, not in rotation
      lastCredit: 0,
      subIdx: 0,         // auto boundaries already passed
      log: []
    };
  }

  function credit(s, e) {
    var dt = Math.max(0, e - s.lastCredit);
    if (dt > 0) s.onField.forEach(function (id) { s.acc[id] += dt; });
    if (e > s.lastCredit) s.lastCredit = e;
  }

  function fieldTime(s, id, e) {
    var live = s.onField.indexOf(id) >= 0 ? Math.max(0, e - s.lastCredit) : 0;
    return (s.acc[id] || 0) + live;
  }

  function total(s, id, e) {
    return (s.carry[id] || 0) + fieldTime(s, id, e);
  }

  /** Field players, most deserving of a rest first. */
  function rankOut(s, e) {
    var cmp = nameCmp(s.names);
    return s.onField.slice().sort(function (a, b) {
      return (total(s, b, e) - total(s, a, e)) || (s.since[a] - s.since[b]) || cmp(a, b);
    });
  }

  /** Bench players, most deserving of playing time first. */
  function rankIn(s, e) {
    var cmp = nameCmp(s.names);
    return s.bench.slice().sort(function (a, b) {
      return (total(s, a, e) - total(s, b, e)) || (s.since[a] - s.since[b]) || cmp(a, b);
    });
  }

  /**
   * Swaps worth making at time e: pair the most-played field player with the
   * least-played bench player, and keep pairing while it improves fairness by
   * more than a quarter period. Avoids pointless swaps between equals.
   */
  function suggest(s, e, max) {
    var outs = rankOut(s, e), ins = rankIn(s, e), pairs = [];
    var lim = Math.min(outs.length, ins.length, max == null ? Infinity : max);
    var margin = s.intSec * 0.25;
    for (var i = 0; i < lim; i++) {
      if (total(s, outs[i], e) - total(s, ins[i], e) > margin) pairs.push([outs[i], ins[i]]);
      else break;
    }
    return pairs;
  }

  /** Single best swap right now, regardless of margin (manual mode). */
  function best(s, e) {
    var o = rankOut(s, e)[0], i = rankIn(s, e)[0];
    return o && i ? [o, i] : null;
  }

  /** Apply swaps. pairs = [[outId, inId], ...]. Returns the pairs applied. */
  function swap(s, e, pairs, why) {
    credit(s, e);
    var done = [];
    pairs.forEach(function (p) {
      var o = p[0], i = p[1];
      var fo = s.onField.indexOf(o), bi = s.bench.indexOf(i);
      if (fo < 0 || bi < 0) return;
      s.onField.splice(fo, 1, i);
      s.bench.splice(bi, 1);
      s.bench.push(o);
      s.since[i] = e;
      s.since[o] = e;
      done.push([o, i]);
    });
    if (done.length) {
      s.log.push({
        at: e,
        outs: done.map(function (p) { return p[0]; }),
        ins: done.map(function (p) { return p[1]; }),
        why: why || "manual"
      });
    }
    return done;
  }

  /** Match time of the next auto boundary, or null. */
  function nextDue(s) {
    if (s.mode !== "auto") return null;
    var k = s.subIdx + 1;
    return k <= s.segCount - 1 ? k * s.intSec : null;
  }

  /**
   * Call on every tick in auto mode. Applies any boundary that has been
   * reached (also catches up if the page was asleep). Returns the swaps
   * applied in this call, or [] if none.
   */
  function stepAuto(s, e) {
    var applied = [];
    var due = nextDue(s);
    while (due != null && e >= due) {
      applied = applied.concat(swap(s, due, suggest(s, due), "auto"));
      s.subIdx++;
      due = nextDue(s);
    }
    return applied;
  }

  /**
   * Take a player out of the rotation (injury). If they are on the pitch, the
   * replacement (or the best bench player) comes on. Returns the replacement id.
   */
  function sideline(s, e, id, replacementId) {
    credit(s, e);
    var rep = null;
    var fi = s.onField.indexOf(id);
    if (fi >= 0) {
      rep = replacementId && s.bench.indexOf(replacementId) >= 0 ? replacementId : (rankIn(s, e)[0] || null);
      if (rep) {
        s.onField.splice(fi, 1, rep);
        s.bench.splice(s.bench.indexOf(rep), 1);
        s.since[rep] = e;
      } else {
        s.onField.splice(fi, 1); // nobody left: play one short
      }
      s.log.push({ at: e, outs: [id], ins: rep ? [rep] : [], why: "injury" });
    } else {
      var bi = s.bench.indexOf(id);
      if (bi >= 0) s.bench.splice(bi, 1);
    }
    if (s.out.indexOf(id) < 0) s.out.push(id);
    s.since[id] = e;
    return rep;
  }

  /** Bring an injured player back: onto the pitch if a place is free, else the bench. */
  function reinstate(s, e, id) {
    var oi = s.out.indexOf(id);
    if (oi < 0) return;
    credit(s, e);
    s.out.splice(oi, 1);
    if (s.onField.length < s.slots) s.onField.push(id);
    else s.bench.push(id);
    s.since[id] = e;
  }

  /**
   * Upcoming auto swaps if nothing is changed by hand, from time e.
   * [{at, outs, ins}] — only boundaries that actually swap someone.
   * Used for the "next swap" card and as the schedule handed to a native
   * lock-screen widget / notifications.
   */
  function project(s, e, maxSteps) {
    var c = JSON.parse(JSON.stringify(s));
    var res = [];
    credit(c, e);
    var due = nextDue(c), guard = 0;
    while (due != null && guard++ < 200 && res.length < (maxSteps || 100)) {
      var at = Math.max(due, e);
      var done = swap(c, at, suggest(c, at), "auto");
      c.subIdx++;
      if (done.length) {
        res.push({
          at: due,
          outs: done.map(function (p) { return p[0]; }),
          ins: done.map(function (p) { return p[1]; })
        });
      }
      due = nextDue(c);
    }
    return res;
  }

  /** Final seconds on the pitch per player for this match. */
  function finish(s, e) {
    credit(s, Math.min(e, s.lenSec));
    var r = {};
    Object.keys(s.acc).forEach(function (id) { r[id] = s.acc[id]; });
    return r;
  }

  var Engine = {
    segmentsFor: segmentsFor,
    create: create,
    credit: credit,
    fieldTime: fieldTime,
    total: total,
    rankOut: rankOut,
    rankIn: rankIn,
    suggest: suggest,
    best: best,
    swap: swap,
    nextDue: nextDue,
    stepAuto: stepAuto,
    sideline: sideline,
    reinstate: reinstate,
    project: project,
    finish: finish
  };

  if (typeof module !== "undefined" && module.exports) module.exports = Engine;
  else root.SpilletidEngine = Engine;
})(this);
