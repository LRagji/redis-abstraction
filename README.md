# redis-abstraction
A Redis client pool with abstraction to different Redis libraries.

This package helps to create redis connections in a connection pool fashion, ideally redis is single threaded so multiple connection or a connection pool for simple commands may not make sense, but there are some conditions in which connection pool makes sense like blocking commands, pub-sub commands etc apart form these cases there are also some fringe cases where if you have a simple command with a lot of data to be serialized on wire/network here multiple connections make sense as redis execution is single threaded but its I/O stack is multi so another command which has relatively small data to be serialized on wire gets stuck behind this big network transfer command ahead of it, It can take advantage of another connection where there is not que before-hand and get executed first in such a case connection pools make sense. This package also supports cluster mode connections.

Working of this package is simple it exposes an interface [i-redis-client-pool](https://github.com/LRagji/redis-abstraction/blob/main/source/i-redis-client-pool.ts) which has following methods 
1. `acquire(token: string): Promise<void>` : Responsibile to acquire a connection to redis server in-reference to the unique token provided.
2. `run(token: string, commandArgs: string[]): Promise<any>` : Responsible to run a redis command in-reference to the unique token acquired before.
3. `release(token: string): Promise<void>` : Responsible to release the acquired connection back into connection pool in-reference to the unique token acquired before.

There are some more supporting methods as given below:
* `generateUniqueToken(prefix: string): string;` : Generates a unique token for a given prefix, this can be then used to acquire and release connections from pool.
* `pipeline(token: string, commands: string[][], transaction: boolean): Promise<any>` : Executes a set of commands together either in transaction or just close to one another.
* `script(token: string, filename: string, keys: string[], args: string[]): Promise<any>` : Registers and executes a lua script.

Currently this package only supports ioredis as underneath client library, but in future it may expand to other libraries as well.

## Getting Started

1. Install using `npm -i redis-abstraction`
2. Require in your project. `const { IORedisClientPool } = require('redis-abstraction');` or `import { IORedisClientPool } from 'redis-abstraction';`
3. Run redis on local docker if required. `docker run --name streamz -p 6379:6379 -itd --rm redis:latest`
4. All done, Start using it!!.

## Examples/Code snippets

1. Please find example code in [examples](https://github.com/LRagji/redis-abstraction/blob/main/examples) folder
2. Please find example code usage in  [unit tests](https://github.com/LRagji/redis-abstraction/blob/main/tests/specs-ioredis-client-pool.ts)


### Non Cluster Initialization

```javascript
//Define the redis connection string
const singleNodeRedisConnectionString = 'rediss://redis.my-service.com';
//Create a injector function for creating redis connection instance.
const connectionInjector = () => IORedisClientPool.IORedisClientClusterFactory([singleNodeRedisConnectionString]);
//Initialize the pool
const pool = new IORedisClientPool(connectionInjector);

//Pass it around in the application.
main(pool)
    .finally(async () => {
        //Remember to call shutdown which closes all connections in pool, else node.js process will not exit.
        await pool.shutdown()
    })
```
### Clustered Initialization

```javascript
//Define the redis connection string
const clusteredRedisConnectionStringPrimary = 'rediss://redis.my-service.com';
const clusteredRedisConnectionStringSecondary = 'rediss://redis.my-service.com' || clusteredRedisConnectionStringPrimary; //Secondary is optional if not present pass in primary connection.
//Create a injector function for creating redis connection instance.
const connectionInjector = () => IORedisClientPool.IORedisClientClusterFactory([clusteredRedisConnectionStringPrimary,clusteredRedisConnectionStringSecondary]);//Passing more than one connection string indicates its a cluster setup.
//Initialize the pool
const pool = new IORedisClientPool(connectionInjector);

//Pass it around in the application.
main(pool)
    .finally(async () => {
        //Remember to call shutdown which closes all connections in pool, else node.js process will not exit.
        await pool.shutdown()
    })
```

## Usage

```javascript
    //Generates a unique token
    const token = pool.generateUniqueToken('Test');
    try {
        //Acquire idle connection from the pool or create a fresh one if entire pool connections are busy
        await pool.acquire(token);
        //Execute the command on the acquired connection
        await pool.run(token, ['set', 'key', 'value']);
    }
    finally {
        //Release of connection is important as it makes it available for others to acquire.
        await pool.release(token);
    }
```

## Built with

1. Authors :heart: for Open Source.


## Contributions

1. New ideas/techniques are welcomed.
2. Raise a Pull Request.

## License

This project is contrubution to public domain and completely free for use, view [LICENSE.md](/license.md) file for details.