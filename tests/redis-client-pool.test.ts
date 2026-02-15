import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as sinon from 'sinon';
import { RedisClientPool, TRedisCommonCommands } from '../source/index';

describe('RedisClientPool', () => {

    let mockRedisClient: sinon.SinonStubbedInstance<TRedisCommonCommands>;
    let sandbox: sinon.SinonSandbox;
    let createClientStub: sinon.SinonStub;

    beforeEach(() => {
        sandbox = sinon.createSandbox();
        mockRedisClient = sandbox.stub({
            connect: async () => { },
            close: async () => { },
            destroy: () => { },
            sendCommand: async () => { },
            multi: () => ({
                exec: async () => [],
                execAsPipeline: async () => []
            }),
            isOpen: true
        } as any);
        createClientStub = sandbox.stub().returns(mockRedisClient as any)
    });

    afterEach(() => {
        sandbox.restore();
    });

    test('constructor should create idle pool clients', () => {
        const pool = new RedisClientPool(createClientStub, 5);
        assert.strictEqual(pool !== undefined, true);
        assert.equal(createClientStub.callCount, 5); // Validate that the input function is called 5 times
    });

    test('initialize should connect all pool clients', async () => {
        const pool = new RedisClientPool(createClientStub, 5);
        await pool.initialize();
        assert.equal(mockRedisClient.connect.callCount, 5);
    });

    // test('acquire should move client from pool to active', async () => {
    //     await redisClientPool.acquire('token1');
    //     assert.ok(await redisClientPool.isClientActive('token1')); // Assuming you create a public method to check active clients
    // });

    // test('acquire should create new client if pool is empty', async () => {
    //     await redisClientPool.release('token1'); // Ensure the client is released first
    //     await redisClientPool.acquire('token1');
    //     assert.ok(await redisClientPool.isClientActive('token1'));
    // });

    // test('acquire should not acquire same token twice', async () => {
    //     await redisClientPool.acquire('token1');
    //     const firstClient = await redisClientPool.getActiveClient('token1'); // Assuming you create a public method to get active clients
    //     await redisClientPool.acquire('token1');
    //     const secondClient = await redisClientPool.getActiveClient('token1');
    //     assert.strictEqual(firstClient, secondClient);
    // });

    // test('release should return client to pool', async () => {
    //     await redisClientPool.acquire('token1');
    //     await redisClientPool.release('token1');
    //     assert.ok(!(await redisClientPool.isClientActive('token1')));
    // });

    test('release should close and destroy client if pool is full', async () => {
        const pool = new RedisClientPool(createClientStub, 0);

        assert.equal(createClientStub.callCount, 0); // No clients should be created initially
        await pool.acquire('token1');
        assert.equal(createClientStub.callCount, 1);
        await pool.release('token1');

        assert.equal(createClientStub.callCount, 1);
        assert.ok(mockRedisClient.close.called);
        assert.ok(mockRedisClient.destroy.called);
    });

    test('release should handle release of non-existent token', async () => {
        const pool = new RedisClientPool(createClientStub, 0);
        const result = await pool.release('nonexistent');
        assert.equal(result, undefined);
    });

    // test('shutdown should close all clients and clear pools', async () => {
    //     await redisClientPool.acquire('token1');
    //     await redisClientPool.shutdown();
    //     assert.ok(!(await redisClientPool.isClientActive('token1')));
    // });

    // test('run should execute command on active client', async () => {
    //     mockRedisClient.sendCommand.resolves('result');
    //     await redisClientPool.acquire('token1');
    //     const result = await redisClientPool.run('token1', ['GET', 'key']);
    //     assert.ok(mockRedisClient.sendCommand.calledWith(['GET', 'key']));
    //     assert.equal(result, 'result');
    // });

    // test('run should throw error if token not acquired', async () => {
    //     await assert.rejects(
    //         () => redisClientPool.run('invalid', ['GET', 'key']),
    //         /Please acquire a client/
    //     );
    // });

    // test('pipeline should execute pipeline with transaction', async () => {
    //     const execStub = sandbox.stub().resolves([]);
    //     mockRedisClient.multi.returns({ exec: execStub, execAsPipeline: sandbox.stub() } as any);
    //     await redisClientPool.acquire('token1');
    //     await redisClientPool.pipeline('token1', [['SET', 'key', 'value']], true);
    //     assert.ok(execStub.called);
    // });

    // test('pipeline should throw error if token not acquired', async () => {
    //     await assert.rejects(
    //         () => redisClientPool.pipeline('invalid', [], true),
    //         /Please acquire a client/
    //     );
    // });

    // test('generateUniqueToken should generate token with prefix', () => {
    //     const token = redisClientPool.generateUniqueToken('test');
    //     assert.match(token, /^test-[a-f0-9-]+$/);
    // });

    // test('generateUniqueToken should generate unique tokens', () => {
    //     const token1 = redisClientPool.generateUniqueToken('test');
    //     const token2 = redisClientPool.generateUniqueToken('test');
    //     assert.notEqual(token1, token2);
    // });
});
