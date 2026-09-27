import { describe, expect, it } from 'vitest'
import { crc32, makeZip, readZip } from './zip'

describe('ZIP 寫入器', () => {
  it('CRC32 標準測試值', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926)
  })

  it('寫進去的檔案讀得回來（含中文檔名與內容）', () => {
    const z = makeZip([
      { path: 'README.md', content: '電梯 elevator' },
      { path: 'src/電梯/A.java', content: 'class A {}' },
    ])
    expect(readZip(z)).toEqual([
      { name: 'README.md', data: '電梯 elevator' },
      { name: 'src/電梯/A.java', data: 'class A {}' },
    ])
  })
})

