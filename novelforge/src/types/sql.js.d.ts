declare module 'sql.js' {
  interface SqlJsStatic {
    Database: new (data?: ArrayLike<number>) => Database
  }

  interface Database {
    run(sql: string, params?: any[]): void
    exec(sql: string, params?: any[]): QueryExecResult[]
    export(): Uint8Array
    close(): void
    getRowsModified(): number
  }

  interface QueryExecResult {
    columns: string[]
    values: any[][]
  }

  export default function initSqlJs(): Promise<SqlJsStatic>
  export type { SqlJsStatic, Database, QueryExecResult }
}
