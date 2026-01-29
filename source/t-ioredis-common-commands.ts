
interface IIORedisRequiredCommands {
    quit(): Promise<void>;
    disconnect(): void;
    multi(commands: string[][]): this;
    pipeline(commands: string[][]): this;
    exec(): Promise<(Error | null | any)[] | null>;
    defineCommand(commandName: string, definition: { lua: string }): void;
    call(commandName: string, ...args: any[]): Promise<any>;
}

type TExclusion<T> = {
    [key in Exclude<string, keyof T>]: (argsLength: number, ...args: any[]) => Promise<any>;
}

/**
 * Type representing common commands for ioredis clients
 * This interface abstracts the common methods used in both Redis and Cluster clients.
 */
export type TIORedisCommonCommands = TExclusion<IIORedisRequiredCommands> & IIORedisRequiredCommands;