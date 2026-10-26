// Append-only. Each entry runs once, tracked with PRAGMA user_version.
export const MIGRATIONS: string[] = [
    /* 1: initial schema */ `
    CREATE TABLE personas (
        id            TEXT PRIMARY KEY,
        name          TEXT NOT NULL,
        title         TEXT NOT NULL,
        tagline       TEXT NOT NULL,
        catchphrase   TEXT NOT NULL,
        style         TEXT NOT NULL,
        look_json     TEXT NOT NULL,
        voice_json    TEXT NOT NULL,
        sort          INTEGER NOT NULL DEFAULT 0,
        elo           REAL NOT NULL DEFAULT 1200,
        wins          INTEGER NOT NULL DEFAULT 0,
        losses        INTEGER NOT NULL DEFAULT 0,
        draws         INTEGER NOT NULL DEFAULT 0,
        roasts_landed INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE debates (
        id             TEXT PRIMARY KEY,
        topic          TEXT NOT NULL,
        settings_json  TEXT NOT NULL,
        title          TEXT,
        case_json      TEXT,
        status         TEXT NOT NULL,
        for_id         TEXT NOT NULL REFERENCES personas(id),
        against_id     TEXT NOT NULL REFERENCES personas(id),
        winner         TEXT,
        peoples_choice TEXT,
        brief_json     TEXT,
        error          TEXT,
        played_seq     INTEGER NOT NULL DEFAULT 0,
        created_at     INTEGER NOT NULL,
        finished_at    INTEGER
    );
    CREATE INDEX idx_debates_created ON debates(created_at DESC);

    CREATE TABLE events (
        debate_id    TEXT NOT NULL REFERENCES debates(id) ON DELETE CASCADE,
        seq          INTEGER NOT NULL,
        key          TEXT NOT NULL,
        type         TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        ts           INTEGER NOT NULL,
        PRIMARY KEY (debate_id, seq),
        UNIQUE (debate_id, key)
    );

    CREATE TABLE rounds (
        debate_id   TEXT NOT NULL REFERENCES debates(id) ON DELETE CASCADE,
        idx         INTEGER NOT NULL,
        count_title TEXT NOT NULL,
        winner      TEXT NOT NULL,
        rubric_json TEXT NOT NULL,
        judge_line  TEXT NOT NULL,
        lesson      TEXT NOT NULL,
        PRIMARY KEY (debate_id, idx)
    );

    CREATE TABLE roasts (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        debate_id   TEXT NOT NULL REFERENCES debates(id) ON DELETE CASCADE,
        seq         INTEGER NOT NULL,
        persona_id  TEXT NOT NULL REFERENCES personas(id),
        text        TEXT NOT NULL,
        spice       INTEGER NOT NULL,
        crowd_score REAL NOT NULL DEFAULT 0,
        votes       INTEGER NOT NULL DEFAULT 0,
        created_at  INTEGER NOT NULL,
        UNIQUE (debate_id, seq)
    );
    CREATE INDEX idx_roasts_rank ON roasts(crowd_score DESC);

    CREATE TABLE quiz_attempts (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        debate_id    TEXT NOT NULL REFERENCES debates(id) ON DELETE CASCADE,
        score        INTEGER NOT NULL,
        total        INTEGER NOT NULL,
        answers_json TEXT NOT NULL,
        created_at   INTEGER NOT NULL
    );
    `,
];
