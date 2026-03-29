declare module 'argon2' {
  const argon2: {
    argon2id: number;
    hash(plainText: string, options?: Record<string, unknown>): Promise<string>;
    verify(hashed: string, plainText: string): Promise<boolean>;
  };

  export = argon2;
}

declare module 'mysql2/promise' {
  export interface PoolConnection {
    query<T = any>(sql: string, values?: unknown[]): Promise<[T, unknown]>;
    beginTransaction(): Promise<void>;
    commit(): Promise<void>;
    rollback(): Promise<void>;
    release(): void;
  }

  export interface Pool {
    query<T = any>(sql: string, values?: unknown[]): Promise<[T, unknown]>;
    getConnection(): Promise<PoolConnection>;
    end(): Promise<void>;
  }

  export const createPool: (config: Record<string, unknown>) => Pool;
}
