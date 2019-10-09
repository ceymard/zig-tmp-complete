
import { SeqObj, Opt, Either, Token, S, ZeroOrMore, RawRule, SeparatedBy, Rule, Options, any, Lexeme, AnythingBut, OptSeparatedBy, Not } from './libparse'
import * as a from './ast'

export const T = {
  BUILTIN_IDENT: /@[A-Za-z_][A-Za-z_0-9]*/,
  BLOCK_COMMENT: /([ \t]*\/\/\/[^\n]*\n)+/m,
  STR: /c?"(\\\\|\\"|[^"])*"|\\\\[^\n]*\n(\s*\\\\[^\n]*\n)*/,
  CHAR: /'(\\\\|\\'|[^'])*'/,
  FLOAT: /\d+\.\d+(e[\+\-]\d+|p[\+\-]\d+)?|0x[\da-z]+\.[\da-z]+(e[\+\-][\da-z]+|p[\+\-][\da-z]+)?/i, // fixme
  INTEGER: /0b[0-1]+|0o[0-8]+|0x[\da-z]+|\d+/i, // fixme
  IDENT: /[A-Za-z_]\w*|@"[^"]+"/,
  OP: new RegExp([
    /&=|&/,
    /\*%=|\*%|\*=|\*\*|\*/,
    /\^=?/,
    /\.\.\.|\.\.|\.\?|\.\*|\./,
    /=>|==|=/,
    /!=|!/,
    /<<=|<=|<<|</,
    /-%=|-%|->|-=|-/,
    /%=|%/,
    /\|=|\|\||\|/,
    /\+%=|\+%|\+=|\+\+|\+/,
    /\[\*c\]|\[\*\]/,
    /\?/,
    />>=|>=|>>|>/,
    /\/=|\/(?!\/)/,
    /~/
  ].map(r => r.source).join('|')),
  // /&=?|\*[\*=%]?=?|==?=?|\./,
  CONTROL: /\(|\{|\[|\]|\}|\)|;|:|,/,
}


const kw_extern =         'extern'
const kw_packed =         'packed'
const kw_test =           'test'
const kw_const =          'const'
const kw_var =            'var'
const kw_comptime =       'comptime'
const kw_usingnamespace = 'usingnamespace'
const kw_async =          'async'
const kw_enum =           'enum'
const kw_struct =         'struct'
const kw_union =          'union'

const OptBool = (r: RawRule<any>) => Opt(r).map(r => !!r)

const opt_kw_comptime = OptBool(kw_comptime)
const opt_kw_export = OptBool('export')
const opt_kw_inline = OptBool('inline')
const opt_kw_threadlocal = OptBool('threadlocal')
const opt_kw_pub = OptBool('pub')
const opt_kw_fncc = Opt(Either('nakedcc', 'stdcallcc', 'extern', 'async'))


const kw_const_var = Either(kw_const, kw_var)

const tk_semicolon = ';'
const tk_colon = ':'
const tk_lbrace = '{'
const tk_rbrace = '}'

//////////////////////////////////////////////////////////


export const STRING = Token(T.STR).map(n => new a.StringLiteral().set('value', n.str))


export const DOC = Opt(Token(T.BLOCK_COMMENT).map(t => t.str))


///////////////////////////////////
export const IDENT = S`${Not(/align|and|allowzero|asm|async|await|break|catch|comptime|const|continue|defer|else|enum|errdefer|error|export|extern|false|fn|for|if|inline|nakedcc|noalias|null|or|orelse|packed|promise|pub|resume|return|linksection|stdcallcc|struct|suspend|switch|test|threadlocal|true|try|undefined|union|unreachable|usingnamespace|var|volatile|while/)} ${Opt(DOC)} ${Token(T.IDENT)}`.map(([_, d, n]) => new a.Identifier().set('value', n.str).set('doc', d))



///////////////////////////////
export const VAR = Token('var')
.map(r => new a.VarType())


////////////////////////////////
export const DOT3 = Token('...')
.map(r => new a.Dot3Type())


///////////////////////////////
export const STR = Token(T.STR)
.map(s => new a.StringLiteral().set('value', s.str))
  // FIXME this is incorrect, since a string can be multiline \\


////////////////////////////////////////
const OPT_EXTERN = Opt(S`extern ${STR}`)



const LINK_SECTION = Opt(S`linksection ( ${() => EXPRESSION} )`)


/////////////////////////////////
export const CHAR = Token(T.CHAR)
.map(s => s.str.slice(1, -1))


///////////////////////////////////
export const BLOCK_LABEL = SeqObj({
  name:     IDENT,
            tk_colon
})
.map(({name}) => name)


////////////////////////////////////////
export const BREAK_LABEL = S`: ${IDENT}`


////////////////////////////////////////
export const BREAK_EXPRESSION = SeqObj({
  kw_break:       'break',
  label:          Opt(BREAK_LABEL),
  exp:            Opt(() => EXPRESSION),
})


///////////////////////////////////////////
export const CONTINUE_EXPRESSION = SeqObj({
  kw_continue:    'continue',
  label:          Opt(BREAK_LABEL),
})


//////////////////////////////////////////////////////////////
export const RESUME_EXPRESSION = S`resume ${() => EXPRESSION}`


///////////////////////////////////////////////////////////////////
export const RETURN_EXPRESSION = S`return ${Opt(() => EXPRESSION)}`


///////////////////////////////
export const PAYLOAD = SeqObj({
  _s:         '|',
  opt_ptr:    OptBool('*'),
  ident:      IDENT,
  opt_index:  Opt(S`. ${IDENT}`),
  _e:         '|',
})
.map(p => new a.PayloadedExpression()
  .set('is_pointer', p.opt_ptr)
  .set('name', p.ident)
  .set('index', p.opt_index)
)

export const PAYLOADED_EXPRESSION = SeqObj({
  payload:        Opt(PAYLOAD),
  exp:            () => EXPRESSION
}).map(r => r.payload ? r.payload.set('child_expression', r.exp) : r.exp)



///////////////////////////////////////////
export const COMPTIME_EXPRESSION = SeqObj({
  kw_comptime:      'comptime',
  exp:              () => ASSIGN_EXPRESSION
})
.map(e => new a.Expression()) // FIXME !


//////////////////////////////////////////
export const IF_ELSE_EXPRESSION = SeqObj({
  if:           'if',
  exp:          S`( ${() => EXPRESSION} )`,
  opt_payload:  Opt(PAYLOAD),
  then:         () => EXPRESSION,
  opt_else:     Opt(SeqObj({
                  kw_else:      'else',
                  opt_payload:  Opt(PAYLOAD),
                  exp:          () => EXPRESSION,
                }).map(r => r.opt_payload ? r.opt_payload
                  .set('child_expression', r.exp)
                  : r.exp
                ))
})
.map(r => new a.IfThenElseExpression()
  .set('condition', r.exp)
  .set('then', r.opt_payload ? r.opt_payload.set('child_expression', r.then) : r.then)
  .set('else', r.opt_else)
) // FIXME !


///////////////////////////////////////
export const LOOP_EXPRESSION = SeqObj({
  label:          Opt(BLOCK_LABEL),
  inline:         Opt('inline'),
  kind:           Either(
                    Token('for').map(t => new a.ForExpression()),
                    Token('while').map(t => new a.WhileExpression()),
                  ),
  loop_exp:       S`( ${() => ASSIGN_EXPRESSION} )`,
  opt_payload:    Opt(PAYLOAD),
  continue_exp:   Opt(S`: ( ${() => ASSIGN_EXPRESSION} )`),
  body:           () => EXPRESSION,
  opt_else:       S`else ${PAYLOADED_EXPRESSION}`,
  opt_semi:       Opt(';')
})
.map(r => (r.kind as a.LoopExpression)
  .set('label', r.label)
  .set('continue', r.continue_exp)
  .set('body', r.opt_payload ? r.opt_payload.set('child_expression', r.body) : r.body)
  .set('else', r.opt_else)
)


//////////////////////////////////////////////////////////////////////////////////////////////////////////////////
export const INIT_LIST = SeqObj({
  _st:      '{',
  lst:      Opt(Either(
              SeparatedBy(',', S`. ${IDENT} = ${() => EXPRESSION}`
                .map(([id, exp]) => new a.TypeInstanciationField().set('ident', id).set('value', exp)))
                .map(r => new a.TypeInstanciation().set('init_list', r) as a.CurlySuffixExpr),
              SeparatedBy(',', () => EXPRESSION)
                .map(r => new a.ArrayInitialization().set('init_list', r)  as a.CurlySuffixExpr),
            )),
  _end:     Token('}'),
})
.map(r => r.lst)


////////
export const CURLY_SUFFIX_EXPRESSION = SeqObj({
  type:       () => TYPE_EXPRESSION,
  lst:        Opt(INIT_LIST)
}).map(e => e.lst ? e.lst.set('type', e.type) : e.type)


/////////////////////////////////////////
export const PRIMARY_EXPRESSION = Either(
  IF_ELSE_EXPRESSION,
  S`return ${() => EXPRESSION}`.map(e => new a.ReturnExpression().set('exp', e)),
  COMPTIME_EXPRESSION,
  LOOP_EXPRESSION,
  CURLY_SUFFIX_EXPRESSION,
)


/////////////////////////////////////////
export const PREFIX_EXPRESSION = SeqObj({
  op:           Opt(Token(/try|\!|-|~|-%|&|await/).map(t => new a.Operator().set('value', t.str))),
  exp:          PRIMARY_EXPRESSION
})
.map(e => e.op ? new a.UnaryOpExpression().set('rhs', e.exp).set('op', e.op) : e.exp)

const BinOp = (op: RawRule<any>, exp: Rule<a.Expression>) => SeqObj({
  exp,
  // we allow the rhs to be empty
  rest: ZeroOrMore(SeqObj({op, exp: Opt(exp)}))
}).map(({exp, rest}) => {
  var res = exp
  for (var r of rest) {
    res = new a.BinOpExpression()
      .set('operator', r.op)
      .set('lhs', res)
    if (r.exp)
      (res as a.BinOpExpression).set('rhs', r.exp)
  }
  return res
})

export const Operator = (n: string | RegExp) => Token(n).map(o => new a.Operator().set('value', o.str))

export const MULTIPLY_EXPRESSION = BinOp(Operator(/\*|\|\||\/|%|\*\*|\*%/), PREFIX_EXPRESSION)
export const ADDITION_EXPRESSION = BinOp(Operator(/\+|-|\+%|-%|\+\+/), MULTIPLY_EXPRESSION)
export const BITSHIFT_EXPRESSION = BinOp(Operator(/<<|>>/), ADDITION_EXPRESSION)
export const BITWISE_EXPRESSION = BinOp(
  // FIXME catch |payload| is not correctly handled !
  // should that create a block or something ???
  // scope should be resolved by calling super() with the nodes !
  // and overloading it.
  Either(
    Operator(/&|\^|\||orelse/),
    S`${Token('catch').map(c => new a.CatchOperator())} ${Opt(PAYLOADED_EXPRESSION)}`.map(([op, exp]) => new a.BinOpExpression().set('rhs', exp).set('operator', op))
  ), BITSHIFT_EXPRESSION
)
export const COMPARE_EXPRESSION = BinOp(Operator(/==|!=|<=|>=|<|>/), BITWISE_EXPRESSION)
export const BOOL_AND_EXPRESSION = BinOp(Operator('and'), COMPARE_EXPRESSION)
export const BOOL_OR_EXPRESSION = BinOp(Operator('or'), BOOL_AND_EXPRESSION)


////////////////////////////////////
export const EXPRESSION = SeqObj({
  maybe_try:      Opt('try'),
  expression:     BOOL_OR_EXPRESSION,
})
.map(r => r.maybe_try ? new a.TryExpression().set('exp', r.expression) : r.expression)



///////////////////////////////////////////////////////
export const ASSIGN_EXPRESSION = BinOp(Operator(/\*=|\/=|%=|\+=|-=|<<=|>>=|&=|\^=|\|=|\*%=|\+%=|-%=|=/), EXPRESSION)


export const PRIMARY_TYPE_EXPRESSION: Rule<a.Expression> = Either(
  // Primitive types !
  Either(
    Token(/[uif]\d+/).map(n => new a.Identifier().set('value', n.str)),
    Token(/c_(u?short|u?int|u?long(long)?|longdouble|void)/).map(n => new a.Identifier().set('value', n.str)),
    Token(/bool|void|noreturn|type|anyerror|comptime_(int|float)/).map(n => new a.Identifier().set('value', n.str)),
  ).map(r => new a.PrimitiveType().set('name', r)),
  Token('true').map(() => new a.True),
  Token('false').map(() => new a.False),
  Token('null').map(() => new a.Null),
  Token('undefined').map(() => new a.Undefined),
  Token('promise').map(() => new a.Promise),
  Token('unreachable').map(() => new a.Unreachable),
  Token(T.CHAR).map(n => new a.CharLiteral().set('value', n.str)),
  Token(T.INTEGER).map(n => new a.IntegerLiteral().set('value', n.str)),
  Token(T.FLOAT).map(n => new a.FloatLiteral().set('value', n.str)),
  Token(T.CHAR).map(n => new a.CharLiteral().set('value', n.str)),
  Token(T.STR).map(n => new a.StringLiteral().set('value', n.str)),
  // parenthesized expression
  S`( ${() => EXPRESSION} )`,
  S`error { ${Opt(SeparatedBy(',', IDENT))} }`.map(idents => new a.ErrorSet().set('idents', idents || [])),
  // function call
  SeqObj({
    ident:    Token(T.BUILTIN_IDENT),
    args:     () => FUNCTION_CALL_ARGUMENTS,
  }).map(r => new a.BuiltinFunctionCall().set('name', r.ident.str).set('args', r.args)),
  // container
  () => CONTAINER_DECL,
  // dot identifier, used in enums mostly.
  S`. ${IDENT}`.map(n => new a.LeadingDotAccess().set('name', n)),
  // error
  S`error . ${IDENT}`.map(n => new a.ErrorField().set('name', n)),
  LOOP_EXPRESSION,
  () => SWITCH_EXPRESSION,
  () => IF_ELSE_EXPRESSION,
  () => FUNCTION_PROTOTYPE,
  () => BLOCK,
  IDENT,
)


export const BYTE_ALIGN = S`align ( ${EXPRESSION} )`


function reduce_unary<T extends a.Expression & {rhs: a.Expression}>(lst: T[], last: a.Expression) {
  var res = last
  for (var i = lst.length - 1; i >= 0; i--) {
    res = lst[i].set('rhs', res)
  }
  return res
}


export const TYPE_MODIFIER = Options({
  align: BYTE_ALIGN,
  const: Token('const').map(() => true),
  volatile: Token('volatile').map(() => true),
  allowzero: Token('allowzero').map(() => true),
})

///
export const PREFIX_TYPE_OP = Either(
  // make the type optional
  Token('?').map(() => new a.Optional()),
  // a promise
  S`promise ->`.map(() => new a.PromiseType()),
  // declaration of an array type or a slice
  SeqObj({
    _1: '[',
    exp: Opt(EXPRESSION),
    _2: ']',
    modifiers: TYPE_MODIFIER
  }).map(s => new a.ArrayOrSliceDeclaration().set('number', s.exp).set('modifiers', s.modifiers)),
  // declaration of a pointer type
  SeqObj({
    ptrtype: Either('*', '**', '[*]', '[*c]'),
    modifiers: TYPE_MODIFIER
  }).map(s => new a.Pointer().set('kind', s.ptrtype.str).set('modifiers', s.modifiers))
)


export const SUFFIX_OPERATOR = Either(
  SeqObj({
    _1: '[',
    exp: EXPRESSION,
    slice: Opt(S`.. ${Opt(EXPRESSION)}`),
    _2: ']'
  }).map(e => new a.ArrayAccessOp().set('rhs', e.exp).set('slice', e.slice)), // FIXME this needs slice and it's probably not correct since I don't capture ..
  SeqObj({op: Operator('.'), id: Opt(IDENT)}).map(e => new a.DotBinOp().set('rhs', e.id).set('operator', e.op)),
  S`.*`.map(e => new a.DerefOp()),
  S`.?`.map(e => new a.DeOpt()),
)


/////////////////////////////////////////////
export const ASYNC_TYPE_EXPRESSION = SeqObj({
            kw_async,
  type:     PRIMARY_TYPE_EXPRESSION,
  suffix:   ZeroOrMore(SUFFIX_OPERATOR),
  args:     () => FUNCTION_CALL_ARGUMENTS,
})
.map(r => new a.Expression()) // FIXME !


////////////////////////////////////////
export const SUFFIX_EXPRESSION = Either(
  ASYNC_TYPE_EXPRESSION,
  SeqObj({
    exp: PRIMARY_TYPE_EXPRESSION,
    modifiers: ZeroOrMore(Either(
      () => FUNCTION_CALL_ARGUMENTS.map(f => new a.FunctionCall().set('args', f)),
      SUFFIX_OPERATOR
    ))
  }).map(e => {
    if (e.modifiers.length > 0) {
      var xp = e.exp as a.Expression
      for (var m of e.modifiers) {
        (m as a.UnaryOpExpression).set('lhs', xp)
        xp = m
      }
      return xp
    }
    return e.exp
  })
)


export const ERROR_UNION_EXPRESSION = SeqObj({
  suffix_exp: SUFFIX_EXPRESSION,
  opt_type:   Opt(S`! ${() => TYPE_EXPRESSION}`),
})
.map(e => e.suffix_exp)


/////////////////////////////////////////
export const TYPE_EXPRESSION: Rule<a.Expression> = SeqObj({
  prefix: ZeroOrMore(PREFIX_TYPE_OP),
  error_union_expr: ERROR_UNION_EXPRESSION
})
.map(r => r.prefix.length ? reduce_unary(r.prefix, r.error_union_expr) : r.error_union_expr)


////////////////////////////////////////
export const CONTAINER_FIELD = SeqObj({
  doc:        DOC,
              opt_kw_pub,
  ident:      IDENT,
  type:       Opt(S` : ${TYPE_EXPRESSION}`),
  value:      Opt(S` = ${EXPRESSION}`),
  opt_comma:  Opt(',')
})
.map(r => new a.ContainerField()
  .set('doc', r.doc)
  .set('name', r.ident)
  .set('type', r.type)
  .set('value', r.value)
)


////////////////////////////////////////////
export const VARIABLE_DECLARATION: Rule<a.VariableDeclaration> = SeqObj({
  doc:        DOC,
              opt_kw_export,
  pub:        OptBool('pub'),
  opt_extern: Opt(S`extern ${Opt(STR)}`),
              opt_kw_threadlocal,
              opt_kw_comptime,
              kw_const_var,
  ident:      IDENT,
  opt_type:   Opt(S` : ${Opt(EXPRESSION)}`),
  align:      Opt(BYTE_ALIGN),
  ln:         LINK_SECTION,
  value:      Opt(S`= ${EXPRESSION}`),
  opt_semi:   Opt(';')
})
.map(({ident, opt_type, value, pub, doc}) =>
  new a.VariableDeclaration()
  .set('doc', doc)
  .set('pub', pub)
  .set('name', ident)
  .set('type', opt_type)
  .set('value', value)
)


/////////////////////////////////////////
export const FUNCTION_ARGUMENT = SeqObj({
  doc:      DOC,
  opts:     Options({
              comptime: 'comptime',
              noalias: 'noalias'
            }),
  ident:    Opt(S`${IDENT} : `),
  type:     Either(TYPE_EXPRESSION, DOT3, VAR),
})
.map(r =>
  new a.FunctionArgumentDefinition()
    .set('name', r.ident!)
    .set('type', r.type)
)


/////////////////////////////////////////////////////////////////////////////
export const FUNCTION_CALL_ARGUMENTS = S`( ${OptSeparatedBy(',', EXPRESSION)} )`


//////////////////////////////////////////
export const FUNCTION_PROTOTYPE = SeqObj({
  doc:          DOC,
  export:       Opt('export'),
  pub:          Opt('pub'),
  extern:       OPT_EXTERN,
                opt_kw_fncc,
                opt_kw_threadlocal,
                opt_kw_inline,
  _1:           Token('fn'),
  ident:        Opt(IDENT),
  args:         S`( ${OptSeparatedBy(',', FUNCTION_ARGUMENT)} )`,
  bytealign:    Opt(BYTE_ALIGN),
  link:         Opt(LINK_SECTION),
  anyerror:     Opt('!'),
  return_type:  Either(VAR, TYPE_EXPRESSION),
})
.map(res => new a.FunctionPrototype()
  .set('args', res.args)
  .set('ident', res.ident)
  .set('return_type', res.return_type)
)



export const OLD_FUNCTION_DECLARATION = SeqObj({
  proto:      FUNCTION_PROTOTYPE,
  blk:        Either(() => BLOCK, Opt(';').map(r => null))
})
.map(r => new a.FunctionDefinition()
  .set('proto', r.proto)
  .set('block', r.blk)
)
.map(r => {
  if (r.proto.ident) {
    return new a.VariableDeclaration()
      .set('value', r)
      .set('name', r.proto.ident)
  }
  return r
})


/////////////////////////////
export const BLOCK = SeqObj({
  opt_label:  Opt(BLOCK_LABEL),
              tk_lbrace,
  statements: ZeroOrMore(Either(
    () => STATEMENT,
    AnythingBut('}') // if we choke on a statement, just filter
  )).map(s => s.filter(e => !(e instanceof Lexeme))),
  tk_rbrace,
})
.map(({statements}) =>
  new a.Block()
  .set('statements', statements as a.ZigNode[])
)


//////////////////////////////////////
export const COMPTIME_BLOCK = SeqObj({
  comptime: Opt(kw_comptime),
  block:    BLOCK,
})
.map(r => r.block.set('comptime', !!r.comptime))


///////////////////////////////////////
export const DEFER_STATEMENT = SeqObj({
  kw:         Either('defer', 'errdefer'),
  contents:   EXPRESSION,
}).map(r => new a.DeferStatement().set('exp', r.contents))


////////////////////////////////////
export const SWITCH_PRONG = SeqObj({
  case:       Either(
                'else',
                SeqObj({
                  lst: SeparatedBy(',', SeqObj({
                    item: SeqObj({
                      item: EXPRESSION,
                      opt:  Opt(S`... ${EXPRESSION}`),
                    })
                  })),
                })
              ),
  tk:         '=>',
  exp:        PAYLOADED_EXPRESSION
})
.map(n => new a.SwitchExpressionProng()
  .set('exp', n.exp)
)


/////////////////////////////////////////
export const SWITCH_EXPRESSION = SeqObj({
  _1:        'switch',
  exp:        S`( ${EXPRESSION} )`,
  stmts:      S`{ ${SeparatedBy(',', SWITCH_PRONG)} }`,
})
.map(r => new a.SwitchExpression()
  .set('exp', r.exp)
  .set('prongs', r.stmts)
)


////////////////////////////////
export const STATEMENT: Rule<a.ZigNode> = S`${Either(
  IF_ELSE_EXPRESSION,
  VARIABLE_DECLARATION,
  COMPTIME_BLOCK,
  DEFER_STATEMENT,
  LOOP_EXPRESSION,
  SWITCH_EXPRESSION,
  ASSIGN_EXPRESSION,
)} ${Opt(';')}`.map(([s, _]) => s as a.ZigNode)


////////////////////////////////////////
export const TEST_DECLARATION = SeqObj({
              kw_test,
  name:       STRING,
  block:      BLOCK
})
.map(r =>
  new a.TestDeclaration()
  .set('name', r.name)
  .set('block', r.block)
)


//////////////////////////////////////
export const USINGNAMESPACE = SeqObj({
  pub:    OptBool('pub'),
          kw_usingnamespace,
  exp:    EXPRESSION,
  semi:   Opt(tk_semicolon),
})
.map(n => new a.UsingNamespace().set('exp', n.exp).set('pub', n.pub)) // FIXME !


//////////////////////////////////////
export const CONTAINER_DECL = SeqObj({
  qualifiers:       Options({kw_extern, kw_packed}),
  kind: Either(
    SeqObj({
            kw_enum,
            opt_type: Opt(S`( ${EXPRESSION} )`)
    }).map(r => new a.EnumDeclaration().set('opt_type', r.opt_type)),
    SeqObj({
            kw_struct
    }).map(r => new a.StructDeclaration()),
    SeqObj({
            kw_union,
            opt_enum: Opt(S`( ${Either(
              S`enum ${Opt(EXPRESSION)}`,
              EXPRESSION
            )} )`) // missing union (enum) FIXME
    }).map(r => new a.UnionDeclaration().set('opt_enum', r.opt_enum))
  ),
  members: S`{ ${() => CONTAINER_MEMBERS} }`,
})
.map(r => (r.kind as a.ContainerDeclaration)
  .set('members', r.members)
  .set('packed', !!r.qualifiers.kw_packed)
  .set('extern', !!r.qualifiers.kw_extern)
)


//////////////////////////////////////
export const CONTAINER_MEMBERS: Rule<a.Declaration[]> = ZeroOrMore(Either(
  S`${Either(
    VARIABLE_DECLARATION,
    TEST_DECLARATION,
    COMPTIME_BLOCK,
    USINGNAMESPACE,
    OLD_FUNCTION_DECLARATION,
    CONTAINER_FIELD,
    TEST_DECLARATION,
  )} ${Opt(';')}`.map(r => r[0]),
  S`${Not('}')} ${any}`.map(e => e[1])
    .map(e => null)
  , // will advance if we can't recognize an expression, so that the parser doesn't choke on invalid declarations.
)).map(res => res.filter(r => !!r) as a.Declaration[])


export const ROOT = CONTAINER_MEMBERS
.map(statements => new a.FileBlock()
  .set('members', statements)
)
