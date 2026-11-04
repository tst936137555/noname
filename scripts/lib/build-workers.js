import { availableParallelism } from "node:os";
import { Worker } from "node:worker_threads";

/** 包体只有三个输出目录，限制线程数以控制 Vite 的峰值内存。 */
export function buildConcurrency(value = process.env.NONAME_BUILD_WORKERS) {
	if (value !== undefined && !/^[1-9]\d*$/.test(value)) {
		throw new Error("NONAME_BUILD_WORKERS 必须是正整数");
	}
	return Math.min(value === undefined ? availableParallelism() : Number(value), 3);
}

/** 每个任务独占一个线程；失败时停止派发任务，并等待所有线程退出。 */
export async function runBuildWorkers(url, tasks, concurrency = buildConcurrency()) {
	if (!Number.isInteger(concurrency) || concurrency < 1) throw new Error("线程数必须是正整数");
	const active = new Set();
	let next = 0;
	let failed = false;
	try {
		await Promise.all(
			Array.from({ length: Math.min(concurrency, tasks.length) }, async () => {
				while (!failed && next < tasks.length) {
					const task = tasks[next++];
					try {
						await new Promise((resolve, reject) => {
							const worker = new Worker(url, { workerData: task });
							active.add(worker);
							worker.once("error", reject);
							worker.once("exit", code => {
								active.delete(worker);
								if (code === 0) resolve();
								else reject(new Error(`构建线程退出，退出码 ${code}`));
							});
						});
					} catch (error) {
						failed = true;
						throw error;
					}
				}
			})
		);
	} finally {
		await Promise.all([...active].map(worker => worker.terminate()));
	}
}
