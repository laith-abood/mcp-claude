declare module 'glob' {
    interface GlobOptions {
        cwd?: string;
        ignore?: string[];
        nodir?: boolean;
        withFileTypes?: boolean;
        absolute?: boolean;
        dot?: boolean;
        follow?: boolean;
        mark?: boolean;
    }

    export function glob(pattern: string, options?: GlobOptions): Promise<string[]>;
    export function globSync(pattern: string, options?: GlobOptions): string[];
    export function globStream(pattern: string, options?: GlobOptions): NodeJS.ReadableStream;
    export function globIterateSync(pattern: string, options?: GlobOptions): IterableIterator<string>;
    export function globIterate(pattern: string, options?: GlobOptions): AsyncIterableIterator<string>;
}
