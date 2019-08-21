/**
 * An adapter that allows Typr.js to be used as if it were (a subset of) the OpenType.js API.
 * Also adds support for WOFF files (not WOFF2).
 */

import typrFactory from '../libs/typr.factory.js'
import woff2otfFactory from '../libs/woff2otf.factory.js'
import {defineWorkerModule} from 'troika-worker-utils'

function parserFactory(Typr, woff2otf) {
  const cmdArgLengths = {
    M: 2,
    L: 2,
    Q: 4,
    C: 6,
    Z: 0
  }

  function wrapFontObj([typrFont]) {
    const glyphMap = Object.create(null)

    const fontObj = {
      unitsPerEm: typrFont.head.unitsPerEm,
      ascender: typrFont.hhea.ascender,
      descender: typrFont.hhea.descender,
      forEachGlyph(text, fontSize, letterSpacing, callback) {
        let glyphX = 0
        const fontScale = 1 / fontObj.unitsPerEm * fontSize

        const glyphIndices = Typr.U.stringToGlyphs(typrFont, text)
        glyphIndices.forEach(glyphIndex => {
          if (glyphIndex === -1) return //Typr leaves -1s in the array after ligature substitution

          let glyphObj = glyphMap[glyphIndex]
          if (!glyphObj) {
            // !!! NOTE: Typr doesn't expose a public accessor for the glyph data, so this just
            // copies how it parses that data in Typr.U._drawGlyf -- this may be fragile.
            const typrGlyph = Typr.glyf._parseGlyf(typrFont, glyphIndex) || {xMin: 0, xMax: 0, yMin: 0, yMax: 0}
            const {cmds, crds} = Typr.U.glyphToPath(typrFont, glyphIndex)

            glyphObj = glyphMap[glyphIndex] = {
              index: glyphIndex,
              unicode: getUnicodeForGlyph(typrFont, glyphIndex),
              advanceWidth: typrFont.hmtx.aWidth[glyphIndex],
              xMin: typrGlyph.xMin,
              yMin: typrGlyph.yMin,
              xMax: typrGlyph.xMax,
              yMax: typrGlyph.yMax,
              pathCommandCount: cmds.length,
              forEachPathCommand(callback) {
                let argsIndex = 0
                const argsArray = []
                for (let i = 0, len = cmds.length; i < len; i++) {
                  const numArgs = cmdArgLengths[cmds[i]]
                  argsArray.length = 1 + numArgs
                  argsArray[0] = cmds[i]
                  for (let j = 1; j <= numArgs; j++) {
                    argsArray[j] = crds[argsIndex++]
                  }
                  callback.apply(null, argsArray)
                }
              }
            }
          }

          callback.call(null, glyphObj, glyphX)

          if (glyphObj.advanceWidth) {
            glyphX += glyphObj.advanceWidth * fontScale
          }
          if (letterSpacing) {
            glyphX += letterSpacing * fontSize
          }
        })
        return glyphX
      }
    }

    return fontObj
  }


  function getUnicodeForGlyph(typrFont, glyphIndex) {
    let glyphToUnicodeMap = typrFont.glyphToUnicodeMap
    if (!glyphToUnicodeMap) {
      glyphToUnicodeMap = typrFont.glyphToUnicodeMap = Object.create(null)

      // NOTE: this logic for traversing the cmap table formats follows that in Typr.U.codeToGlyph
      const cmap = typrFont.cmap;

      let tableIndex = -1
      if (cmap.p0e4 != null) tableIndex = cmap.p0e4
      else if (cmap.p3e1 != null) tableIndex = cmap.p3e1
      else if (cmap.p1e0 != null) tableIndex = cmap.p1e0
      else if (cmap.p0e3 != null) tableIndex = cmap.p0e3
      if (tableIndex === -1) {
        throw "no familiar platform and encoding!"
      }
      const table = cmap.tables[tableIndex];

      if (table.format === 0) {
        for (let code = 0; code < table.map.length; code++) {
          glyphToUnicodeMap[table.map[code]] = code
        }
      }
      else if (table.format === 4) {
        const startCodes = table.startCount
        const endCodes = table.endCount
        for (let i = 0; i < startCodes.length; i++) {
          for (let code = startCodes[i]; code <= endCodes[i]; code++) {
            glyphToUnicodeMap[Typr.U.codeToGlyph(typrFont, code)] = code
          }
        }
      }
      else if (table.format === 12)
      {
        table.groups.forEach(([startCharCode, endCharCode, startGlyphID]) => {
          let glyphId = startGlyphID
          for (let code = startCharCode; code <= endCharCode; code++) {
            glyphToUnicodeMap[glyphId++] = code
          }
        })
      }
      else {
        throw "unknown cmap table format " + table.format
      }
    }
    return glyphToUnicodeMap[glyphIndex] || 0
  }


  return function parse(buffer) {
    // Look to see if we have a WOFF file and convert it if so:
    const peek = new Uint8Array(buffer, 0, 4)
    const tag = Typr._bin.readASCII(peek, 0, 4)
    if (tag === 'wOFF') {
      buffer = woff2otf(buffer)
    } else if (tag === 'wOF2') {
      throw new Error('woff2 fonts not supported')
    }
    return wrapFontObj(Typr.parse(buffer))
  }
}


const workerModule = defineWorkerModule({
  dependencies: [typrFactory, woff2otfFactory, parserFactory],
  init(typrFactory, woff2otfFactory, parserFactory) {
    const Typr = typrFactory()
    const woff2otf = woff2otfFactory()
    return parserFactory(Typr, woff2otf)
  }
})


export default workerModule
