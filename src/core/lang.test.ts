import { afterEach, describe, expect, it } from 'vitest'
import { getLang, setLang, t } from './lang'

describe('介面語言', () => {
  afterEach(() => setLang('zh'))

  it('預設中文', () => {
    expect(getLang()).toBe('zh')
    expect(t('電梯', 'Elevator')).toBe('電梯')
  })

  it('切成英文', () => {
    setLang('en')
    expect(t('電梯', 'Elevator')).toBe('Elevator')
    expect(t(1, 2)).toBe(2)
  })
})
