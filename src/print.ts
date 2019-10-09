import ch from 'chalk'
import { Node, Lexeme } from './libparse'
import * as a from './ast'

export function print_lexeme(l: Lexeme) {
  console.log(ch.bgBlueBright.bold.hex('#010133')(l.str) + ' ' + ch.greenBright.bold('' + l.line) + ':' + ch.greenBright('' + l.col))
}

export function print_node(n: Node, indent = '', prefix = '') {
  var suppl =
    [] as string[]
    // [n.range ? ch.grey('' + n.range[0].offset) : ''] as string[]
  if (n instanceof a.Identifier)
    suppl.push(ch.green(n.value))
  else if (n instanceof a.Literal)
    suppl.push(ch.yellow(n.value))
  else if (n instanceof a.Operator)
    suppl.push(ch.red(n.value))
  else if (n instanceof a.VariableDeclaration) {
    var co = ch.bold
    if (n.value instanceof a.ContainerDeclaration)
      co = co.bgRedBright
    else if (n.value instanceof a.FunctionDefinition)
      co = co.bgGreenBright.black
    else
      co = co.bgCyanBright.black
    suppl.push(co(n.name.value))
  }

  console.log(indent + prefix + n.constructor.name + (suppl.length ? '(' + suppl.join(', ') + ')' : ''))
  for (var c of n.children) {
    var p = ''
    for (var x in n) {
      var val = (n as any)[x]
      if (Array.isArray(val)) {
        for (var i = 0; i < val.length; i++) {
          if (val[i] === c) {
            p = ch.magenta(`${x}[${i}]: `)
            break
          }
        }
      }
      else if (val === c) {
        p = ch.magenta(x) + ': '
        break
      }
    }
    print_node(c, indent + '  ', p)
  }
}