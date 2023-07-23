import { IORedisClientPool } from '../dist/index.js';

async function main(pool) {

    //Generates a unique token
    const token = pool.generateUniqueToken('Test');
    try {
        //Acquire connection from the pool
        await pool.acquire(token);
        //Execute the command on the acquired connection
        await pool.run(token, ['set', 'key', 'value']);
    }
    finally {
        //Release of connection is important as it makes it available for others to acquire.
        await pool.release(token);
    }

}

//Define the redis connection string
const singleNodeRedisConnectionString = 'rediss://redis.my-service.com';
//Create a injector function for creating redis connection instances.
const connectionInjector = () => IORedisClientPool.IORedisClientClusterFactory([singleNodeRedisConnectionString]);
//Initialize the pool
const pool = new IORedisClientPool(connectionInjector);

//Pass it around in the application.
main(pool)
    .finally(async () => {
        //Remember to call shutdown which closes all connections in pool, else node.js process will not exit.
        await pool.shutdown()
    })