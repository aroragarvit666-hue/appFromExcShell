/*
* <license header>
*/

jest.mock('@adobe/aio-sdk', () => ({
  Core: {
    Logger: jest.fn()
  }
}))

const { Core } = require('@adobe/aio-sdk')
const mockLoggerInstance = { info: jest.fn(), debug: jest.fn(), error: jest.fn() }
Core.Logger.mockReturnValue(mockLoggerInstance)

// mock the analytics auth/client helper so no real IMS/network calls happen
jest.mock('./../actions/lib/analytics')
const { initAnalytics } = require('./../actions/lib/analytics')

const action = require('./../actions/analytics/index.js')

const mockClient = {
  getCollections: jest.fn(),
  getReport: jest.fn()
}

beforeEach(() => {
  Core.Logger.mockClear()
  mockLoggerInstance.info.mockReset()
  mockLoggerInstance.debug.mockReset()
  mockLoggerInstance.error.mockReset()
  mockClient.getCollections.mockReset()
  mockClient.getReport.mockReset()
  initAnalytics.mockReset()
  initAnalytics.mockResolvedValue({ client: mockClient })
})

const fakeParams = { __ow_headers: { authorization: 'Bearer fake' }, apiKey: 'fake-key' }

describe('analytics', () => {
  test('main should be defined', () => {
    expect(action.main).toBeInstanceOf(Function)
  })

  test('missing Authorization header returns 400', async () => {
    const response = await action.main({})
    expect(response).toEqual({
      error: {
        statusCode: 400,
        body: { error: "missing header(s) 'authorization'" }
      }
    })
  })

  test('no rsid: lists report suites (200)', async () => {
    mockClient.getCollections.mockResolvedValue({
      body: { content: [{ rsid: 'rs1', name: 'Suite One' }, { rsid: 'rs2', name: 'Suite Two' }] }
    })
    const response = await action.main(fakeParams)
    expect(mockClient.getCollections).toHaveBeenCalledWith({ limit: 100 })
    expect(response).toEqual({
      statusCode: 200,
      body: { reportSuites: [{ rsid: 'rs1', name: 'Suite One' }, { rsid: 'rs2', name: 'Suite Two' }] }
    })
  })

  test('rsid without date range returns 400', async () => {
    const response = await action.main({ ...fakeParams, rsid: 'rs1' })
    expect(response.error.statusCode).toBe(400)
    expect(response.error.body.error).toContain('startDate')
  })

  test('rsid + date range: runs report (200)', async () => {
    mockClient.getReport.mockResolvedValue({
      body: {
        rows: [
          { itemId: '1', value: '2026-09-01', data: [100, 50, 40] },
          { itemId: '2', value: '2026-09-02', data: [120, 60, 45] }
        ],
        totalElements: 2
      }
    })
    const response = await action.main({
      ...fakeParams,
      rsid: 'rs1',
      startDate: '2026-09-01',
      endDate: '2026-09-08'
    })
    expect(mockClient.getReport).toHaveBeenCalled()
    expect(response.statusCode).toBe(200)
    expect(response.body.rsid).toBe('rs1')
    expect(response.body.rows).toHaveLength(2)
    expect(response.body.rows[0]).toEqual({ key: '1', dimension: '2026-09-01', metrics: [100, 50, 40] })
    expect(response.body.columns).toHaveLength(3)
  })

  test('SDK failure returns 500', async () => {
    const fakeError = new Error('boom')
    initAnalytics.mockRejectedValue(fakeError)
    const response = await action.main(fakeParams)
    expect(response).toEqual({
      error: { statusCode: 500, body: { error: 'server error' } }
    })
    expect(mockLoggerInstance.error).toHaveBeenCalledWith(fakeError)
  })

  test('aio-lib error with code maps to that status code', async () => {
    const sdkError = Object.assign(new Error('no access to rsid'), { code: 403, sdk: { args: {} } })
    mockClient.getCollections.mockRejectedValue(sdkError)
    const response = await action.main(fakeParams)
    expect(response.error.statusCode).toBe(403)
    expect(response.error.body.error).toContain('no access')
  })
})
