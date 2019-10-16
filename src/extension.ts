import * as vsc from 'vscode';
import { ZigHost } from './host';
import { ContainerDeclaration, FunctionDefinition, Expression, Identifier, DotBinOp, ContainerField } from './ast';

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

	ctx.subscriptions.push(vsc.languages.registerDefinitionProvider(ZIG_MODE, helper))
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

export class ZigLanguageHelper implements vsc.CompletionItemProvider, vsc.DefinitionProvider {

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
		var n = f.scope.getNodeAt(offset) // to check for pubs.
		if (n instanceof Identifier && n.parent instanceof DotBinOp && n.parent.rhs === n)
			n = n.parent.lhs as Expression
		return n.getCompletions()
			.filter(c => {
				// return true
				return c.pub || c.file_block.file.path === doc.fileName
			})
			.map(c => {
				var r = new vsc.CompletionItem(c.name.value)
				r.insertText = c.name.value

				const typ = c.getType()
				if (typ) {
					// this.log(c.constructor.name + ' - ' + typ.constructor.name)
					const rep = typ.repr()
					r.label = r.label + ': ' + rep
					r.detail = rep
				}

				if (typ instanceof ContainerDeclaration)
					r.kind = K.Struct
				else if (typ instanceof FunctionDefinition)
					r.kind = K.Function
				else if (c instanceof ContainerField)
					r.kind = K.Property
				else
					r.kind = K.Variable

				// else if (typ instanceof )
				r.commitCharacters = ['.', '(', ')', ',', ';']
				return r
			})
	}

	@trylog(null)
	provideDefinition(doc: vsc.TextDocument, pos: vsc.Position) {
		const offset = doc.offsetAt(pos)
		const f = this.host.addFile(doc.fileName, doc.getText())
		const n = f.scope.getNodeAt(offset) as Expression // to check for pubs.
		const r = n?.getType()
		if (!r) return null
		return new vsc.Location(
			vsc.Uri.file(r.file_block.file.path),
			new vsc.Position(r.range[0].line, r.range[0].col)
		)
	}
}