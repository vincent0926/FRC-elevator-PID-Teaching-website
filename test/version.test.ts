import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/** 版本只以 package.json 為準；README 的「目前進度」要跟著改 */
describe('版本一致', () => {
  it('README 的目前進度版本跟 package.json 一樣', () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }
    const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8')
    const m = readme.match(/## 目前進度：v(\d+\.\d+(?:\.\d+)?)/)
    expect(m).not.toBeNull()
    const [maj, min] = pkg.version.split('.')
    const [rMaj, rMin] = m![1].split('.')
    expect([rMaj, rMin]).toEqual([maj, min])
  })
})
