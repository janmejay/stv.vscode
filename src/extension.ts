import * as vscode from 'vscode';

const pathTok = "/";

class MatchingFile {
	readonly givenPath: string;

	readonly workspacePath: string;

	constructor(stackTracePath: string, workspacePath: string) {
		this.givenPath = stackTracePath;
		this.workspacePath = workspacePath;
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
				console.log(`Found unique path ${paths[0]}`);
				return paths[0].fsPath;
			} else if (paths.length === 0) {
				console.log(`Found no path for ${glob} (${min}, ${max})`);
				if (s >= max - 1) {
					return "";
				}
				return findUniquePath(pathParts, s, max);
			} else {
				console.log(`Found too many paths for ${paths} for ${glob} (${min}, ${max})`);
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
	console.log(`Starting lookup for ${givenPath}`);
	return findUniquePath(parts, 0, parts.length - 1)
			.then(p => new MatchingFile(givenPath, p));
}

export function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(
		vscode.commands.registerCommand(
			'stv.hola',
			() => {
				const urisT = vscode.workspace.findFiles('**/cqlproxy/server/server.go', '**​/.git/**', 2);
				StacktracePanel.createOrShow(context.extensionUri);
				vscode.window.showInformationMessage('Hello World from StacktraceViewer!');
				console.log("Hola!");
				const oc = vscode.window.createOutputChannel("foo output chan", "Log");
				oc.appendLine("/home/janmejay/projects/rubrik/sdmain1/src/go/src/rubrik/cqlproxy/server/server.go:161");
				oc.appendLine("./cqlproxy/server/server.go:161");
				oc.appendLine("/home/janmejay/projects/rubrik/sdmain1/src/go/src/rubrik/cqlproxy/cdmserver/db2_mc_test.go:42");
				oc.appendLine("cqlproxy/cdmserver/db2_mc_test.go:42");
				oc.appendLine("foo");
				urisT.then(uris => uris.forEach(uri => {
					oc.appendLine(`uri: ${uri}`);
				}));


				const samplePaths: string[] = [
					"/home/ubuntu/code/sdmain1/src/go/src/rubrik/vendor/github.com/janmejay/jnigi/cwrapper.go",
					"/home/ubuntu/code/sdmain1/src/go/src/rubrik/cqlproxy/sch/sch_test.go",
					"/usr/local/go/src/testing/testing.go",
					"/home/ubuntu/code/sdmain1/src/go/src/rubrik/cqlproxy/server/server.go",
				];

				Promise.all(samplePaths.map(p => computeAbsPath(p))).then(
					paths => {
						paths.forEach(
							mp => {
								oc.appendLine(`MAP(${mp.givenPath}) = ${mp.workspacePath}`);
							}
						);
					}
				);

				oc.show(true);
			}));

	context.subscriptions.push(
		vscode.commands.registerCommand(
			'stv.warn',
			() => {
				const uri = vscode.Uri.parse(`${vscode.env.uriScheme}://jj.stacktraceviewer`);
				vscode.window.showWarningMessage(`You have been warned ${uri}!`);
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
