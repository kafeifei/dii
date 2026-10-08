import { angleTo, dist, turnToward, type P2 } from '../core/math';
import { findPath } from '../world/pathfinding';
import type { Actor } from './actor';
import type { Game } from './game';

export function moveBy(g: Game, a: Actor, dx: number, dz: number) {
  const map = g.level.map;
  // sub-step large moves so we never tunnel through a wall
  const len = Math.hypot(dx, dz);
  const steps = Math.max(1, Math.ceil(len / 0.3));
  for (let i = 0; i < steps; i++) {
    const next = { x: a.pos.x + dx / steps, z: a.pos.z + dz / steps };
    a.pos = map.resolveCircle(next, a.radius);
  }
}

export function face(a: Actor, p: P2, dt: number, rate = 14) {
  if (Math.abs(p.x - a.pos.x) + Math.abs(p.z - a.pos.z) < 1e-4) return;
  a.facing = turnToward(a.facing, angleTo(a.pos, p), rate * dt);
}

export function faceNow(a: Actor, p: P2) {
  if (Math.abs(p.x - a.pos.x) + Math.abs(p.z - a.pos.z) < 1e-4) return;
  a.facing = angleTo(a.pos, p);
}

/**
 * Moves an actor toward a target using direct steering when there is a clear line,
 * or A* waypoints otherwise. Returns true when within stopDist.
 */
export function stepToward(g: Game, a: Actor, target: P2, speed: number, dt: number, stopDist = 0.1, maxNodes = 3000): boolean {
  const d = dist(a.pos, target);
  if (d <= stopDist) {
    a.path = null;
    return true;
  }
  const map = g.level.map;
  a.pathAge += dt;
  let waypoint: P2 = target;
  const direct = d < 2.5 || map.los(a.pos, target, a.radius * 0.7);
  if (!direct) {
    const needRepath =
      !a.path || a.path.length === 0 || a.pathAge > 0.6 || !a.pathTarget || dist(a.pathTarget, target) > 1.2;
    if (needRepath) {
      a.path = findPath(map, a.pos, target, maxNodes, a.radius * 0.7);
      a.pathTarget = { ...target };
      a.pathAge = 0;
    }
    if (a.path && a.path.length) {
      while (a.path.length > 1 && dist(a.pos, a.path[0]) < 0.25) a.path.shift();
      waypoint = a.path[0];
    }
  } else {
    a.path = null;
  }
  const dx = waypoint.x - a.pos.x;
  const dz = waypoint.z - a.pos.z;
  const len = Math.hypot(dx, dz) || 1;
  const step = Math.min(speed * dt, Math.max(0, d - stopDist * 0.5));
  moveBy(g, a, (dx / len) * step, (dz / len) * step);
  face(a, waypoint, dt);
  return dist(a.pos, target) <= stopDist;
}
