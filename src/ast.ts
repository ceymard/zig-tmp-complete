
import { Node } from "./libparse"
import { File } from './host'

export type Opt<T> = T | null | undefined
export type Names = {[name: string]: Declaration}


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
    var typ = this.getType()
    if (!typ) return []
    return Object.values(typ.getMembers())
  }

  getNodeAt(n: number): ZigNode {
    return super.getNodeAt(n) as ZigNode
  }

  getAvailableNames(): Names {
    var own = this.getOwnNames()
    if (this.parent) {
      own = Object.assign(this.parent.getAvailableNames(), own)
    }
    return own
  }

  /**
   * get the definition of a node, which means its type definition, when
   * available.
   */
  getDeclaration(): Declaration | undefined {
    return
  }

  getOwnNames(): Names {
    return {}
  }

}


export class Expression extends ZigNode {

  getType(): TypeExpression | undefined {
    return
  }

  getContainerType(): TypeExpression | undefined {
    const typ = this.getType()
    if (typ instanceof ContainerDeclaration)
      return new ContainerType(typ)
    return typ
  }

  getOriginalDeclaration() {

  }

}


export class TypeExpression extends Expression {

  getType(): TypeExpression | undefined {
    return this
  }

  getMembers(): Names {
    return {}
  }

}


export class Declaration extends Expression {
  pub = false
  comptime = false
  extern = false
  doc: Opt<string>
  name!: Identifier
  type: Opt<Expression>
  value: Opt<Expression> // when used with extern, there may not be a value

  getType(): TypeExpression | undefined {
    if (this.type) {
      // console.log(this.name.value);
      return this.type.getContainerType() as TypeExpression
    }

    if (this.value) {
      return this.value.getType()
    }
    return
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
    var res = {} as Names
    for (var s of this.statements) {
      if (s instanceof Declaration)
        res[s.name.value] = s
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
}

export class Identifier extends Literal {

  doc: Opt<string>

  getType(): TypeExpression | undefined {
    if (this.parent instanceof DotBinOp && this.parent.rhs === this) {
      return this.parent.getType()
    }
    return this.getDeclaration()?.getType()
  }

  getDeclaration() {
    return this.getAvailableNames()[this.value] || null
  }

}

export class StringLiteral extends Literal { }
export class CharLiteral extends Literal { }
export class BooleanLiteral extends Literal { }
export class IntegerLiteral extends Literal { }
export class FloatLiteral extends Literal { }

export class PrimitiveType extends TypeExpression {
  name!: Identifier
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

  getType() {
    // maybe store args in a weakref to have a reference to the result somewhere
    const typ = this.lhs.getType()
    if (typ instanceof FunctionDefinition) {
      typ.current_args = this.args.args
      return typ.proto.getReturnType()
      // return typ.proto.return_type?.getType(true)
    }
    return undefined
  }
}


export class BuiltinFunctionCall extends Expression {
  name = ''
  args!: ExpressionList<Expression>

  getType(): TypeExpression | undefined {
    if (this.name === '@import' && this.args.args.length === 1) {
      return this.handleImport()
    }
    return;
  }

  handleImport(): TypeExpression | undefined {
    const fb = this.queryParent(FileBlock)
    if (!fb) return
    const a = this.args.args[0]
    if (!(a instanceof StringLiteral)) return
    const res = fb.file.host.getZigFile(fb.file.path, a.value.slice(1, -1))
    // filter publics ???
    return res?.scope.getType()
  }

}

////////////////////////////////////////////////////////

export class FunctionArgumentDefinition extends Declaration {
  comptime = false

  getType() {
    // check if the type is comptime
    if (this.comptime && this.type instanceof PrimitiveType && this.type.name.value === 'type') {
      const proto = this.parent
      if (!(proto instanceof FunctionPrototype)) return;
      const def = proto.parent
      if (!(def instanceof FunctionDefinition)) return;
      if (!def.current_args) return;
      const idx = def.proto.args.indexOf(this)
      return def.current_args[idx]?.getType()
    }

    return super.getType()
  }

}


export class FunctionPrototype extends Expression {
  extern = false
  ident: Opt<Identifier>
  args = [] as FunctionArgumentDefinition[]
  return_type: Opt<Expression>
  pub = false

  getReturnType(): TypeExpression | undefined {
    const p = this.parent
    if (p instanceof FunctionDefinition && p.returns.length > 0) {
      var r = p.returns[0].exp?.getType()
      return r
    }
  }

}


export class Definition extends Expression {

}


export class FunctionDefinition extends Definition {
  pub = false
  proto!: FunctionPrototype
  block: Opt<Block>
  returns: ReturnExpression[] = []

  current_args: Expression[] = []

  getType() {
    return this as any
  }

  getOwnNames(): Names {
    var res = {} as Names
    for (var a of this.proto.args) {
      if (!a.name) continue
      res[a.name.value] = a
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
export class ContainerDeclaration extends Definition {
  extern = false
  packed = false

  members: ZigNode[] = []

  getType(): TypeExpression | undefined {
    return this
  }

  getOwnNames() {
    var res = {} as Names
    for (var s of this.members)
      if (s instanceof Declaration && !(s instanceof ContainerField))
        res[s.name.value] = s
    return res
  }

  getMembers(): Names {
    return this.getOwnNames()
  }

  getContainerNames(): Names {
    // Members of a container are its very own declarations, not all the ones in scope.
    var res = {} as Names
    for (var s of this.members)
      if (s instanceof Declaration && s instanceof ContainerField)
        res[s.name.value] = s
    return res
  }

  getInstanceMembers(): Names {
    var res = {} as Names
    for (var m of this.members) {
      if (m instanceof ContainerField)
        res[m.name.value] = m
    }
    return res
  }

}


export class EnumDeclaration extends ContainerDeclaration {
  opt_type = null as Expression | null
}


export class StructDeclaration extends ContainerDeclaration {

}


export class UnionDeclaration extends ContainerDeclaration {
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


export class PromiseType extends Expression {
  rhs!: Expression
}

export class Optional extends Expression {
  rhs!: Expression

  getType() {
    return this as any
  }

  getMembers(): Names {
    return {
      '?': VariableDeclaration.fake('?', this.rhs?.getContainerType(), this)
    }
  }
}

export class Pointer extends Expression {
  rhs!: Expression
  kind!: string
  modifiers!: TypeModifiers

  getType() {
    return this
  }

  getMembers(): Names {
    return {
      ...(this.kind === '*' ? this.rhs?.getContainerType()?.getMembers() ?? {} : {}),
      '*': VariableDeclaration.fake('*', this.rhs?.getContainerType(), this)
    }
  }
}

export class Reference extends Expression {
  rhs!: Expression
}

// ????
export class ArrayOrSliceDeclaration extends Expression {
  number: Opt<Expression> // if _ then infer the nember of members, otherwise it is provided.
  rhs!: Expression
  modifiers!: TypeModifiers

  getType() {
    return this as any
  }

  getMembers(): Names {
    return {
      'len': VariableDeclaration.fake('len', undefined, this)// FIXME should be some kind of int
    }
  }

}

/**
 *
 */
export class FileBlock extends StructDeclaration {

  file!: File

  // TODO a file should let me find a Node by its position.

}


export class UnaryOpExpression extends Expression {
  op: Opt<Operator>
  lhs: Opt<Expression>
}

// .*
export class DerefOp extends UnaryOpExpression {

  getType() {
    var typ = this.lhs?.getType()
    if (typ instanceof Pointer)
      return typ.rhs.getContainerType()
  }

}
// .?
export class DeOpt extends UnaryOpExpression {

  getType(): TypeExpression | undefined {
    var typ = this.lhs?.getType()
    if (typ instanceof Optional)
      return typ.rhs.getContainerType()
  }

}
// !
export class NotOpt extends UnaryOpExpression { }

export class Operator extends Expression {
  value = ''

  getType() {
    const p = this.parent
    if (p instanceof DotBinOp && p.lhs) {
      return p.lhs.getType()
    }
    return undefined
  }
}

export class BinOpExpression extends Expression {
  operator!: Operator
  rhs: Opt<Expression>
  lhs: Opt<Expression>

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

  getType() {
    // ???
    // this.log('here....')
    if (!this.lhs || !this.rhs) return undefined
    return this.lhs.getType()?.getMembers()[this.rhs.value]?.getType()
  }
}

// exp [ .. ]
export class ArrayAccessOp extends BinOpExpression {
  slice: Opt<Expression>

  getType(): TypeExpression | undefined {
    if (!this.lhs) return undefined
    const typ = this.lhs.getType()
    if (typ instanceof ArrayOrSliceDeclaration)
      return typ.rhs.getType()
    return undefined
  }
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

export class ContainerType extends TypeExpression {
  constructor(public cont: ContainerDeclaration) {
    super()
  }

  getType() {
    return this
  }

  getMembers(): Names {
    return this.cont.getContainerNames()
  }
}
