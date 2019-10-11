import { Lexer } from "./libparse"
import { ROOT, T } from "./grammar"
import * as w from 'which'

import * as pth from 'path'
import * as fs from 'fs'
import * as cp from 'child_process'
import { FileBlock } from "./ast"


// go to definition
// completion provider
// documentSymbolProvider
// signature help
// handle refactoring, especially across files !


export class File {

  constructor(
    public host: ZigHost,
    public path: string,
    public lexer: Lexer,
    public scope: FileBlock,
    public contents: string,
    public lex_hrtime: [number, number] = [0, 0],
    public parse_hrtime: [number, number] = [0, 0]
  ) {

  }

}


export class ZigHost {

  files: {[name: string]: File} = {}
  zigroot: string = ''
  librairies: {[name: string]: string} = {}

  constructor(public zigpath: string, public log: (n: string) => any) {
    var path = zigpath && fs.existsSync(zigpath) && fs.statSync(zigpath).isFile() ? zigpath : w.sync('zig', {nothrow: true})
    if (path) {
      path = fs.realpathSync(path)
      this.zigroot = pth.dirname(path)
      this.zigpath = path
      this.librairies['std'] = pth.join(this.zigroot, './lib/zig/std/std.zig')
    }

    const contents = cp.execSync(`${this.zigpath} builtin`, {encoding: 'utf-8'})
    this.addFile('builtin', contents)
  }

  /**
   * Get several c files, generally imports
   */
  getCFile(fromfile: string): File | null {
    // FIXME
    const zig_cache_dir = pth.resolve(fromfile, `zig-cache${pth.sep}o`)
    var dirs = fs.readdirSync(zig_cache_dir)
    var fnames = [] as {ms: number, path: string}[]
    for (var d of dirs) {
      var p = pth.resolve(pth.resolve(zig_cache_dir, d), 'cimport.zig')
      try {
        var st = fs.statSync(p)
        if (st.isFile()) {
          fnames.push({ms: st.mtimeMs, path: p})
        }
      } catch (e) { continue }
    }

    fnames.sort((a, b) => a.ms < b.ms ? 1 : a.ms > b.ms ? -1 : 0)
    if (fnames[0]) {
      var cts = fs.readFileSync(fnames[0].path, 'utf-8')
      // return the c import.
      return this.addFile(fnames[0].path, cts)
    }
    return null
  }

  getZigFile(fromfile: string, path: string): File | null {
    try {
      if (path === 'builtin') {
        return this.files['builtin']
      }
      if (this.librairies[path]) {
        return this.addFile(this.librairies[path], fs.readFileSync(this.librairies[path], 'utf-8'))
      } else {

        path = pth.resolve(pth.dirname(fromfile), path)
        return this.addFile(path, fs.readFileSync(path, 'utf-8'))
      }
    } catch (e) {
      return null
    }
    // should get std and such
  }

  addFile(path: string, contents: string) {
    const prev_file = this.files[path]

    if (prev_file && prev_file.contents === contents)
      return prev_file

    // const cts = fs.readFileSync(name, 'utf-8')

    var start = process.hrtime()
    const lexer = new Lexer(Object.values(T))
    const input = lexer.feed(contents)
    const lex_hrtime = process.hrtime(start)

    start = process.hrtime()
    const scope = ROOT.parse(input)!
    const parse_hrtime = process.hrtime(start)
    const res = this.files[path] = new File(this, path, lexer, scope, contents, lex_hrtime, parse_hrtime)

    scope.file = res
    scope._onParsed()
    return res
  }

}
