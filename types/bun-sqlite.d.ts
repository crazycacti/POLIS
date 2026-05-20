declare module "bun:sqlite" {
  export class Database {
    constructor(filename: string, options?: { readonly?: boolean; create?: boolean });
    run(sql: string, ...params: unknown[]): void;
    query<T = unknown, P extends unknown[] = unknown[]>(sql: string): {
      get(...params: P): T | null;
      all(...params: P): T[];
      run(...params: P): void;
    };
  }
}
