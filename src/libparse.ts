
export class Lexeme {

  constructor(
    public regexp: RegExp,
    public str: string,
    public offset: number,
    public end: number,
    public input_position: number,
    public line: number,
    public col: number,
  ) {

  }

  // inspect(depth: any, opts: any) {
  //   return 'L`' + this.str
  // }

  is(arg: string | RegExp) {
    return arg === this.str || arg === this.regexp
  }

  matches(r: RegExp) {
    return r.test(this.str)
  }
}


export class Lexer {

  lexed: Lexeme[] = []
  original_regexps: RegExp[] = []

  constructor(public regexps: RegExp[], public skip = /[\t \s\n]+|\/\/[^\/][^\n]*\n/m) {
    this.original_regexps = [...regexps, skip]
    this.regexps = this.original_regexps.map(r => new RegExp(r.source, r.flags + 'y'))
  }

  /**
   * Find the position of the lexeme our cursor is at.
   */
  getLexemeAt(position: number) {
    var start = 0
    var end = this.lexed.length - 1
    var pos!: number

    if (position > this.lexed[end].end)
      return this.lexed[end]

    while (end - start > 1) {
      pos = Math.floor((start + end) / 2)
      var current = this.lexed[pos]
      if (current.offset + 1 > position) {
        end = pos
      } else if (current.end < position) {
        start = pos
      } else {
        // found you !
        // console.log(this.lexed[pos])
        return this.lexed[pos]
      }
    }
    return this.lexed[pos]
  }

  feed(str: string): Lexeme[] {
    var idx = 0
    var position = 0
    var line = 1
    var col = 1
    var regexps = this.regexps
    var original_regexps = this.original_regexps
    var res: Lexeme[] = []
    var skip = this.skip

    const lines = (s: string): void => {
      var len = s.length
      for (var i = 0; i < len; i++) {
        col++
        if (s[i] === '\n') {
          line++
          col = 1
        }
      }
    }

    const next = () => {
      if (idx > str.length) return null

      var match: RegExpMatchArray | null = null
      var rl = regexps.length
      for (var i = 0; i < rl; i++) {
        var reg = regexps[i]
        reg.lastIndex = idx
        if ((match = reg.exec(str)) && match.index === idx) {
          return {regexp: original_regexps[i], match}
        }
      }
      return null
    }

    var match: ReturnType<typeof next>
    while (match = next()) {
      var m = match.match
      if (match.regexp !== skip) {
        res.push(new Lexeme(
          match.regexp,
          m[0],
          idx,
          idx + m[0].length,
          position++,
          line,
          col
        ))
      }
      idx += m[0].length
      lines(m[0])
    }

    if (idx < str.length) {
      console.error(res.slice(Math.max(res.length - 5, 0), res.length))
      throw new Error(`leftovers: ${str.slice(idx, idx + 64)}...`)
    }

    this.lexed = res

    return res
  }

}


export type ParseResult<T> = [number, T] | null

/**
 *
 */
export class Rule<T> {

  constructor(
    public _parse: (pos: number, input: Lexeme[]) => ParseResult<T>,
    public _maps?: ((a: T, start: Lexeme, end: Lexeme, input: Lexeme[]) => T)[]
  ) {

  }

  _tap = false

  get tap(): this {
    var c = this.clone()
    c._tap = true
    return c as any
  }

  clone() {
    return new Rule(this._parse, this._maps)
  }

  get debug() {
    return this.map((a, st, end, input) => {
      if (a instanceof Node)
        require('./print').print_node(a)
      else if (a instanceof Lexeme)
        require('./print').print_lexeme(a)
      else
        console.log(a)
      // console.log(st.input_position, input.slice(end.input_position + 1, end.input_position + 5).map(e => e.str))
      return a
    })
  }

  tryParse(pos: number, input: Lexeme[]): ParseResult<T> {
    if (this._tap) console.log(pos, input.slice(pos, pos + 5).map(e => e.str))
    var res = this._parse(pos, input)
    if (res != null) {
      // if (res[0] === pos) throw new Error('what')
      if (this._maps) {
        var start = pos
        var end = res[0] - 1
        for (var m of this._maps) {
          res[1] = m(res[1], input[start], input[end], input)
        }
      }

      // If the result is a node, then assign it its position.
      if (res[1] instanceof Node) {
        var st = input[pos]
        var en = input[res[0] - 1]
        res[1].range = [
          new Position(st.offset, st.line, st.col),
          new Position(en.offset + en.str.length, en.line, en.col)
        ]
      }
        // return [res[0], this._maps(res[1], pos, res[0], input)]
      return res
    }
    return null
  }

  parse(input: Lexeme[]): T | null {
    var res = this.tryParse(0, input)
    if (res) return res[1]
    return null
  }

  map<U>(fn: (a: T, start: Lexeme, end: Lexeme, input: Lexeme[]) => U): Rule<U> {
    return new Rule(this._parse, [...(this._maps||[]), fn] as any) as any as Rule<U>
  }

}

export type RawRule<T> = string | RegExp | Rule<T> | (() => Rule<T>)

export type InferedRule<T> = T extends Rule<infer U> ? Rule<U> : Rule<Lexeme>

export type GenericRule<Arr extends RawRule<any>[]> = {[K in keyof Arr]:
  Arr[K] extends Rule<infer U> ? Rule<U> : Rule<Lexeme>
}


export function mkRule<T>(r: RawRule<T>): InferedRule<typeof r> {
  return r instanceof RegExp || typeof r === 'string' ? Token(r) :
    typeof r === 'function' ? Forward(r) : r
}

export function mkRules<R extends RawRule<any>[]>(rules: R): GenericRule<R> {
  return rules.map(t => mkRule(t)) as any
}


export function Token(r: RegExp | string) {
  const re_test = r instanceof RegExp ? new RegExp(
    (r.source[0] !== '^' ? '^(?:' : '') + r.source + (r.source[r.source.length - 1] !== '$' ? ')$' : '')
     , r.flags) : null
  return new Rule((pos, input) => {
    var lexeme = input[pos]
    if (lexeme == null) return null
    if (lexeme.is(r) || re_test && re_test.exec(lexeme.str)) {
      return [pos + 1, lexeme]
    }
    return null
  })
}


export function Not(r: RawRule<any>) {
  var rule = mkRule(r)
  return new Rule((pos, input) => {
    if (rule.tryParse(pos, input))
      return null
    return [pos, input]
  })
}


export function SeqObj<T extends {[name: string]: RawRule<any>}>(_rules: T): Rule<{[K in keyof T]: Result<T[K]>}> {
  var rules = mkRules(Object.values(_rules))
  var keys = Object.keys(_rules)
  return new Rule<any>((pos, input) => {
    var p: ParseResult<any>
    var res = {} as any
    var start = 0
    var end = rules.length
    for (var i = start; i < end; i++) {
      if (!(p = rules[i].tryParse(pos, input))) {
        return null
      } else {
        pos = p[0]
        res[keys[i]] = p[1]
      }
    }

    return [pos, res]
  })
}


export function S<A extends RawRule<any>>(t: TemplateStringsArray, rules: A): Rule<Result<A>>
export function S<A extends RawRule<any>>(t: TemplateStringsArray): Rule<Lexeme[]>
export function S<A extends RawRule<any>[]>(t: TemplateStringsArray, ...rules: A): Rule<{[K in keyof A]: Result<A[K]>}>
export function S(tpl: TemplateStringsArray, ...rules: RawRule<any>[]): Rule<any> {

  const mapped_rules: Rule<any>[] = []
  const indexes = [] as number[]

  for (var i = 0; i < tpl.length; i++) {
    var item = tpl[i].trim()
    if (item) {
      item.split(/[\s\n]+/g).map(it => mapped_rules.push(mkRule(it)))
    }
    if (rules[i]) {
      indexes.push(mapped_rules.length)
      mapped_rules.push(mkRule(rules[i]))
    }
  }

  return new Rule((pos, input) => {
    var res = [] as any[]
    for (var r of mapped_rules) {
      var p = r.tryParse(pos, input)
      if (!p) return null
      pos = p[0]
      res.push(p[1])
    }

    if (indexes.length === 1)
      return [pos, res[indexes[0]]]
    return [pos, indexes.map(idx => res[idx])]
  })
}


export type Result<T> = T extends Rule<infer U> ? U : T extends () => Rule<infer V> ? V : Lexeme

export function Either<T extends RawRule<any>[]>(..._rules: T): Rule<{[K in keyof T]: Result<T[K]>}[number]> {
  var rules = mkRules(_rules)
  return new Rule((pos, input) => {
    var p: ParseResult<any>
    for (var r of rules) {
      if (p = r.tryParse(pos, input)) {
        return p
      }
    }
    // not found
    return null
  }) as any
}


/**
 *
 */
export function EitherObj<T extends {[name: string]: RawRule<any>}>(_rules: T): Rule<{[K in keyof T]?: Result<T[K]>} & {result: Result<T[string]>}> {
  var rules = mkRules(Object.values(_rules))
  var keys = Object.keys(_rules)
  var len = keys.length
  return new Rule((pos, input) => {
    var res = {} as any
    var p: ParseResult<any>
    for (var i = 0; i < len; i++) {
      var rule = rules[i]
      if (p = rule.tryParse(pos, input)) {
        res.result = p[1]
        res[keys[i]] = p[1]
        return [p[0], res]
      }
    }
    // not found
    return null
  }) as any
}


/**
 *
 */
export function Options<T extends {[name: string]: RawRule<any>}>(_rules: T): Rule<{[K in keyof T]?: Result<T[K]>}> {
  var rules = mkRules(Object.values(_rules))
  var keys = Object.keys(_rules)
  var len = keys.length
  return new Rule((pos, input) => {
    var res = {} as any
    var p: ParseResult<any>
    while (true) {
      var found = false
      for (var i = 0; i < len; i++) {
        var rule = rules[i]
        if (p = rule.tryParse(pos, input)) {
          res[keys[i]] = p[1]
          pos = p[0]
          found = true
          break
        }
      }
      if (!found) break
    }
    // return what we got.
    return [pos, res]
  }) as any
}



export function Peek(r: RawRule<any>) {
  var rule = mkRule(r)
  return new Rule((pos, input) => {
    if (rule.tryParse(pos, input))
      return [pos, input] // do not consume.
    return null
  })
}


export const any = new Rule((pos, input) => pos >= input.length ? null : [pos + 1, input[pos]])

export const AnythingBut = (_r: RawRule<any>) => {
  const r = mkRule(_r)
  return new Rule((pos, input) => {
    if (r.tryParse(pos, input))
      return null
    return pos >= input.length ? null : [pos + 1, input[pos]]
  })
}


export function ZeroOrMore<T>(_r: RawRule<T>): Rule<T[]> {
  const rule = mkRule(_r) as Rule<T>
  return new Rule((pos, input) => {
    var res: T[] = []
    var p: ParseResult<T>
    while (p = rule.tryParse(pos, input)) {
      res.push(p[1])
      pos = p[0]
    }
    return [pos, res]
  })
}


export function Opt<T extends RawRule<any>>(_r: T): Rule<Result<T> | null> {
  const rule = mkRule(_r) as any
  return new Rule((pos, input) => {
    const p = rule.tryParse(pos, input)
    if (p) return p
    else return [pos, null]
  })
}


export function P<T>(_r: RawRule<T>): Rule<T[]> {
  const subr = ZeroOrMore(_r)
  return new Rule((pos, input) => {
    const p = subr.tryParse(pos, input)
    if (p && p[0] > pos) return p // only accept a superior input.
    return null
  })
}


export function Balanced<T>(_start: RawRule<any>, _rule: RawRule<T>, _end: RawRule<any>): Rule<T[]> {
  const start = mkRule(_start)
  const end = mkRule(_end)
  const rule = mkRule(_rule)
  return new Rule((pos, input) => {
    var res = [] as T[]

    var st_res = start.tryParse(pos, input)
    if (!st_res) return null
    pos = st_res[0]
    var stack = 1

    var end_pos = input.length - 1
    while (pos < end_pos) {
      var en_res = end.tryParse(pos, input)
      if (en_res) {
        pos = en_res[0]
        stack--
        if (stack === 0)
          return [pos, res]
        continue
      }

      st_res = start.tryParse(pos, input)
      if (st_res) {
        stack++
        pos = st_res[0]
        continue
      }

      var rule_res = rule.tryParse(pos, input)
      if (rule_res) {
        pos = rule_res[0]
        res.push(rule_res[1] as T)
        continue
      }

      pos++
    }

    return null
  })
}


export function Between<T>(_start: RawRule<any>, _rule: RawRule<T>, _end: RawRule<any>): Rule<T[]> {
  const start = mkRule(_start)
  const end = mkRule(_end)
  const rule = mkRule(_rule)
  return new Rule((pos, input) => {
    var res = [] as T[]

    var st_res = start.tryParse(pos, input)
    if (!st_res) return null
    pos = st_res[0]

    var end_pos = input.length - 1
    while (pos < end_pos) {
      var en_res = end.tryParse(pos, input)
      if (en_res) {
        pos = en_res[0]
        return [pos, res]
      }

      var rule_res = rule.tryParse(pos, input)
      if (rule_res) {
        pos = rule_res[0]
        res.push(rule_res[1] as T)
        continue
      }

      pos
    }

    return null
  })
}


/**
 * I should remove this as it can't reliably parse backwards.
 */
export function ZF<T>(_r: RawRule<T>, until?: RawRule<any> | null): Rule<T[]> {
  const rule = mkRule(_r)
  const _until = until ? mkRule(until) : null
  return new Rule((pos, input) => {
    var res: T[] = []

    while (true) {
      // try the until rule
      if (_until && _until.tryParse(pos, input)) {
        // if matches => return
        return [pos, res]
      }

      // try the rule
      var p = rule.tryParse(pos, input)
      if (p) {
        pos = p[0]
        res.push(p[1] as T)
        continue
      }

      // we were not on the until rule, and the rule didn't match, so we're just going to
      // advance the position
      pos++
      if (pos > input.length)
        // if we're past the end, just return.
        return [pos, res]
    }
  })
}


export function first<A>(a: [A, ...any[]]) { return a[0] }
export function second<A>(a: [any, A, ...any[]]) { return a[1] }
export function third<A>(a: [any, any, A, ...any[]]) { return a[2] }

export const SeparatedBy = <T>(separator: RawRule<any>, rule: RawRule<T>) =>
  SeqObj({
    rule: rule as Rule<T>,
    more: ZeroOrMore(
      SeqObj({sep: separator, rule}).map(({rule}) => {
        return rule as T
      })
    ),
    opt_end: Opt(separator)
  }).map(({rule, more}) => [rule, ...more])

export const OptSeparatedBy = <T>(separator: RawRule<any>, rule: RawRule<T>) =>
  Opt(SeparatedBy(separator, rule)).map(r => r || [])


export function Forward<T>(fn: () => RawRule<T>): Rule<T> {
  return new Rule<any>((pos, input) => {
    var r = mkRule(fn())
    return r.tryParse(pos, input)
  })
}


export class Position {
  constructor(
    public offset: number,
    public line: number,
    public col: number
  ) { }
}


export class Node {

  parent: Node | null = null
  children: Node[] = []

  /**
   * Range expressed in offset
   * this is actually assigned by the lexer.
   */
  range!: [Position, Position]

  set<K extends keyof this>(key: K, v: this[K]): this {
    this[key] = v

    // test if we're setting properties that are nodes or array of nodes
    // so that they become children
    if (v instanceof Node) {
      this.children.push(v)
      v.parent = this
    } else if (Array.isArray(v)) {
      for (var _v of v) {
        if (!(_v instanceof Node)) continue
        this.children.push(_v)
        _v.parent = this
      }
    }

    return this
  }

  _onParsed() {
    // children speak first.
    for (var c of this.children)
      c._onParsed()

    // Keep the children sorted.
    this.children.sort((a, b) => {
      var a1 = a.range[0].offset
      var b1 = b.range[0].offset
      return a1 > b1 ? 1 : a1 < b1 ? -1 : 0
    })

    if (this.children.length && !this.range) {
      this.range = [
        this.children[0].range[0],
        this.children[this.children.length - 1].range[1]
      ]
    }

    this.onParsed()
  }

  onParsed(): void { }

  getRootNode() {
    if (!this.parent) return this
    var p = this.parent!
    while (p.parent)
      p = p.parent
    return p
  }

  getNodeAt(offset: number): Node {
    for (var c of this.children) {
      // console.log(c.constructor.name, c.range)
      if (c.range && (c.range[0].offset <= offset && offset <= c.range[1].offset)) {
        return c.getNodeAt(offset)
      }
    }
    return this
  }

  /**
   * Query the tree upwards to get a node of a certain type.
   * @param t The kind of node we're looking for
   */
  queryParent<T extends {new(...a: any[]): Node}>(t: T): InstanceType<T> | null {
    if (this.parent) {
      if (this.parent.constructor === t)
        return this.parent as any
      return this.parent.queryParent(t)
    }
    return null
  }
}
