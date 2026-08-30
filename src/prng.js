// Seeded PRNG (mulberry32). All engine randomness flows through one instance
// whose state lives in the game state, so seed + order log replays exactly.

export function makePrng(state) {
  // state: a uint32. Mutated in place via the returned object.
  const rng = {
    state: state >>> 0,
    next() {
      let t = (this.state = (this.state + 0x6d2b79f5) >>> 0);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    // integer in [0, n)
    int(n) {
      return Math.floor(this.next() * n);
    },
    pick(arr) {
      return arr[this.int(arr.length)];
    }
  };
  return rng;
}

export function seedFromString(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
