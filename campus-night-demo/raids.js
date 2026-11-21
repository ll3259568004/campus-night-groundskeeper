import { entrances } from './field-map.js';

export const WARNING_SECONDS = 4;
export const standThreats = [
  [{ entry: entrances.narrow, lamp: 1, kind: 'weed', escorts: 3 }],
  [
    { entry: entrances.outside, lamp: 1, kind: 'weed', escorts: 2 },
    { entry: entrances.outside, lamp: 0, kind: 'weed', escorts: 2 },
  ],
];
export const fieldThreats = [
  [{ entry: entrances.east, lamp: 2, kind: 'weed', escorts: 4 }],
  [
    { entry: entrances.east, lamp: 2, kind: 'boss', escorts: 4 },
    { entry: entrances.south, lamp: 1, kind: 'weed', escorts: 4 },
  ],
];

function parentsFrom(start, tiles, accepts) {
  const parent = new Int16Array(tiles.length).fill(-1);
  const queue = [start];
  parent[start] = start;
  for (let n = 0; n < queue.length; n++) {
    for (const next of tiles[queue[n]].neighbors) {
      if (parent[next] !== -1 || !accepts(next)) continue;
      parent[next] = queue[n];
      queue.push(next);
    }
  }
  return parent;
}

function routeTo(parent, destination) {
  if (parent[destination] === -1) return [];
  const path = [destination];
  while (parent[path.at(-1)] !== path.at(-1)) path.push(parent[path.at(-1)]);
  return path.reverse();
}

export function planThreat(spec, { tiles, lamps, generator, fixtures, open, liveNetwork, excluded }) {
  const lamp = lamps[spec.lamp];
  const approach = parentsFrom(spec.entry.index, tiles, open);
  const energized = parentsFrom(lamp.index, tiles, (index) => tiles[index].live && open(index));
  const lampPath = routeTo(energized, generator.index);
  // Prefer real points on the lamp's supply route, with space between simultaneous threats.
  const reachable = lampPath.slice(1, -1).filter((index) => !excluded.has(index) && approach[index] !== -1 &&
    index !== spec.entry.index && !fixtures.has(index));
  const nearby = reachable.filter((index) => tiles[index].opens === tiles[lamp.index].opens);
  const candidates = nearby.length ? nearby : reachable;
  candidates.sort((a, b) => {
    const priority = (index) => Math.abs(tiles[index].col - lamp.col) + Math.abs(tiles[index].row - lamp.row);
    return priority(a) - priority(b);
  });
  if (!candidates.length) return null;
  const target = candidates.find((index) => !liveNetwork(index).has(lamp.index)) ?? candidates[0];
  const path = routeTo(approach, target);
  const continuation = lampPath.slice(lampPath.indexOf(target) + 1, -1);
  for (const index of continuation.slice(0, 4)) {
    if (fixtures.has(index) || tiles[index].opens !== tiles[target].opens) break;
    path.push(index);
  }
  return { ...spec, target, path, actor: null, pending: new Map(), escortCount: 0, nextEscortAt: 0 };
}
