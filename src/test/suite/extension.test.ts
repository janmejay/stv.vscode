import * as assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
import * as e from '../../extension';

suite('Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');

	test('Sample test', () => {
		assert.strictEqual(-1, [1, 2, 3].indexOf(5));
		assert.strictEqual(-1, [1, 2, 3].indexOf(0));
	});

	test('Common suffix computation', () => {
		// TODO: get this working
		assert.strictEqual(
			"/sdmain1/src/go/src/rubrik/cqlproxy/server/server.go".length,
			e.commonSuffixLen(
				"/home/ubuntu/code/sdmain1/src/go/src/rubrik/cqlproxy/server/server.go",
				"/home/janmejay/projects/rubrik/sdmain1/src/go/src/rubrik/cqlproxy/server/server.go"));
	});
});
