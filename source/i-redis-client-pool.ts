/**
* Interface used to abstract a redis client/connection for this package
*/
export interface IRedisClientPool {
    /**
     * This method acquires a redis client instance from a pool of redis clients with token as an identifier/handle.
     * @param token A unique string used to acquire a redis client instance against. Treat this as redis client handle.
     */
    acquire(token: string): Promise<void>
    /**
     * This method releases the acquired redis client back into the pool.
     * @param token A unique string used when acquiring client via {@link acquire} method
     */
    release(token: string): Promise<void>
    /**
     * Signals a dispose method to the pool stating no more clients will be needed, donot call any methods post calling shutdown. 
     */
    shutdown(): Promise<void>
    /**
     * Executes a single command on acquired connection.
     * @param token token string which was used to acquire.
     * @param commandArgs Array of strings including commands and arguments Eg:["set","key","value"]
     * @returns Promise of any type.
     */
    run(token: string, commandArgs: string[]): Promise<any>
    /**
     * This method is used to execute a set of commands in one go sequentially on redis side.
     * @param token token string which was used to acquire.
     * @param commands Array of array of strings including multiple commands and arguments that needs to be executed in one trip to the server sequentially. Eg:[["set","key","value"],["get","key"]]
     * @returns Promise of all results in the commands(any type).
     */
    pipeline(token: string, commands: string[][]): Promise<any>;
    /**
     * This method is used to execute a lua script on redis connection.
     * @param token token string which was used to acquire.
     * @param filename Full file path of the lua script to be executed Eg: path.join(__dirname, "script.lua")
     * @param keys Array of strings, Keys to be passsed to the script. 
     * @param args Array of strings, Arguments to be passed to the script.
     */
    script(token: string, filename: string, keys: string[], args: string[]): Promise<any>

    /**
     * This method should provide unique token for a given prefix.
     * @param prefix An identity string for token to prepend.
     */
    generateUniqueToken(prefix: string): string;

}