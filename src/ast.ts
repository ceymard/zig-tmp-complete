
import { Node } from "./libparse"
import { File } from './host'

export type Opt<T> = T | null | undefined
export type Names = Declaration[]


// FIXME missing Node.getDeclarations

export class ZigNode extends Node {

  parent!: ZigNode

  get file_block(): FileBlock {
    var n = this as ZigNode
    while (n.parent)
      n = n.parent
    return n as FileBlock
  }

  log(s: string) {
    const f = this.queryParent(FileBlock)
    f?.file.host.log(this.constructor.name + ' ' + s)
  }

  getCompletionsAt(offset: number): Declaration[] {
    const node = this.getNodeAt(offset)
    return node.getCompletions()
  }

  getCompletions(): Declaration[] {
    if (!(this instanceof Expression)) return []
    var def = this.getDefinition()
    return Object.values(def?.getMembers() ?? {})
  }

  getNodeAt(n: number): ZigNode {
    return super.getNodeAt(n) as ZigNode
  }

  getAvailableNames(): Names {
    var own = this.getOwnNames()
    if (this.parent) {
      own = [...this.parent.getAvailableNames(), ...own]
    }
    return own
  }

  getDeclaration(name: string): Declaration | undefined {
    return this.getAvailableNames().filter(d => d.name.value === name)[0]
  }

  getOwnNames(): Names {
    return []
  }

}


export class Expression extends ZigNode {

  /**
   * For a given ast node, get the declaration corresponding to this value.
   * The declaration might be a primitive type, or it might me a container declaration.
   * This will mostly work on
   *
   *   - Identifiers
   *   - Pointers
   *   - Optionals
   *   - Array access items
   *   - exp.exp
   *   - Function calls
   */
  getDefinition(): Definition | undefined {
    this.log('!')
    return
  }

  getOriginalDeclaration() {

  }

  repr() { return '#n/a' + this.constructor.name }

}


export class Definition extends Expression {

  /**
   * Only used when in a :type arm.
   */
  getContainerType(): Definition | undefined {
    if (this instanceof ContainerDefinition)
      return new ContainerType(this)
    return this
  }

  doc() {
    const p = this.queryParent(Declaration) // try to find out if we have a declaration
    return p?.doc ?? ''
  }

  getDefinition() {
    return this
  }

  getMembers(): Names {
    return []
  }

  repr() { return '?n/a' }

}



export class TypeExpression extends Expression {

}


export class Declaration extends Expression {
  pub = false
  comptime = false
  extern = false
  doc: Opt<string>
  name!: Identifier
  type: Opt<Expression>
  value: Opt<Expression> // when used with extern, there may not be a value

  repr() { return `${this.name?.value}: ${this.type?.repr() || '#n/a'}` }

  getDefinition(): Definition | undefined {
    return this.type?.getDefinition()?.getContainerType() ?? this.value?.getDefinition()
  }

}


/**
 *
 */
export class Block extends Expression {

  comptime = false
  label: Opt<string>

  statements: ZigNode[] = []
  import_namespaces: UsingNamespace[] = []

  // used when the block is asked what type it is...
  breaks: Expression[] = []

  getOwnNames(): Names {
    var res = [] as Names
    for (var s of this.statements) {
      if (s instanceof Declaration)
        res.push(s)
    }
    return res
  }

}



export class LeadingDotAccess extends Expression {
  name!: Identifier
}


export class ErrorField extends Expression {
  name!: Identifier
}

export class ErrorUnion extends Expression {
  fields = [] as ErrorField[]
}

export class TryExpression extends Expression {
  exp!: Expression
}

export class Undefined extends Expression { }
export class Null extends Expression { }
export class Promise extends Expression { }
export class Unreachable extends Expression { }
export class True extends Expression { }
export class False extends Expression { }


export class Literal extends Expression {
  value = ''
  repr() { return this.value }
}

export class Identifier extends Literal {

  doc: Opt<string>

  repr() { return this.value }

  getDefinition() {
    return this.getDeclaration(this.value)?.getDefinition()
  }

}

export class StringLiteral extends Literal { }
export class CharLiteral extends Literal { }
export class BooleanLiteral extends Literal { }
export class IntegerLiteral extends Literal { }
export class FloatLiteral extends Literal { }

export class PrimitiveType extends Definition {
  name!: Identifier
  repr() { return this.name?.value || '??' }
}

export class TypeType extends TypeExpression { }
export class VarType extends TypeExpression { }
export class Dot3Type extends TypeExpression { }

export class ExpressionList<T extends Expression> extends TypeExpression {
  args = [] as T[]
}

export class FunctionCall extends TypeExpression {
  lhs!: Expression
  args!: ExpressionList<Expression>

  getDefinition() {
    // maybe store args in a weakref to have a reference to the result somewhere
    const typ = this.lhs.getDefinition()
    if (typ instanceof FunctionDefinition) {
      typ.current_args = this.args.args
      return typ.proto.return_type?.getDefinition()
      // return typ.proto.return_type?.getType(true)
    }
    return undefined
  }
}


export class BuiltinFunctionCall extends Expression {
  name = ''
  args!: ExpressionList<Expression>

  getDefinition(): Definition | undefined {
    if (this.name === '@import' && this.args.args.length === 1) {
      return this.handleImport()
    }
    if (this.name === '@cImport') {
      return this.handleCImport()
    }
    if (this.name === '@This') {
      // Get the current container.
      var res = this.queryParent(ContainerDefinition) ?? undefined
      this.log('@This() ' + res?.constructor.name)
      return res
    }
    return
  }

  handleCImport(): Definition | undefined {
    const fb = this.queryParent(FileBlock)
    return fb?.file.host.getCFile(fb.file.path)?.scope
  }

  handleImport(): Definition | undefined {
    const a = this.args.args[0]
    if (!(a instanceof StringLiteral)) return
    const fb = this.queryParent(FileBlock)
    return fb?.file.host.getZigFile(fb.file.path, a.value.slice(1, -1))?.scope
  }

}

////////////////////////////////////////////////////////

export class FunctionArgumentDeclaration extends Declaration {
  comptime = false

  // getType() {
  //   // check if the type is comptime
  //   if (this.comptime && this.type instanceof PrimitiveType && this.type.name.value === 'type') {
  //     const proto = this.parent
  //     if (!(proto instanceof FunctionPrototype)) return;
  //     const def = proto.parent
  //     if (!(def instanceof FunctionDefinition)) return;
  //     if (!def.current_args) return;
  //     const idx = def.proto.args.indexOf(this)
  //     return def.current_args[idx]?.getType()
  //   }

  //   return super.getType()
  // }

}


export class FunctionPrototype extends Expression {
  extern = false
  ident: Opt<Identifier>
  args = [] as FunctionArgumentDeclaration[]
  return_type: Opt<Expression>
  pub = false

  repr() { return `fn (${this.args.map(a => a.repr()).join(', ')}) ${this.return_type?.repr() || '#n/a'}` }

  // getReturnType(): TypeExpression | undefined {
  //   const p = this.parent
  //   if (p instanceof FunctionDefinition && p.returns.length > 0) {
  //     var r = p.returns[0].exp?.getType()
  //     return r
  //   }
  // }

}


export class FunctionDefinition extends Definition {
  pub = false
  proto!: FunctionPrototype
  block: Opt<Block>
  returns: ReturnExpression[] = []

  current_args: Expression[] = []

  repr() { return this.proto.repr() }

  firstArgIsContainer(t: Definition) {
    const a = this.proto.args
    if (!a[0]) return false
    const typ = a[0].type?.getDefinition()
    if (!typ) return false
    if (typ instanceof PointerDefinition) {
      const pointed = typ.rhs?.getDefinition()
      return pointed === t || pointed instanceof ContainerType && pointed.cont === t
    }
    return typ === t
  }

  getOwnNames(): Names {
    var res = [] as Names
    for (var a of this.proto.args) {
      if (!a.name) continue
      res.push(a)
    }
    return res
  }
}


export class VariableDeclaration extends Declaration {
  static fake(name: string, type: Expression | undefined, from_node: Expression) {
    var res = new VariableDeclaration()
      .set('name', new Identifier().set('value', name))
      .set('type', type)
      .set('pub', true)
    res.parent = from_node
    return res
  }
}


export class ContainerField extends Declaration {
  pub = true
}


// FIXME should extend block to reuse the importnamespace
export class ContainerDefinition extends Definition {
  extern = false
  packed = false

  members: ZigNode[] = []

  repr() {
    const p = this.queryParent(VariableDeclaration)
    if (p) return `${p.name?.value}`
    // const p = this.queryParent()
    return '#n/a'
  }

  getOwnNames() {
    var res = [] as Names
    for (var s of this.members)
      if (s instanceof Declaration && !(s instanceof ContainerField))
        res.push(s)
    return res
  }

  getMembers(): Names {
    return this.getOwnNames()
  }

  getContainerNames(): Names {
    // Members of a container are its very own declarations, not all the ones in scope.
    var res = [] as Names
    for (var s of this.members) {
      if (s instanceof Declaration && s instanceof ContainerField ||
        s instanceof VariableDeclaration && s.value instanceof FunctionDefinition && s.value.firstArgIsContainer(this)) {
        res.push(s)
      }
    }
    return res
  }

  getInstanceMembers(): Names {
    var res = {} as Names
    for (var m of this.members) {
      if (m instanceof ContainerField)
        res.push(m)
    }
    return res
  }

}


export class EnumDefinition extends ContainerDefinition {
  opt_type = null as Expression | null
}


export class StructDefinition extends ContainerDefinition {

}


export class UnionDeclaration extends ContainerDefinition {
  opt_enum = null as Expression | null
}


export class UsingNamespace extends Expression {

  pub = false
  exp!: Expression

  onParsed() {
    // get the closest scope and tell it it should import us.
    const block = this.queryParent(Block)
    if (!block) return
    block.import_namespaces.push(this)
  }

}


export type TypeModifiers = {
  align?: Opt<Expression>
  volatile?: Opt<boolean>
  const?: Opt<boolean>
  allowzero?: Opt<boolean>
}

export namespace TypeModifiers {
  export function repr(t: TypeModifiers) {
    const r = Object.keys(t).join(' ')
    return r ? r + ' ' : r
  }
}


export class PromiseType extends Expression {
  rhs!: Expression
}

export class Optional extends Expression {
  rhs!: Expression

  repr() { return `?${this.rhs.repr()}` }

}

export class Pointer extends Expression {
  rhs!: Expression
  kind!: string
  modifiers: TypeModifiers = {}

  getDefinition() {
    return new PointerDefinition(this.kind, this.modifiers, this.rhs.getDefinition()?.getContainerType())
  }

}


// Used to get members
export class PointerDefinition extends Definition {
  constructor(public kind: string, public modifiers: TypeModifiers, public rhs?: Definition) { super () }

  repr() { return `${this.kind}${TypeModifiers.repr(this.modifiers)}${this.rhs?.repr() ?? '?n/a'}` }

  getMembers() {
    return [
      ...(this.kind !== '*' ? [] : this.rhs?.getMembers() ?? []),
      VariableDeclaration.fake('*', this.rhs, this)
    ]
  }
}

export class Reference extends Expression {
  rhs!: Expression
}
//FIXME missing ReferenceDefinition

// ????
export class ArrayOrSliceDeclaration extends Expression {
  number: Opt<Expression> // if _ then infer the nember of members, otherwise it is provided.
  rhs!: Expression
  modifiers!: TypeModifiers

  repr() {
    const mods = Object.keys(this.modifiers).join(' ')
    return `[${this.number?.repr() || ''}]${mods ? mods + ' ' : ''}${this.rhs.repr()}`
  }

  getDefinition() {
    return new ArrayOrSliceDefinition(this.number, this.modifiers, this.rhs.getDefinition()?.getContainerType())
  }

  getMembers(): Names {
    return [
      VariableDeclaration.fake('len', new PrimitiveType().set('name', new Identifier().set('value', 'u32')), this),// FIXME should be some kind of int
      VariableDeclaration.fake('ptr', new Pointer().set('rhs', this.rhs).set('kind', '[*]'), this)// FIXME should be some kind of int
    ]
  }
}

export class ArrayOrSliceDefinition extends Definition {
  constructor(public number: Expression | undefined | null, public modifiers: TypeModifiers, public def?: Definition) { super() }

  repr() { return `[${this.number ? '_' : ''}]${TypeModifiers.repr(this.modifiers)}${this.def?.repr() ?? '?n/a'}` }
}

/**
 *
 */
export class FileBlock extends StructDefinition {

  file!: File

  // TODO a file should let me find a Node by its position.

}


export class UnaryOpExpression extends Expression {
  op: Opt<Operator>
  lhs: Opt<Expression>
}

// .*
export class DerefOp extends UnaryOpExpression {

  // getType() {
  //   var typ = this.lhs?.getType()
  //   if (typ instanceof Pointer)
  //     return typ.rhs.getContainerType()
  // }

}
// .?
export class DeOpt extends UnaryOpExpression {

  // getType(): TypeExpression | undefined {
  //   var typ = this.lhs?.getType()
  //   if (typ instanceof Optional)
  //     return typ.rhs.getContainerType()
  // }

}
// !
export class NotOpt extends UnaryOpExpression { }

export class Operator extends Expression {
  value = ''

  // getType() {
  //   const p = this.parent
  //   if (p instanceof DotBinOp && p.lhs) {
  //     return p.lhs.getType()
  //   }
  //   return undefined
  // }
}

export class BinOpExpression extends Expression {
  operator!: Operator
  rhs: Opt<Expression>
  lhs: Opt<Expression>
  repr() { return `${this.rhs?.repr() || '#n/a'}${this.operator.value}${this.lhs?.repr() || '#n/a'}` }
}

export class PayloadedExpression extends Expression {
  is_pointer = false
  name!: Identifier
  index: Opt<Identifier>
  child_expression!: Expression

  // FIXME it should check what kind of parent it has to know
  // what expression it is related to.

  getAvailableNames() {
    var names = {} as Names
    return names
    // if (this.payload) {

    //   // More like this should be a variable declaration
    //   // whose value is @typeInfo(original_exp).ErrorUnion.error_set
    //   names[this.payload.name.value] = this.payload.name

    //   throw 'not implemented'
    //   // throw 'not implemented'
    //   // names[this.payload.exp]
    // }
    // return Object.assign({}, this.parent.getAvailableNames(), names)
  }

}

export class CatchOperator extends Operator {
  value = 'catch'
}

// exp . ident
export class DotBinOp extends BinOpExpression {

  rhs: Opt<Identifier>

  getDefinition() {
    return this.lhs?.getDefinition()?.getMembers().filter(m => m.name.value === this.rhs?.value)[0]?.getDefinition()
  }

  // getDefinition() {

  // }

  // getType() {
  //   // ???
  //   // this.log('here....')
  //   if (!this.lhs || !this.rhs) return undefined
  //   return this.lhs.getType()?.getMembers()[this.rhs.value]?.getType()
  // }
}

// exp [ .. ]
export class ArrayAccessOp extends BinOpExpression {
  slice: Opt<Expression>

  // getType(): TypeExpression | undefined {
  //   if (!this.lhs) return undefined
  //   const typ = this.lhs.getType()
  //   if (typ instanceof ArrayOrSliceDeclaration)
  //     return typ.rhs.getType()
  //   return undefined
  // }
}


export class ReturnExpression extends Expression {
  exp: Opt<Expression>

  onParsed() {
    const def = this.queryParent(FunctionDefinition)
    def?.returns.push(this)
  }
}

export class TestDeclaration extends ZigNode {
  name!: StringLiteral
  block!: Block
}


export class CurlySuffixExpr extends Expression {
  type!: Expression
}

// We should make ident and value optional here to allow for auto complete
export class TypeInstanciationField extends ZigNode {
  ident!: Identifier
  value!: Expression
}

export class TypeInstanciation extends CurlySuffixExpr {
  init_list: TypeInstanciationField[] = []
}


export class ArrayInitialization extends CurlySuffixExpr {
  init_list = [] as Expression[]
}

export class ErrorSet extends Expression {
  idents = [] as Identifier[]
}

export class SwitchExpressionProng extends Expression {
  exp!: Expression
}

export class SwitchExpression extends Expression {
  exp!: Expression
  prongs = [] as SwitchExpressionProng[]
}

export class IfThenElseExpression extends Expression {
  condition!: Expression
  then!: Expression
  else: Opt<Expression>
}


export class LoopExpression extends Expression {
  label: Opt<Identifier>
  loop!: Expression
  continue: Opt<Expression>
  body!: Expression
  else!: Expression
}

export class WhileExpression extends Expression { }

export class ForExpression extends Expression { }

export class DeferStatement extends Expression {
  exp!: Expression
}

export class ContainerType extends Definition {
  constructor(public cont: ContainerDefinition) {
    super()
  }

  repr() { return this.cont.repr() }

  getMembers(): Names {
    return this.cont.getContainerNames()
  }
}
