import Redis, { Cluster } from "ioredis";
import { IORedisClientPool } from '../dist/index.js';

function parseRedisConnectionString(connectionString) {
    //Used to parse the connection string and return components of the same 
    //Refer:ioredis/built/utils/index.js parseURL function for more details
    //This is just a mock implementation, you can enhance it as per your needs.
    return {
        password: ""
    };
}

async function main(pool) {

    //Generates a unique token
    const token = pool.generateUniqueToken('Test');
    try {
        //Acquire connection from the pool
        await pool.acquire(token);
        //Execute the command on the acquired connection
        await pool.run(token, ['set', 'key', 'hello from ioredis']);
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
const singleNodeRedisConnectionString = 'rediss://redis.my-service.com';
//Create a injector function for creating redis connection instances.
const connectionInjector = () => IORedisClientPool.IORedisClientClusterFactory([singleNodeRedisConnectionString], Redis, Cluster, parseRedisConnectionString);
//Initialize the pool
const pool = new IORedisClientPool(connectionInjector);

//Pass it around in the application.
main(pool)
    .finally(async _ => {
        //Remember to call shutdown which closes all connections in pool, else node.js process will not exit.
        await pool.shutdown()
    })