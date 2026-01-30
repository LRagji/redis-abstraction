import * as tc from 'testcontainers';
import Redis, { Cluster } from 'ioredis';
import { createClient } from 'redis';

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import * as LUT from '../dist/index.js';

let redisContainer1: tc.StartedTestContainer;
let nodeRedisPool: LUT.IRedisClientPool;

let redisContainer2: tc.StartedTestContainer;
let ioRedisPool: LUT.IRedisClientPool;

function parseRedisConnectionString(connectionString: string) {
    //Used to parse the connection string and return components of the same 
    //Refer:ioredis/built/utils/index.js parseURL function for more details
    //This is just a mock implementation, you can enhance it as per your needs.
    return {
        password: ""
    };
}

before(async () => {
    redisContainer1 = await new tc.GenericContainer('redis')
        .withExposedPorts(6379)
        .start();
    const singleNodeRedisConnectionString1 = `redis://${redisContainer1.getHost()}:${redisContainer1.getMappedPort(6379)}`;
    const connectionInjector1 = () => createClient({ url: singleNodeRedisConnectionString1 });
    nodeRedisPool = new LUT.RedisClientPool<LUT.TRedisCommonCommands>(connectionInjector1 as any);
    await (nodeRedisPool as LUT.RedisClientPool<LUT.TRedisCommonCommands>).initialize();

    redisContainer2 = await new tc.GenericContainer('redis')
        .withExposedPorts(6379)
        .start();
    const singleNodeRedisConnectionString2 = `redis://${redisContainer2.getHost()}:${redisContainer2.getMappedPort(6379)}`;
    const connectionInjector2 = () => LUT.IORedisClientPool.IORedisClientClusterFactory([singleNodeRedisConnectionString2], Redis as any, Cluster as any, parseRedisConnectionString);
    ioRedisPool = new LUT.IORedisClientPool<LUT.TIORedisCommonCommands>(connectionInjector2);
});

after(async () => {
    await nodeRedisPool.shutdown();
    await redisContainer1.stop();
    await ioRedisPool.shutdown();
    await redisContainer2.stop();
});

test('RedisClientPool: acquire and release a client', async () => {
    const token = nodeRedisPool.generateUniqueToken('test');
    await nodeRedisPool.acquire(token);
    await nodeRedisPool.release(token);
});

test('RedisClientPool: run a command', async () => {
    const token = nodeRedisPool.generateUniqueToken('test');
    await nodeRedisPool.acquire(token);
    await nodeRedisPool.run(token, ['set', 'foo', 'bar']);
    const value = await nodeRedisPool.run(token, ['get', 'foo']);
    assert.equal(value, 'bar');
    await nodeRedisPool.release(token);
});

test('RedisClientPool: run pipeline commands', async () => {
    const token = nodeRedisPool.generateUniqueToken('test');
    await nodeRedisPool.acquire(token);
    const results = await nodeRedisPool.pipeline(token, [
        ['set', 'a', '1'],
        ['set', 'b', '2'],
        ['get', 'a'],
        ['get', 'b']
    ], false);
    assert.equal(results[2], '1');
    assert.equal(results[3], '2');
    await nodeRedisPool.release(token);
});

test('RedisClientPool: run transaction pipeline', async () => {
    const token = nodeRedisPool.generateUniqueToken('test');
    await nodeRedisPool.acquire(token);
    const results = await nodeRedisPool.pipeline(token, [
        ['set', 'x', '10'],
        ['get', 'x']
    ], true);
    assert.equal(results[1], '10');
    await nodeRedisPool.release(token);
});

test('IORedisClientPool: acquire and release a client', async () => {
    const token = ioRedisPool.generateUniqueToken('test');
    await ioRedisPool.acquire(token);
    await ioRedisPool.release(token);
});

test('IORedisClientPool: run a command', async () => {
    const token = ioRedisPool.generateUniqueToken('test');
    await ioRedisPool.acquire(token);
    await ioRedisPool.run(token, ['set', 'foo', 'bar']);
    const value = await ioRedisPool.run(token, ['get', 'foo']);
    assert.equal(value, 'bar');
    await ioRedisPool.release(token);
});

test('IORedisClientPool: run pipeline commands', async () => {
    const token = ioRedisPool.generateUniqueToken('test');
    await ioRedisPool.acquire(token);
    const results = await ioRedisPool.pipeline(token, [
        ['set', 'a', '1'],
        ['set', 'b', '2'],
        ['get', 'a'],
        ['get', 'b']
    ], false);
    assert.equal(results[2], '1');
    assert.equal(results[3], '2');
    await ioRedisPool.release(token);
});

test('IORedisClientPool: run transaction pipeline', async () => {
    const token = ioRedisPool.generateUniqueToken('test');
    await ioRedisPool.acquire(token);
    const results = await ioRedisPool.pipeline(token, [
        ['set', 'x', '10'],
        ['get', 'x']
    ], true);
    assert.equal(results[1], '10');
    await ioRedisPool.release(token);
});
