
import { Node } from "./libparse"
import { File } from './host'

export type Opt<T> = T | null | undefined
export type Names = {[name: string]: Declaration}


export class Chain<T> {
  constructor(public v: T | null) {

  }

  map<T extends readonly any[], U>(this: Chain<T>, fn: (...t: {[K in keyof T]: NonNullable<T[K]>}) => U): Chain<U>
  map<U>(fn: (t: NonNullable<T>) => U): Chain<U>
  map<U>(m: (t: any) => U): Chain<U> {
    return new Chain(Array.isArray(this.v) && this.v.filter(v => v).length > 0 || this.v != null ? m(this.v as any) : null)
  }

  value(): T | null {
    return this.v
  }
}
const chain = <T>(c: T | null) => new Chain(c)

// FIXME missing Node.getDeclarations

export class ZigNode extends Node {

  parent!: ZigNode

  log(s: string) {
    const f = this.queryParent(FileBlock)
    if (!f) return
    f.file.host.log(this.constructor.name + ' ' + s)
  }

  getCompletionsAt(offset: number): Declaration[] {
    const node = this.getNodeAt(offset)
    // FIXME, there is probably more to be done with the node
    // we're checking...
    if (!(node instanceof Expression)) return []
    var typ = node.getType()
    if (!typ) return []
    return Object.values(typ.getMembers())
  }

  getNodeAt(n: number): ZigNode {
    return super.getNodeAt(n) as ZigNode
  }

  getCompletions(): Declaration[] {
    return []
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
  getDeclaration(): Declaration | null {
    return null
  }

  getDefinition(): Definition | null {
    return this as any
  }

  getOwnNames(): Names {
    return {}
  }

}


export class Expression extends ZigNode {

  getType(): TypeExpression | null {
    return null
  }

  getValue(): Expression | null {
    return null
  }

  getOriginalDeclaration() {

  }

}


export class TypeExpression extends Expression {

  getType(): TypeExpression | null {
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

  getType(): TypeExpression | null {
    if (this.type)
      return this.type as TypeExpression

    if (this.value)
      return this.value.getType()
    return null
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

  getType(): TypeExpression | null {
    if (this.parent instanceof DotBinOp && this.parent.rhs === this) {
      if (!this.parent.lhs) return null // should not happen !
      return this.parent.lhs.getType()
    }
    const decl = this.getDeclaration()
    if (!decl) return null
    return decl.getType()
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

export class FunctionCall extends TypeExpression {
  lhs!: Expression
  args = [] as Expression[]
}


export class BuiltinFunctionCall extends Expression {
  name = ''
  args = [] as Expression[]
}

////////////////////////////////////////////////////////

export class FunctionArgumentDefinition extends Declaration {
  comptime = false
}


export class FunctionPrototype extends Expression {
  extern = false
  ident: Opt<Identifier>
  args = [] as FunctionArgumentDefinition[]
  return_type: Opt<Expression>
}


export class Definition extends Expression {
  getDefinition() {
    return this
  }
}


export class FunctionDefinition extends Definition {
  pub = false
  proto!: FunctionPrototype
  block: Opt<Block>

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
  static fake(name: string, type: Expression, from_node: Expression) {
    var res = new VariableDeclaration()
      .set('name', new Identifier().set('value', name))
      .set('type', type)
    res.parent = from_node
    return res
  }
}


export class ContainerField extends Declaration {
  pub = true
}


export class ContainerDeclaration extends Definition {
  extern = false
  packed = false

  members: ZigNode[] = []

  getType(): TypeExpression | null {
    return new ContainerType(this)
  }

  getOwnNames() {
    var res = {} as Names
    for (var s of this.members)
      if (s instanceof Declaration && !(s instanceof ContainerField))
        res[s.name.value] = s
    return res
  }

  getMembers(as_instance: boolean) {
    // Members of a container are its very own declarations, not all the ones in scope.
    if (as_instance)
      return this.getInstanceMembers()
    return this.getOwnNames()
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
}

export class Pointer extends Expression {
  rhs!: Expression
  kind!: string
  modifiers!: TypeModifiers
}

export class Reference extends Expression {
  rhs!: Expression
}

// ????
export class ArrayOrSliceDeclaration extends Expression {
  number: Opt<Expression> // if _ then infer the nember of members, otherwise it is provided.
  rhs!: Expression
  modifiers!: TypeModifiers

}

/**
 *
 */
export class FileBlock extends StructDeclaration {

  path: string = ''
  file!: File

  // TODO a file should let me find a Node by its position.

}


export class UnaryOpExpression extends Expression {
  op: Opt<Operator>
  lhs: Opt<Expression>
}

// .*
export class DerefOp extends UnaryOpExpression {

  getType(){
    if (!this.lhs) return null
    var typ = this.lhs.getType()
    if (typ instanceof Pointer)
      return typ.rhs.getType()
    return null
    // const m = this.lhs.getMembers(as_instance)['*']
    // return m.getMembers(as_instance)
  }

}
// .?
export class DeOpt extends UnaryOpExpression {

  getType(): TypeExpression | null {
    return null
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
    return null
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

  getDefinition() {
    return chain(this.lhs)
      .map(lhs => [lhs.getType(), this.rhs] as const)
      .map((typ, rhs) => typ.getMembers()[rhs.value])
      .map(m => m.getDefinition())
      .value()
  }

  getType(): TypeExpression | null {
    // ???
    return chain(this.getDefinition())
      .map(d => d.getType())
      .value()
  }
}

// exp [ .. ]
export class ArrayAccessOp extends BinOpExpression {
  slice: Opt<Expression>

  getType(): TypeExpression | null {
    return null
  }
}


export class ReturnExpression extends Expression {
  exp: Opt<Expression>
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

  getMembers(): Names {
    // this type is a fake type used to get access to the variables of the container.
    return this.cont.getOwnNames()
  }
}
