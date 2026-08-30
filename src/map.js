// Warp-lane graph helpers. Pure functions over the static map data + game state.

export function buildGraph(mapData) {
  const nodes = new Map();
  for (const n of mapData.nodes) nodes.set(n.id, n);
  const adj = new Map(); // id -> [{to, length}]
  for (const n of mapData.nodes) adj.set(n.id, []);
  for (const lane of mapData.lanes) {
    if (!nodes.has(lane.a) || !nodes.has(lane.b)) {
      throw new Error(`Lane references unknown node: ${lane.a} - ${lane.b}`);
    }
    adj.get(lane.a).push({ to: lane.b, length: lane.length ?? 1 });
    adj.get(lane.b).push({ to: lane.a, length: lane.length ?? 1 });
  }
  return { nodes, adj, blocs: mapData.blocs ?? {} };
}

export function isHomeSphere(node) {
  return node.region.endsWith("_HOME");
}

// Deterrence rule: a faction may enter contested nodes and its own home sphere only.
export function canEnter(graph, nodeId, faction) {
  const node = graph.nodes.get(nodeId);
  if (!node) return false;
  if (!isHomeSphere(node)) return true;
  return node.region === `${faction}_HOME`;
}

export function neighbors(graph, nodeId) {
  return graph.adj.get(nodeId) ?? [];
}

// Shortest path (in lane-turns) from `from` to `to` for `faction`, honoring the
// deterrence rule. Returns array of node ids excluding `from`, or null.
export function shortestPath(graph, from, to, faction) {
  if (from === to) return [];
  const dist = new Map([[from, 0]]);
  const prev = new Map();
  const queue = [[0, from]];
  while (queue.length) {
    queue.sort((x, y) => x[0] - y[0]); // small graphs; a heap is unnecessary
    const [d, cur] = queue.shift();
    if (cur === to) break;
    if (d > (dist.get(cur) ?? Infinity)) continue;
    for (const { to: nxt, length } of neighbors(graph, cur)) {
      if (!canEnter(graph, nxt, faction)) continue;
      const nd = d + length;
      if (nd < (dist.get(nxt) ?? Infinity)) {
        dist.set(nxt, nd);
        prev.set(nxt, cur);
        queue.push([nd, nxt]);
      }
    }
  }
  if (!prev.has(to)) return null;
  const path = [];
  for (let cur = to; cur !== from; cur = prev.get(cur)) path.unshift(cur);
  return path;
}

// Set of node ids in supply for `faction`: within tuning.supplyRadius lane-hops
// of a friendly starbase/outpost, traced only through nodes not enemy-owned.
export function supplySet(graph, state, faction, tuning) {
  const sources = [];
  for (const [id, node] of graph.nodes) {
    if (node.base && ownerOf(state, id) === faction) sources.push(id);
  }
  const inSupply = new Set(sources);
  let frontier = sources.map((id) => [id, 0]);
  while (frontier.length) {
    const next = [];
    for (const [id, d] of frontier) {
      for (const { to, length } of neighbors(graph, id)) {
        const nd = d + length;
        if (nd > tuning.supplyRadius) continue;
        const owner = ownerOf(state, to);
        const hostile = owner !== faction && owner !== "IND";
        if (hostile) continue;
        if (!inSupply.has(to)) {
          inSupply.add(to);
          next.push([to, nd]);
        }
      }
    }
    frontier = next;
  }
  return inSupply;
}

export function ownerOf(state, nodeId) {
  return state.worlds[nodeId]?.owner ?? "IND";
}
