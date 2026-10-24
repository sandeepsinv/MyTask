import { describe, expect, it } from 'vitest'
import { api, errorMessage } from '../src/api/client'
import { AxiosError, AxiosHeaders } from 'axios'

describe('api client', () => {
  it('sends list filters as repeated keys, the way FastAPI reads them', () => {
    const uri = api.getUri({ url: '/tasks', params: { status: ['in_progress', 'blocked'], owner_id: 3 } })
    expect(uri).toContain('status=in_progress&status=blocked')
    expect(uri).not.toContain('status[]')
  })

  it('turns API errors into a sentence', () => {
    const config = { headers: new AxiosHeaders() }
    const withDetail = new AxiosError('x', '409', config, null, {
      status: 409, statusText: '', headers: {}, config, data: { detail: 'That username is already taken' },
    })
    expect(errorMessage(withDetail)).toBe('That username is already taken')
    const validation = new AxiosError('x', '422', config, null, {
      status: 422, statusText: '', headers: {}, config, data: { detail: [{ msg: 'Value error, Due date is wrong' }] },
    })
    expect(errorMessage(validation)).toBe('Due date is wrong')
    expect(errorMessage(new AxiosError('Network Error', 'ERR_NETWORK', config))).toMatch(/Cannot reach the server/)
  })
})
