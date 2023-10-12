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
	console.log(`Makeing FL: Str=${str} File=${fStr} Line=${lineNo}`);
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
				vscode.window.showInformationMessage(
					`Closing ${btChannels.length} ${suffixStr}.`);
				btChannels.forEach(c => c.dispose());
			}));
}

// This method is called when your extension is deactivated
export function deactivate() {}

function getWebviewOptions(extensionUri: vscode.Uri): vscode.WebviewOptions {
	return {
		enableScripts: true,
		localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')]
	};
}

class StacktracePanel {
	public static currentPanel: StacktracePanel | undefined;

	public static readonly viewType = 'stPanel';

	private readonly _panel: vscode.WebviewPanel;
	private readonly _extensionUri: vscode.Uri;
	private _disposables: vscode.Disposable[] = [];

	public static createOrShow(extensionUri: vscode.Uri) {
		const column = vscode.window.activeTextEditor
			? vscode.window.activeTextEditor.viewColumn
			: undefined;

		// If we already have a panel, show it.
		if (StacktracePanel.currentPanel) {
			StacktracePanel.currentPanel._panel.reveal(column);
			return;
		}

		// Otherwise, create a new panel.
		const panel = vscode.window.createWebviewPanel(
			StacktracePanel.viewType,
			'Stacktrace',
			column || vscode.ViewColumn.One,
			getWebviewOptions(extensionUri),
		);

		StacktracePanel.currentPanel = new StacktracePanel(panel, extensionUri);
	}

	public static revive(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
		StacktracePanel.currentPanel = new StacktracePanel(panel, extensionUri);
	}

	private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
		this._panel = panel;
		this._extensionUri = extensionUri;

		// Set the webview's initial html content
		this._update();

		// Listen for when the panel is disposed
		// This happens when the user closes the panel or when the panel is closed programmatically
		this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

		// Update the content based on view changes
		this._panel.onDidChangeViewState(
			e => {
				if (this._panel.visible) {
					this._update();
				}
			},
			null,
			this._disposables
		);

		// Handle messages from the webview
		this._panel.webview.onDidReceiveMessage(
			message => {
				switch (message.command) {
					case 'alert':
						vscode.window.showErrorMessage(message.text);
						return;
				}
			},
			null,
			this._disposables
		);
	}

	public doRefactor() {
		// Send a message to the webview webview.
		// You can send any JSON serializable data.
		this._panel.webview.postMessage({ command: 'refactor' });
	}

	public dispose() {
		StacktracePanel.currentPanel = undefined;

		// Clean up our resources
		this._panel.dispose();

		while (this._disposables.length) {
			const x = this._disposables.pop();
			if (x) {
				x.dispose();
			}
		}
	}

	private _update() {
		const webview = this._panel.webview;
		this._panel.title = "StackTrace Viewer";
		this._panel.webview.html = this._getHtmlForWebview(webview);
	}

	private _getHtmlForWebview(webview: vscode.Webview) {
		// Local path to main script run in the webview
		const scriptPathOnDisk = vscode.Uri.joinPath(this._extensionUri, 'media', 'main.js');

		// And the uri we use to load this script in the webview
		const scriptUri = webview.asWebviewUri(scriptPathOnDisk);

		// Local path to css styles
		const styleResetPath = vscode.Uri.joinPath(this._extensionUri, 'media', 'reset.css');
		const stylesPathMainPath = vscode.Uri.joinPath(this._extensionUri, 'media', 'vscode.css');

		// Uri to load styles into webview
		const stylesResetUri = webview.asWebviewUri(styleResetPath);
		const stylesMainUri = webview.asWebviewUri(stylesPathMainPath);

		// Use a nonce to only allow specific scripts to be run
		const nonce = getNonce();

		return `<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">

				<!--
					Use a content security policy to only allow loading images from https or from our extension directory,
					and only allow scripts that have a specific nonce.
				-->
				<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; img-src ${webview.cspSource} https:; script-src 'nonce-${nonce}';">

				<meta name="viewport" content="width=device-width, initial-scale=1.0">

				<link href="${stylesResetUri}" rel="stylesheet">
				<link href="${stylesMainUri}" rel="stylesheet">

				<title>Cat Coding</title>
			</head>
			<body>
				<h1>TeST</h1>
				<h1 id="lines-of-code-counter">0</h1>

				<script nonce="${nonce}" src="${scriptUri}"></script>
			</body>
			</html>`;
	}
}

function getNonce() {
	let text = '';
	const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	for (let i = 0; i < 32; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return text;
}
