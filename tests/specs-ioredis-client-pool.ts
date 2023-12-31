import * as assert from 'node:assert';
import sinon from 'sinon';
import { IORedisClientPool } from '../source/index';
import crypto from 'node:crypto';
import fs from 'fs';

describe('RedisClientPool', () => {

    let redisFactory: sinon.SinonStub;
    const multiResult = "MMockResult";
    const pipelineResult = "PMockResult";

    afterEach(() => {
        sinon.resetBehavior();
        sinon.resetHistory();
        sinon.restore();
    });

    beforeEach(() => {
        redisFactory = sinon.stub().callsFake(() => {
            return {
                objectId: crypto.randomUUID(),
                quit: sinon.stub().resolves({}),
                disconnect: sinon.stub(),
                call: sinon.stub(),
                multi: sinon.stub().returns({ exec: sinon.stub().returns([[null, multiResult]]) }),
                pipeline: sinon.stub().returns({ exec: sinon.stub().returns([[null, pipelineResult]]) }),
                defineCommand: sinon.stub()
            };
        });
    })

    describe('calling constructor', () => {
        it('should preemptively create redis pool connections with default pool size', async () => {
            const target = new IORedisClientPool(redisFactory);
            assert.strictEqual(target != null, true);
            assert.strictEqual(redisFactory.callCount, 6);
        })

        it('should preemptively create redis pool connections with specified pool size', async () => {
            const poolSize = 3;
            const target = new IORedisClientPool(redisFactory, poolSize);
            assert.strictEqual(target != null, true);
            assert.strictEqual(redisFactory.callCount, poolSize);
        })

        it('should not preemptively create redis pool connections when pool size set to zero', async () => {
            const poolSize = 0;
            const target = new IORedisClientPool(redisFactory, poolSize);
            assert.strictEqual(target != null, true);
            assert.strictEqual(redisFactory.callCount, poolSize);
        })

        it('should throw error when redis factory method throws error', async () => {
            const error = new Error("Something went wrong");
            const redisFactory = sinon.stub().throws(error);
            assert.throws(() => new IORedisClientPool(redisFactory), error);
        })

        it('should preemptively create floor of redis pool connections when pool size set to floating number', async () => {
            const poolSize = 2.8;
            const target = new IORedisClientPool(redisFactory, poolSize);
            assert.strictEqual(target != null, true);
            assert.strictEqual(redisFactory.callCount, 2);
        })

        it('should not preemptively create redis pool connections when pool size set to negative number', async () => {
            const poolSize = -4.6;
            const target = new IORedisClientPool(redisFactory, poolSize);
            assert.strictEqual(target != null, true);
            assert.strictEqual(redisFactory.callCount, 0);
        })
    })

    describe('calling acquire', () => {
        it('should create single redis connection when pool is empty for a unique token', async () => {
            const poolSize = 0, token = Math.random().toString();
            const target = new IORedisClientPool(redisFactory, poolSize);
            assert.strictEqual(redisFactory.callCount, 0);
            await target.acquire(token);
            assert.strictEqual(redisFactory.callCount, 1);
        })

        it('should not create new redis connections when there are existing free connections in pool for a unique token', async () => {
            const poolSize = 5, token = Math.random().toString();
            const target = new IORedisClientPool(redisFactory, poolSize);
            await target.acquire(token);
            assert.strictEqual(redisFactory.callCount, poolSize);
        })

        it('should not create new redis connections for existing token before release is called', async () => {
            const poolSize = 0, token = Math.random().toString();
            const target = new IORedisClientPool(redisFactory, poolSize);
            assert.strictEqual(redisFactory.callCount, 0);
            await target.acquire(token);
            assert.strictEqual(redisFactory.callCount, 1);
            await target.acquire(token);
            assert.strictEqual(redisFactory.callCount, 1);
        })
    })

    describe('calling release', () => {
        it('should dispose connection which are created more than the pool size', async () => {
            const poolSize = 0, token = Math.random().toString();
            const target = new IORedisClientPool(redisFactory, poolSize);
            assert.strictEqual(redisFactory.callCount, 0);
            await target.acquire(token);  //set active redis client for token
            assert.strictEqual(redisFactory.callCount, 1);
            await target.release(token);
            assert.strictEqual(redisFactory.returnValues[0].quit.callCount, 1);
            assert.strictEqual(redisFactory.returnValues[0].disconnect.callCount, 1);
        })

        it('should not dispose connection when its under pool size ', async () => {
            const token = Math.random().toString();
            const target = new IORedisClientPool(redisFactory);
            assert.strictEqual(redisFactory.callCount, 6);
            await target.acquire(token);
            await target.release(token);
            assert.strictEqual(redisFactory.callCount, 6);
            redisFactory.returnValues.forEach((stubbedRedisInstance) => {
                assert.strictEqual(stubbedRedisInstance.quit.callCount, 0);
                assert.strictEqual(stubbedRedisInstance.disconnect.callCount, 0);
            });
        })

        it('should not dispose connection when non existing token is passed', async () => {
            let token = Math.random().toString();
            const target = new IORedisClientPool(redisFactory, 0);
            assert.strictEqual(redisFactory.callCount, 0);
            await target.acquire(token);
            assert.strictEqual(redisFactory.callCount, 1);
            await target.release("A token which does not exists");
            redisFactory.returnValues.forEach((stubbedRedisInstance) => {
                assert.strictEqual(stubbedRedisInstance.quit.callCount, 0);
                assert.strictEqual(stubbedRedisInstance.disconnect.callCount, 0);
            });
        })
    })

    describe('calling run', () => {
        it('should invoke redis call method when valid token and commands passed', async () => {
            const poolSize = 5, token = Math.random().toString(), commandArgs = ["set", "key", "value"];
            const target = new IORedisClientPool(redisFactory, poolSize);
            await target.acquire(token);
            await target.run(token, commandArgs);
            const redisConnections = Array.from(redisFactory.returnValues);
            const redisClientStub = redisConnections.pop();
            sinon.assert.calledOnceWithExactly(redisClientStub.call, 'set', 'key', 'value');
            redisConnections.forEach((stubbedRedisInstance) => {
                assert.strictEqual(stubbedRedisInstance.call.callCount, 0);
            });
        })

        it('should throw error when token is not acquired', async () => {
            const poolSize = 5, commandArgs = ["set", "key", "value"];
            const error = new Error("Please acquire a client with proper token");
            let token = Math.random().toString();
            const target = new IORedisClientPool(redisFactory, poolSize);
            assert.rejects(target.run(token, commandArgs), error);
            redisFactory.returnValues.forEach((stubbedRedisInstance) => {
                assert.strictEqual(stubbedRedisInstance.call.callCount, 0);
            });
        })
    })

    describe('calling pipeline', () => {
        it('should invoke redis multi method when transaction is set to true', async () => {
            const poolSize = 1, token = Math.random().toString(), commandArgs = [["hset", "key", "value"]];
            const target = new IORedisClientPool(redisFactory, poolSize);
            await target.acquire(token);
            const result = await target.pipeline(token, commandArgs, true);
            sinon.assert.calledOnceWithExactly(redisFactory.returnValues[0].multi, commandArgs);
            assert.deepEqual(result, [multiResult]);
        })

        it('should throw error when multi method return an error', async () => {
            const error = new Error("Something went wrong");
            const multiStub = sinon.stub().returns({ exec: sinon.stub().returns([[error, multiResult]]) });
            const redisStub = sinon.stub().returns({ multi: multiStub });
            const poolSize = 1, token = Math.random().toString(), commandArgs = [["hset", "key", "value"]];
            const target = new IORedisClientPool(redisStub, poolSize);
            await target.acquire(token);
            assert.rejects(target.pipeline(token, commandArgs), error);
            sinon.assert.calledOnceWithExactly(redisStub.returnValues[0].multi, commandArgs);
        })

        it('should invoke redis pipeline method when transaction is set to false', async () => {
            const poolSize = 1, token = Math.random().toString(), commandArgs = [["hset", "key", "value"]];
            const target = new IORedisClientPool(redisFactory, poolSize);
            await target.acquire(token);
            const result = await target.pipeline(token, commandArgs, false);
            sinon.assert.calledOnceWithExactly(redisFactory.returnValues[0].pipeline, commandArgs);
            assert.deepEqual(result, [pipelineResult]);
        })

        it('should throw error when pipeline method return an error', async () => {
            const error = new Error("Something went wrong");
            const pipelineStub = sinon.stub().returns({ exec: sinon.stub().returns([[error, multiResult]]) });
            const redisStub = sinon.stub().returns({ pipeline: pipelineStub });
            const poolSize = 1, token = Math.random().toString(), commandArgs = [["hset", "key", "value"]];
            const target = new IORedisClientPool(redisStub, poolSize);
            await target.acquire(token);
            assert.rejects(target.pipeline(token, commandArgs, false), error);
            sinon.assert.calledOnceWithExactly(redisStub.returnValues[0].pipeline, commandArgs);
        })

        it('should throw error when no token found in active redis client', async () => {
            const error = new Error("Please acquire a client with proper token");
            const poolSize = 1, token = Math.random().toString(), commandArgs = [["hset", "key", "value"]];
            const target = new IORedisClientPool(redisFactory, poolSize);
            assert.rejects(target.pipeline(token, commandArgs), error);
            sinon.assert.notCalled(redisFactory.returnValues[0].multi);
        })
    })

    describe('calling generateUniqueToken', () => {
        it('should return unique token with prefix provided', () => {
            const prefix = "task";
            const target = new IORedisClientPool(redisFactory, 0);
            const result1 = target.generateUniqueToken(prefix);
            const result2 = target.generateUniqueToken(prefix);
            assert.strictEqual(result1.length > (prefix.length + 1), true);
            assert.strictEqual(result1.split("-")[0], prefix);
            assert.strictEqual(result2.length > (prefix.length + 1), true);
            assert.strictEqual(result2.split("-")[0], prefix);
            assert.notStrictEqual(result1, result2);
        })
    })

    // describe('info', () => {
    //     it('should return radis connection details with default idle pool size', async () => {
    //         const redisStub = sinon.stub().returns({ call: sinon.stub() });
    //         const target = new IORedisClientPool(redisStub);
    //         assert.strictEqual(redisStub.callCount, 6);
    //         const result = target.info();
    //         const actualProperties = Object.keys(result).sort();
    //         const expectedProperties = ["Idle Size", "Current Active", "Pooled Connection", "Peak Connections"].sort();
    //         assert.deepStrictEqual(actualProperties, expectedProperties);
    //         assert.strictEqual(result['Idle Size'], 6);
    //         assert.strictEqual(result['Current Active'], 0);
    //         assert.strictEqual(result['Pooled Connection'], 6);
    //         assert.strictEqual(result['Peak Connections'], 6);
    //     })

    //     it('should return radis current active connection size as one when active redis client set in acquire method', async () => {
    //         const redisStub = sinon.stub().returns({ call: sinon.stub() });
    //         const poolSize = 5, token = Math.random().toString();
    //         const target = new IORedisClientPool(redisStub, poolSize);
    //         assert.strictEqual(redisStub.callCount, poolSize);
    //         await target.acquire(token);
    //         const result = target.info();
    //         assert.strictEqual(result['Current Active'], 1);
    //     })

    //     it('should return radis current active connection size as zero when idle pool size set to zero', async () => {
    //         const redisStub = sinon.stub().returns({ call: sinon.stub() });
    //         const poolSize = 0;
    //         const target = new IORedisClientPool(redisStub, poolSize);
    //         assert.strictEqual(redisStub.callCount, poolSize);
    //         const result = target.info();
    //         assert.strictEqual(result['Current Active'], 0);
    //     })

    //     it('should return radis current active connection size as zero when active redis client set and call release method', async () => {
    //         const redisStub = sinon.stub().returns({ call: sinon.stub() });
    //         const poolSize = 5, token = Math.random().toString();
    //         const target = new IORedisClientPool(redisStub, poolSize);
    //         assert.strictEqual(redisStub.callCount, 5);
    //         await target.acquire(token);
    //         await target.release(token);
    //         const result = target.info();
    //         assert.strictEqual(result['Current Active'], 0);
    //     })

    //     it('should return radis current active connection size as zero when active redis client set and call destroy method', async () => {
    //         const redisStub = sinon.stub().returns({ call: sinon.stub() });
    //         const poolSize = 5, token = Math.random().toString();
    //         const target = new IORedisClientPool(redisStub, poolSize);
    //         assert.strictEqual(redisStub.callCount, 5);
    //         await target.acquire(token);
    //         await target.destroy();
    //         const result = target.info();
    //         assert.strictEqual(result['Current Active'], 0);
    //         assert.strictEqual(result['Pooled Connection'], 0);
    //     })
    // })

    // describe('destroy', () => {
    //     it('should get call shutdown method when destroy method called', async () => {
    //         const redisStub = sinon.stub().returns({ quit: sinon.stub().resolves(), disconnect: sinon.stub() });
    //         const poolSize = 5;
    //         const target = new IORedisClientPool(redisStub, poolSize);
    //         assert.strictEqual(redisStub.callCount, 5);
    //         const shutdownSpy = sinon.spy(target, "shutdown");
    //         await target.destroy();
    //         sinon.assert.calledOnce(shutdownSpy);
    //     })
    // })

    // describe('shutdown', () => {
    //     it('should called redis connection quit and disconnect method when active redis and pool connections set', async () => {
    //         const redisStub = sinon.stub().returns({ quit: sinon.stub().resolves(), disconnect: sinon.stub() });
    //         const poolSize = 5, token = Math.random().toString();
    //         const target = new IORedisClientPool(redisStub, poolSize);
    //         assert.strictEqual(redisStub.callCount, poolSize);
    //         await target.acquire(token);
    //         await target.shutdown();
    //         const releasedClientStub = redisStub.returnValues[redisStub.returnValues.length - 1];
    //         assert.strictEqual(releasedClientStub.quit.callCount, poolSize);
    //         assert.strictEqual(releasedClientStub.disconnect.callCount, poolSize);
    //     })

    //     it('should not called redis connection when no active redis and pool connections available', async () => {
    //         const redisStub = sinon.stub().returns({ quit: sinon.stub().resolves(), disconnect: sinon.stub() });
    //         const poolSize = 0;
    //         const target = new IORedisClientPool(redisStub, poolSize);
    //         assert.strictEqual(redisStub.callCount, poolSize);
    //         await target.shutdown();
    //         sinon.assert.notCalled(redisStub);
    //     })
    // })

    describe('calling script', () => {
        it('should create script on redis client and invoke it when its not registered, with passed parameters', async () => {
            const command = 'some_command_name', scriptText = 'mock lua script', scriptFileAbsolutePath = 'filename.lua', poolSize = 1, token = Math.random().toString(), scriptKeys = ["a", "b", "c"], scriptValues = [1, 2, 3, 5];
            const readFileStub = sinon.stub(fs.promises, 'readFile').resolves(scriptText);
            const digestStub = { "digest": sinon.stub().returns(command) };
            const updateStub = { "update": sinon.stub().returns(digestStub) };
            const createHashStub = sinon.stub(crypto, "createHash").returns(updateStub as any);
            const target = new IORedisClientPool(redisFactory, poolSize, fs, crypto);
            redisFactory.returnValues[0][command] = sinon.stub();//Since this is a dynamic command created by ioredis setup it here.

            await target.acquire(token);
            await target.script(token, scriptFileAbsolutePath, scriptKeys, scriptValues);

            sinon.assert.calledOnceWithExactly(readFileStub, scriptFileAbsolutePath, { encoding: "utf-8" });
            sinon.assert.calledOnceWithExactly(createHashStub, "md5");
            sinon.assert.calledOnceWithExactly(updateStub.update, scriptText);
            sinon.assert.calledOnceWithExactly(digestStub.digest, "hex");
            sinon.assert.calledOnceWithExactly(redisFactory.returnValues[0].defineCommand, command, { lua: scriptText });
            sinon.assert.calledOnceWithExactly(redisFactory.returnValues[0][command], scriptKeys.length, scriptKeys, scriptValues);
        })

        it('should not re-define command when command is previously register', async () => {
            const command = 'some_command_name', scriptText = 'mock lua script', scriptFileAbsolutePath = 'filename.lua', poolSize = 1, token = Math.random().toString(), scriptKeys = ["a", "b", "c"], scriptValues = [1, 2, 3, 5];
            const readFileStub = sinon.stub(fs.promises, 'readFile').resolves(scriptText);
            const digestStub = { "digest": sinon.stub().returns(command) };
            const updateStub = { "update": sinon.stub().returns(digestStub) };
            const createHashStub = sinon.stub(crypto, "createHash").returns(updateStub as any);
            const target = new IORedisClientPool(redisFactory, poolSize, fs, crypto);
            redisFactory.returnValues[0][command] = sinon.stub();//Since this is a dynamic command created by ioredis setup it here.

            await target.acquire(token);
            await target.script(token, scriptFileAbsolutePath, scriptKeys, scriptValues);
            await target.script(token, scriptFileAbsolutePath, scriptKeys, scriptValues);

            sinon.assert.calledOnceWithExactly(readFileStub, scriptFileAbsolutePath, { encoding: "utf-8" });
            sinon.assert.calledOnceWithExactly(createHashStub, "md5");
            sinon.assert.calledOnceWithExactly(updateStub.update, scriptText);
            sinon.assert.calledOnceWithExactly(digestStub.digest, "hex");
            sinon.assert.calledOnceWithExactly(redisFactory.returnValues[0].defineCommand, command, { lua: scriptText });
            sinon.assert.calledTwice(redisFactory.returnValues[0][command]);
            sinon.assert.calledWithExactly(redisFactory.returnValues[0][command], scriptKeys.length, scriptKeys, scriptValues);
        })

        it('should throw error when no token is acquired before calling', async () => {
            const error = new Error("Please acquire a client with proper token");
            const command = 'some_command_name', scriptText = 'mock lua script', scriptFileAbsolutePath = 'filename.lua', poolSize = 1, token = Math.random().toString(), scriptKeys = ["a", "b", "c"], scriptValues = [1, 2, 3, 5];
            const readFileStub = sinon.stub(fs.promises, 'readFile').resolves(scriptText);
            const digestStub = { "digest": sinon.stub().returns(command) };
            const updateStub = { "update": sinon.stub().returns(digestStub) };
            const createHashStub = sinon.stub(crypto, "createHash").returns(updateStub as any);
            const target = new IORedisClientPool(redisFactory, poolSize, fs, crypto);
            redisFactory.returnValues[0][command] = sinon.stub();//Since this is a dynamic command created by ioredis setup it here.

            await assert.rejects(target.script(token, scriptFileAbsolutePath, scriptKeys, scriptValues), error);

            sinon.assert.notCalled(readFileStub);
            sinon.assert.notCalled(createHashStub);
            sinon.assert.notCalled(updateStub.update);
            sinon.assert.notCalled(digestStub.digest);
            sinon.assert.notCalled(redisFactory.returnValues[0].defineCommand);
            sinon.assert.notCalled(redisFactory.returnValues[0][command]);
        })

    })

    // describe('RedisClientClusterFactory', () => {
    //     it('should throw error when no connection details are pass in param', () => {
    //         const error = new Error("Inncorrect or Invalid Connection details, cannot be empty");
    //         const connectionDetails = new Array<string>();
    //         assert.rejects(async () => { IORedisClientPool.IORedisClientClusterFactory(connectionDetails) }, error);
    //     })

    //     it('should invoke redis connection when only one connection details pass in param', () => {
    //         const connectionDetails = ['redis://127.0.0.1:6381'];
    //         const redisStub = sinon.stub();
    //         IORedisClientPool.IORedisClientClusterFactory(connectionDetails, redisStub);
    //         sinon.assert.calledOnceWithExactly(redisStub, sinon.match.any, connectionDetails);
    //     })

    //     it('should invoke redis cluster connection when mulitple connection details pass in param', () => {
    //         const connectionDetails = ['redis://127.0.0.1:6381', 'redis://127.0.0.1:6382'];
    //         const clusterStub = sinon.stub();
    //         IORedisClientPool.IORedisClientClusterFactory(connectionDetails, clusterStub);
    //         sinon.assert.calledOnceWithExactly(clusterStub, sinon.match.any, [connectionDetails, sinon.match.any]);
    //     })

    //     it('should invoke redis cluster connection when duplicate connection details pass in param', () => {
    //         const connectionDetails = ['redis://127.0.0.1:6381', 'redis://127.0.0.1:6381'];
    //         const clusterStub = sinon.stub();
    //         IORedisClientPool.IORedisClientClusterFactory(connectionDetails, clusterStub);
    //         sinon.assert.calledOnceWithExactly(clusterStub, sinon.match.any, [['redis://127.0.0.1:6381'], sinon.match.any]);
    //     })
    // })


});