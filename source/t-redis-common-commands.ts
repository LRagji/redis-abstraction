
interface IRedisRequiredCommands {
    quit(): Promise<void>;
    disconnect(): void;
    multi(commands: string[][]): this;
    exec(): Promise<(Error | null | any)[] | null>;
    sendCommand(commandName: string, ...args: any[]): Promise<any>;
}

type TExclusion<T> = {
    [key in Exclude<string, keyof T>]: (argsLength: number, ...args: any[]) => Promise<any>;
}

/**
 * Type representing common commands for node-redis clients
 * This interface abstracts the common methods used in both Redis and Cluster clients.
 */
export type TRedisCommonCommands = TExclusion<IRedisRequiredCommands> & IRedisRequiredCommands;