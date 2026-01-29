import { createClient } from "redis";
import { RedisClientPool } from '../dist/index.js';

async function main(pool) {
    //Initialize the pool (establish connections)
    await pool.initialize();

    //Generates a unique token
    const token = pool.generateUniqueToken('Test');
    try {
        //Acquire connection from the pool
        await pool.acquire(token);
        //Execute the command on the acquired connection
        await pool.run(token, ['set', 'key', 'hello from node-redis']);
        //Execute some more
        const something = await pool.run(token, ['get', 'key']);
        console.log(something);
    }
    finally {
        //Release of connection is important as it makes it available for others to acquire.
        await pool.release(token);
    }

}

//Define the redis connection string
const singleNodeRedisConnectionString = 'redis://localhost:6379'//'rediss://redis.my-service.com';
//Create a injector function for creating redis connection instances.
const connectionInjector = () => createClient({ url: singleNodeRedisConnectionString });
//Initialize the pool
const pool = new RedisClientPool(connectionInjector);

//Pass it around in the application.
main(pool)
    .finally(async _ => {
        //Remember to call shutdown which closes all connections in pool, else node.js process will not exit.
        await pool.shutdown()
    })