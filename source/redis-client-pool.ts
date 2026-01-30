import crypto from 'node:crypto';
import fs from 'node:fs';

import { IRedisClientPool } from "./i-redis-client-pool";
import { TRedisCommonCommands } from './t-redis-common-commands';

export class RedisClientPool<redisConnectionType extends TRedisCommonCommands> implements IRedisClientPool {

    private totalConnectionCounter = 0;
    private poolRedisClients: redisConnectionType[];
    private activeRedisClients: Map<string, redisConnectionType>;

    constructor(private readonly redisConnectionCreator: () => redisConnectionType, private idlePoolSize = 6,
        private readonly nodeFSModule: typeof fs = fs,
        private readonly nodeCryptoModule: typeof crypto = crypto) {
        this.poolRedisClients = Array.from({ length: idlePoolSize }, (_) => redisConnectionCreator());
        this.totalConnectionCounter += idlePoolSize;
        this.activeRedisClients = new Map<string, redisConnectionType>();
    }

    public async initialize(): Promise<void> {
        const initHandles = this.poolRedisClients.map(async _ => { await _.connect(); });
        await Promise.allSettled(initHandles);
    }

    public async acquire(token: string): Promise<void> {
        if (!this.activeRedisClients.has(token)) {
            const availableClient = this.poolRedisClients.pop() || (() => { this.totalConnectionCounter += 1; return this.redisConnectionCreator(); })();
            this.activeRedisClients.set(token, availableClient);
        }
    }

    public async release(token: string): Promise<void> {
        const releasedClient = this.activeRedisClients.get(token);
        if (releasedClient == undefined) {
            return;
        }
        this.activeRedisClients.delete(token);
        if (this.poolRedisClients.length < this.idlePoolSize) {
            this.poolRedisClients.push(releasedClient);
        }
        else {
            await releasedClient.close();
            releasedClient.destroy();
        }
    }

    public async shutdown(): Promise<void> {
        const waitHandles = [...this.poolRedisClients, ...Array.from(this.activeRedisClients.values())]
            .map(async _ => { await _.close(); _.destroy(); });
        await Promise.allSettled(waitHandles);

        this.poolRedisClients = [];
        this.activeRedisClients.clear();
        this.totalConnectionCounter = 0;
    }

    public async run(token: string, commandArgs: string[]): Promise<any> {
        const redisClient = this.activeRedisClients.get(token);
        if (redisClient == undefined) {
            throw new Error("Please acquire a client with proper token");
        }

        return await redisClient.sendCommand(commandArgs);
    }

    public async pipeline(token: string, commands: string[][], transaction: boolean): Promise<any> {

        const redisClient = this.activeRedisClients.get(token);
        if (redisClient == undefined) {
            throw new Error("Please acquire a client with proper token");
        }
        const transactionContext = redisClient.multi();
        for (const cmd of commands) {
            const commandName = (cmd.shift() ?? "").toLowerCase();
            // @ts-ignore
            transactionContext[commandName](...cmd);
        }
        return transaction === true ? await transactionContext.exec() : await transactionContext.execAsPipeline();
    }

    public script(token: string, filePath: string, keys: string[], args: string[]): Promise<any> {
        throw new Error("Method not implemented.");
    }

    public generateUniqueToken(prefix: string): string {
        return `${prefix}-${this.nodeCryptoModule.randomUUID()}`;
    }
}