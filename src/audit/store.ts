import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { buildSampleEngagement } from "./seed.js";
import type { Engagement } from "./types.js";
import { parseEngagement } from "./validate.js";

export interface Store {
  list(): Engagement[];
  get(id: string): Engagement | undefined;
  save(engagement: Engagement): Engagement;
  remove(id: string): boolean;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function createMemoryStore(initial: Engagement[] = [], persist?: (items: Engagement[]) => void): Store {
  let items = initial.map((item) => clone(item));
  const write = () => persist?.(items.map((item) => clone(item)));
  return {
    list() {
      return items.map((item) => clone(item));
    },
    get(id) {
      const found = items.find((item) => item.id === id);
      return found ? clone(found) : undefined;
    },
    save(engagement) {
      const existing = items.find((item) => item.id === engagement.id);
      const next = clone(engagement);
      next.createdAt = existing?.createdAt ?? next.createdAt;
      next.updatedAt = new Date().toISOString();
      if (existing) {
        items = items.map((item) => (item.id === next.id ? next : item));
      } else {
        items.push(next);
      }
      write();
      return clone(next);
    },
    remove(id) {
      const next = items.filter((item) => item.id !== id);
      const removed = next.length !== items.length;
      items = next;
      if (removed) write();
      return removed;
    },
  };
}

export function defaultDataPath(): string {
  return process.env.FIELDNOTE_DATA || path.join(process.cwd(), "data", "fieldnote.json");
}

export function createFileStore(filePath = defaultDataPath()): Store {
  const initial = readEngagements(filePath);
  const persist = (items: Engagement[]) => {
    mkdirSync(path.dirname(filePath), { recursive: true });
    const temporary = `${filePath}.tmp`;
    writeFileSync(temporary, JSON.stringify({ engagements: items }, null, 2));
    renameSync(temporary, filePath);
  };
  if (!existsSync(filePath)) persist(initial);
  return createMemoryStore(initial, persist);
}

function readEngagements(filePath: string): Engagement[] {
  if (!existsSync(filePath)) return [buildSampleEngagement()];
  const raw = JSON.parse(readFileSync(filePath, "utf8")) as { engagements?: unknown };
  if (!Array.isArray(raw.engagements)) {
    throw new Error(`Fieldnote data at ${filePath} is missing an engagements array.`);
  }
  return raw.engagements.map((entry) => parseEngagement(entry));
}
