import ts from "typescript";

export async function compile(source: string, fileName: string) {
	const result = ts.transpileModule(source, {
		compilerOptions: {
			module: ts.ModuleKind.ES2015,
			target: ts.ScriptTarget.ES2020,
			allowJs: true,
			esModuleInterop: true,
			resolveJsonModule: true,
			inlineSourceMap: true,
		},
		fileName,
	});

	return result.outputText;
}
