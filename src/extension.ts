import * as vscode from 'vscode';

const pathTok = "/";

class FileLine {
	readonly file: string;
	readonly line: number;

	constructor(file: string, line: number) {
		this.file = file;
		this.line = line;
	}
}

class MatchingFile {
	readonly givenPath: string;
	readonly workspacePath: string;

	constructor(stackTracePath: string, workspacePath: string) {
		this.givenPath = stackTracePath;
		this.workspacePath = workspacePath;
	}
}

class TraceLine {
	readonly origStr: string;
	readonly origFL: FileLine | undefined;
	readonly matchingPath: string | undefined;

	constructor(origStr: string, origFL: FileLine | undefined, matchingPath: string | undefined) {
		this.origStr = origStr;
		this.origFL = origFL;
		this.matchingPath = matchingPath;
	}
}

function findUniquePath(pathParts: string[], min: number, max: number): Thenable<string> {
	const l = pathParts.length;
	const s = Math.floor((min + max) / 2);
	var glob = "**" + pathTok;
	for (var i = s; i < l - 1; i++) {
		glob += (pathParts[i] + pathTok);
	}
	glob += pathParts[l - 1];
	const matchingPathsT = vscode.workspace.findFiles(glob, '**/.git/**', 2);
	return matchingPathsT.then(
		paths => {
			if (paths.length === 1) {
				// console.log(`Found unique path ${paths[0]}`);
				return paths[0].fsPath;
			} else if (paths.length === 0) {
				// console.log(`Found no path for ${glob} (${min}, ${max})`);
				if (s >= max - 1) {
					return "";
				}
				return findUniquePath(pathParts, s, max);
			} else {
				// console.log(`Found too many paths for ${paths} for ${glob} (${min}, ${max})`);
				if (s <= min + 1) {
					return "";
				}
				return findUniquePath(pathParts, min, s);
			}
		}
	);
}

function computeAbsPath(givenPath: string): Thenable<MatchingFile> {
	const parts = givenPath.split(pathTok);
	//console.log(`Starting lookup for ${givenPath}`);
	return findUniquePath(parts, 0, parts.length - 1)
			.then(p => new MatchingFile(givenPath, p));
}

function makeFileLine(str: string): (FileLine | undefined) {
	const lineSep = str.lastIndexOf(':');

	if (lineSep === -1 || lineSep === str.length - 1) {
		return undefined;
	}

	const colonSuffix = str.substring(lineSep + 1);

	const lineNo = parseInt(colonSuffix, 10);
	if (isNaN(lineNo)) {
		return undefined;
	}

	const fStr = str.substring(0, lineSep);
	// console.log(`Makeing FL: Str=${str} File=${fStr} Line=${lineNo}`);
	return new FileLine(fStr, lineNo);
}

function findFileLine(str: string): (FileLine | undefined) {
	const pathTokIdx = str.indexOf(pathTok);
	if (pathTokIdx === -1) {
		return undefined;
	}

	var pathStartIdx = pathTokIdx;
	if ((pathTokIdx > 0) && str[pathTokIdx - 1] !== ' ') { // rel path
		for (var i = pathTokIdx - 1; i >= 0; i--) {
			if (str[i] === ' ' || str[i] === '\t') {
				pathStartIdx = i + 1;
				break;
			}
		}
	}
	const suffixedPath = str.substring(pathStartIdx);
	const endIdx = suffixedPath.indexOf(" ");
	if (endIdx === -1) {
		return makeFileLine(suffixedPath);
	} else {
		return makeFileLine(suffixedPath.substring(0, endIdx));
	}
}

function processTraceLine(str: string): Thenable<TraceLine> {
	const fl = findFileLine(str);
	if (!fl) {
		return Promise.resolve(new TraceLine(str, undefined, undefined));
	}
	return computeAbsPath(fl.file)
		.then(p => new TraceLine(str, fl, p.workspacePath));
}

var backtraceCounter: number = 1;

var allBacktraceChannels: vscode.OutputChannel[] = [];

function presentBacktrace(text: string) {
	const textLines = text.split('\n');
	const btId = backtraceCounter++;
	const statusMsg = vscode.window.setStatusBarMessage(
		`Processing ${textLines.length} of backtrace(${btId})...`);
	Promise
		.all(textLines.map(processTraceLine))
		.then(
			ptls => {
				const oc = vscode.window.createOutputChannel(
					`Backtrace ${btId} (${textLines.length} lines)`,
					"Log");
				allBacktraceChannels.push(oc);
				ptls.forEach(
					ptl => {
						if (ptl.matchingPath) {
							oc.appendLine(`${ptl.origStr} -> ${ptl.matchingPath}:${ptl.origFL?.line}`);
						} else {
							oc.appendLine(ptl.origStr);
						}
					}
				);
				statusMsg.dispose();
				oc.show(true);
			}
		);
}

export function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(
		vscode.commands.registerCommand(
			'stv.load',
			() => {
				vscode.env.clipboard.readText().then(presentBacktrace);
			}));

	context.subscriptions.push(
		vscode.commands.registerCommand(
			'stv.closeAll',
			() => {
				const btChannels = allBacktraceChannels;
				allBacktraceChannels = [];
				const l = btChannels.length;
				var suffixStr = "backtraces";
				if (l === 1) {
					suffixStr = "backtrace";
				}
				btChannels.forEach(c => c.dispose());
				vscode.window.showInformationMessage(
					`Closed ${btChannels.length} ${suffixStr}.`);
			}));
}

// This method is called when your extension is deactivated
export function deactivate() {}
