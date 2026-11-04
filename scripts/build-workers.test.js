import test from "node:test";
import assert from "node:assert/strict";
import { buildConcurrency, runBuildWorkers } from "./lib/build-workers.js";

const worker = source => new URL(`data:text/javascript,${encodeURIComponent(source)}`);
const imports = 'import { workerData, threadId } from "node:worker_threads";';

test("线程数有上限，非法配置直接报错", () => {
	assert.equal(buildConcurrency("1"), 1);
	assert.equal(buildConcurrency("32"), 3);
	assert.ok(buildConcurrency() >= 1);
	for (const value of ["", "0", "-1", "1.5", "abc"]) assert.throws(() => buildConcurrency(value));
});

test("两个真实线程同时执行，每个排队任务只执行一次", { timeout: 10000 }, async () => {
	const state = new SharedArrayBuffer(6 * Int32Array.BYTES_PER_ELEMENT);
	await runBuildWorkers(
		worker(
			imports +
				`
		const { state, index } = workerData;
		const view = new Int32Array(state);
		Atomics.add(view, index, 1);
		if (index < 2) {
			Atomics.add(view, 4, 1);
			Atomics.notify(view, 4);
			while (Atomics.load(view, 4) < 2) {
				if (Atomics.wait(view, 4, 1, 3000) === "timed-out") throw new Error("任务没有并行执行");
			}
		}
		Atomics.store(view, 5, threadId);
	`
		),
		Array.from({ length: 4 }, (_, index) => ({ state, index })),
		2
	);
	assert.deepEqual([...new Int32Array(state).slice(0, 4)], [1, 1, 1, 1]);
	assert.ok(new Int32Array(state)[5] > 0);
});

test("失败会终止其他线程，并且不再派发排队任务", { timeout: 10000 }, async () => {
	const state = new SharedArrayBuffer(4);
	await assert.rejects(
		runBuildWorkers(
			worker(
				imports +
					`
		if (workerData.index === 0) throw new Error("编译失败");
		if (workerData.index === 1) setInterval(() => {}, 1000);
		if (workerData.index === 2) Atomics.add(new Int32Array(workerData.state), 0, 1);
	`
			),
			[0, 1, 2].map(index => ({ index, state })),
			2
		),
		/编译失败/
	);
	assert.equal(new Int32Array(state)[0], 0);
});

test("非零退出码也会使构建失败，空队列无需启动线程", async () => {
	await assert.rejects(runBuildWorkers(worker("process.exit(2)"), [{}], 1), /退出码 2/);
	await runBuildWorkers(worker("throw new Error()"), [], 1);
});
