import { IRedisClientPool } from "./i-redis-client-pool";
import crypto from 'node:crypto';
import fs from 'node:fs';
import Redis, { Cluster } from 'ioredis';
import { parseURL } from 'ioredis/built/utils';

function createInstance<T>(c: new (...args: any) => T, args: any[] = []): T { return new c(...args); }

export type RedisConnection = Cluster | Redis;

export class IORedisClientPool implements IRedisClientPool {
    private poolRedisClients: RedisConnection[];
    private activeRedisClients: Map<string, RedisConnection>;
    private filenameToCommand = new Map<string, string>();
    private redisConnectionCreator: () => RedisConnection;
    private idlePoolSize: number;
    private totalConnectionCounter = 0;

    constructor(redisConnectionCreator: () => RedisConnection, idlePoolSize = 6,
        private readonly nodeFSModule: typeof fs = fs,
        private readonly nodeCryptoModule: typeof crypto = crypto) {
        this.poolRedisClients = Array.from({ length: idlePoolSize }, (_) => redisConnectionCreator());
        this.totalConnectionCounter += idlePoolSize;
        this.activeRedisClients = new Map<string, RedisConnection>();
        this.redisConnectionCreator = redisConnectionCreator;
        this.idlePoolSize = idlePoolSize;
    }

    public generateUniqueToken(prefix: string) {
        return `${prefix}-${this.nodeCryptoModule.randomUUID()}`;
    }

    public async shutdown() {
        const waitHandles = [...this.poolRedisClients, ...Array.from(this.activeRedisClients.values())]
            .map(async _ => { await _.quit(); _.disconnect(); });
        await Promise.allSettled(waitHandles);

        this.poolRedisClients = [];
        this.activeRedisClients.clear();
        this.totalConnectionCounter = 0;
    }

    public async acquire(token: string) {
        if (!this.activeRedisClients.has(token)) {
            const availableClient = this.poolRedisClients.pop() || (() => { this.totalConnectionCounter += 1; return this.redisConnectionCreator(); })();
            this.activeRedisClients.set(token, availableClient);
        }
    }

    async release(token: string) {
        const releasedClient = this.activeRedisClients.get(token);
        if (releasedClient == undefined) {
            return;
        }
        this.activeRedisClients.delete(token);
        if (this.poolRedisClients.length < this.idlePoolSize) {
            this.poolRedisClients.push(releasedClient);
        }
        else {
            await releasedClient.quit();
            releasedClient.disconnect();
        }
    }

    public async run(token: string, commandArgs: any) {
        const redisClient = this.activeRedisClients.get(token);
        if (redisClient == undefined) {
            throw new Error("Please acquire a client with proper token");
        }
        return await redisClient.call(commandArgs.shift(), ...commandArgs);
    }

    public async pipeline(token: string, commands: string[][], transaction = true) {
        const redisClient = this.activeRedisClients.get(token);
        if (redisClient == undefined) {
            throw new Error("Please acquire a client with proper token");
        }
        const result = transaction === true ? await redisClient.multi(commands).exec() : await redisClient.pipeline(commands).exec();
        return result?.map(r => {
            let err = r[0];
            if (err != null) {
                throw err;
            }
            return r[1];
        });
    }

    public async script(token: string, filePath: string, keys: string[], args: any[]) {
        const redisClient = this.activeRedisClients.get(token);
        if (redisClient == undefined) {
            throw new Error("Please acquire a client with proper token");
        }
        let command = this.filenameToCommand.get(filePath);
        // @ts-ignore
        if (command == null || redisClient[command] == null) {
            const contents = await this.nodeFSModule.promises.readFile(filePath, { encoding: "utf-8" });
            command = this.MD5Hash(contents);
            redisClient.defineCommand(command, { lua: contents });
            this.filenameToCommand.set(filePath, command);
        }
        // @ts-ignore
        return await redisClient[command](keys.length, keys, args);
    }

    public info() {
        const returnObj = {
            "Idle Size": this.idlePoolSize,
            "Current Active": this.activeRedisClients.size,
            "Pooled Connection": this.poolRedisClients.length,
            "Peak Connections": this.totalConnectionCounter
        };
        this.totalConnectionCounter = 0;
        return returnObj;
    }

    private MD5Hash(value: string): string {
        return this.nodeCryptoModule.createHash('md5').update(value).digest('hex');
    }

    public static IORedisClientClusterFactory(connectionDetails: string[], instanceInjection: <T>(c: new (...args: any) => T, args: any[]) => T = createInstance): RedisConnection {
        const distinctConnections = new Set<string>(connectionDetails);
        if (distinctConnections.size === 0) {
            throw new Error("Inncorrect or Invalid Connection details, cannot be empty");
        }

        if (connectionDetails.length > distinctConnections.size || distinctConnections.size > 1) {
            const parsedRedisURl = parseURL(connectionDetails[0]);//Assuming all have same password(they should have finally its a cluster)
            const awsElasticCacheOptions = {
                dnsLookup: (address: string, callback: any) => callback(null, address),
                redisOptions: {
                    tls: connectionDetails[0].startsWith("rediss:") == true ? {} : undefined,
                    password: parsedRedisURl.password as string | undefined,
                    maxRedirections: 32
                },
            }
            return instanceInjection<Cluster>(Cluster, [Array.from(distinctConnections.values()), awsElasticCacheOptions]);
        }
        else {
            return instanceInjection<Redis>(Redis, [connectionDetails[0]]);
        }
    }
}
