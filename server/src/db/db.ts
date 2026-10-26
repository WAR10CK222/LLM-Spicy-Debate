import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { MIGRATIONS } from "./migrations.js";
import { seedPersonas } from "./seed.js";

export type Db = Database.Database;

/** Opens (and migrates + seeds) the app database. Pass ":memory:" for tests. */
export function openDb(file: string): Db {
    if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
    const db = new Database(file);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    db.pragma("busy_timeout = 5000");
    migrate(db);
    seedPersonas(db);
    return db;
}

function migrate(db: Db) {
    const current = db.pragma("user_version", { simple: true }) as number;
    for (let v = current; v < MIGRATIONS.length; v++) {
        db.transaction(() => {
            db.exec(MIGRATIONS[v]);
            db.pragma(`user_version = ${v + 1}`);
        })();
    }
}
