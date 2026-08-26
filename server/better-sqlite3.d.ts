// Local type declaration for "better-sqlite3".
//
// better-sqlite3 ships no native TypeScript types, and the community
// @types/better-sqlite3 package's declarations conflict with this
// project's moduleResolution:"Bundler" default-import interop, causing
// the constructor call in server/db.ts to fail type-checking ("new
// Database(...) lacks a construct signature") even though the code is
// correct at runtime. This declares only the small subset of the real
// better-sqlite3 API this project actually uses, as a true ES default
// export, so it resolves cleanly without needing esModuleInterop.
declare module "better-sqlite3" {
  export interface RunResult {
    changes: number;
    lastInsertRowid: number | bigint;
  }

  export interface Statement {
    get(...params: any[]): any;
    all(...params: any[]): any[];
    run(...params: any[]): RunResult;
  }

  export default class Database {
    constructor(filename: string, options?: any);
    pragma(source: string, options?: any): any;
    exec(source: string): this;
    prepare(source: string): Statement;
    close(): this;
  }
}
