import * as vsc from 'vscode';
import { ZigHost } from './host';
import { ContainerDeclaration, FunctionDefinition } from './ast';

const ZIG_MODE: vsc.DocumentFilter = { language: 'zig', scheme: 'file' }
const K = vsc.CompletionItemKind

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
				(this as any).log(e.message + ' ' + e.stack)
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
		const n = f.scope.getNodeAt(offset) // to check for pubs.
		return n.getCompletions()
			.filter(c => {
				// return true
				return c.pub || c.file_block.file.path === doc.fileName
			})
			.map(c => {
				var r = new vsc.CompletionItem(c.name.value)

				const typ = c.getType()
				if (typ instanceof ContainerDeclaration)
					r.kind = K.Struct
				else if (typ instanceof FunctionDefinition)
					r.kind = K.Function

				// else if (typ instanceof )
				r.commitCharacters = ['.', '(', ')', ',', ';']
				return r
			})
	}
}