StackTraceViewer is a productivity / quality-of-life extension that pulls
 stack-trace / backtrace and link file/line references relevant to the src-tree
 in the workspace. Linking helps quick navigation between trace and
 corresponding location in the src-tree.

## Features

Execute command
* `stv: Load backtrace(s)` to pull source-file linked backtraces from clipboard.
* `stv: Close all backtraces` to close all backtrace panes.

Bind any keyboard-shortcut of choice to these commands for better ergonomics.

## Known Issues

None

## Release Notes

### 0.0.2

- Bug fix for infinite recursion for non-existing files.

### 0.0.1

- Support for Golang source-line linking.

---

## Code

Contributions are welcome.
Repository URL: https://github.com/janmejay/stv.vscode