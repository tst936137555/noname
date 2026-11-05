import concurrently from "concurrently";
const { result } = concurrently(
	[
		{ command: "pnpm -F @noname/fs dev --debug --dirname=../../apps/core", name: "files" },
		{ command: "pnpm -F noname dev --open", name: "game" },
	],
	{ killOthersOn: ["failure", "success"], prefix: "name" }
);
result.catch(() => {
	process.exitCode = 1;
});
