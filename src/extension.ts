import * as vsc from 'vscode';
import { ZigHost } from './host';

const ZIG_MODE: vsc.DocumentFilter = { language: 'zig', scheme: 'file' }


export function activate(ctx: vsc.ExtensionContext) {

	// Create the language helper.
	const helper = new ZigLanguageHelper()

	// Add the completion helper.
	ctx.subscriptions.push(
		vsc.languages.registerCompletionItemProvider(ZIG_MODE,
			helper,
			'.'
		)
	)
}

// this method is called when your extension is deactivated
export function deactivate() {}


function trylog(def?: any) {
	return function trylog(target: any, key: string, desc: PropertyDescriptor) {
		const original = desc.value
		desc.value = function () {
			try {
				return original.apply(this, arguments)
			} catch (e) {
				(this as any).log(e.message)
				(this as any).log(JSON.stringify(e.stack))
				return def
			}
		}
	}
}

export class ZigLanguageHelper implements vsc.CompletionItemProvider {

	host!: ZigHost
	channel = vsc.window.createOutputChannel('zig-tmp-completion')

	constructor() {
		this.init()
	}

	@trylog()
	init() {
		const config = vsc.workspace.getConfiguration('zig');
		const zig_path = config.get<string>('zigPath') || 'zig';

		// Right now, this is not a very good solution, as I could have several workspaces
		this.host = new ZigHost(zig_path, n => this.channel.appendLine(n))
	}

	log(st: string) {
		this.channel.appendLine(st)
	}

	@trylog([])
	provideCompletionItems(doc: vsc.TextDocument, pos: vsc.Position) {
		// this completion plugin works with offsets, not line / col
		const offset = doc.offsetAt(pos)
		const f = this.host.addFile(doc.fileName, doc.getText())
		return f.scope.getCompletionsAt(offset).map(c => {
			var r = new vsc.CompletionItem(c.name.value)
			r.commitCharacters = ['.', '(', ')']
			return r
		})
	}
}