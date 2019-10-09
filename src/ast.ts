
import { Node } from "./libparse"
import { File } from './host'

export type Opt<T> = T | null | undefined
export type Names = {[name: string]: Declaration}



// FIXME missing Node.getDeclarations

export class ZigNode extends Node {

  parent!: ZigNode

  getMembers(as_instance: boolean): Names {
    return {}
  }

  getCompletionsAt(offset: number): Declaration[] {
    return Object.values(this.getNodeAt(offset).getMembers(false))
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
    return null
  }

  getOwnNames(): Names {
    return {}
  }

}


export class Expression extends ZigNode {

  getValue(): Expression | null {
    return null
  }

  getOriginalDeclaration() {

  }

  getType(): Expression | null {
    return null
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

  getMembers(as_instance: boolean) {
    // FIXME check that the final type definition does come from the same file
    // in the contrary case, filter out the non-public declarations.
    // there, we get the type
    if (this.type && !(this.type instanceof Identifier && this.type.value === 'type')) {
      return this.type.getMembers(true)
    }

    if (this.value) {
      return this.value.getMembers(as_instance)
    }

    return {}
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

  getDeclaration() {
    return this.getAvailableNames()[this.value] || null
  }

  getMembers(as_instance: boolean): Names {
    const decl = this.getDeclaration()
    var res = decl ? decl.getMembers(as_instance) : {}
    return res
  }

}

export class StringLiteral extends Literal { }
export class CharLiteral extends Literal { }
export class BooleanLiteral extends Literal { }
export class IntegerLiteral extends Literal { }
export class FloatLiteral extends Literal { }

export class PrimitiveType extends Expression {
  name!: Identifier
}

export class TypeType extends PrimitiveType { }
export class VarType extends PrimitiveType { }
export class Dot3Type extends PrimitiveType { }

export class FunctionCall extends Expression {
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

  getMembers(as_instance: boolean): Names {
    return {'?': VariableDeclaration.fake('?', this.rhs, this)}
  }
}

export class Pointer extends Expression {
  rhs!: Expression
  kind!: string
  modifiers!: TypeModifiers

  getMembers(as_instance: boolean): Names {
    if (!this.rhs) return {}
    return {
      ...(this.kind === '*' ? this.rhs.getMembers(as_instance) : {}),
      '*': VariableDeclaration.fake('*', this.rhs, this)
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
  getMembers(as_instance: boolean) {
    if (!this.lhs) return {}
    const m = this.lhs.getMembers(as_instance)['*']
    return m.getMembers(as_instance)
  }
}
// .?
export class DeOpt extends UnaryOpExpression {
  getMembers(as_instance: boolean) {
    if (!this.lhs) return {}
    const m = this.lhs.getMembers(as_instance)['?']
    return m.getMembers(as_instance)
  }
}
// !
export class NotOpt extends UnaryOpExpression { }

export class Operator extends Expression {
  value = ''

  getMembers(as_instance: boolean) {
    if (this.value === '.' && this.parent instanceof DotBinOp && this.parent.lhs) {
      return this.parent.lhs.getMembers(as_instance)
    }
    return {}
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

  getMembers(as_instance: boolean) {
    if (!this.lhs) return {}
    return this.lhs.getMembers(as_instance)
  }

}

// exp [ .. ]
export class ArrayAccessOp extends BinOpExpression {
  slice: Opt<Expression>
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