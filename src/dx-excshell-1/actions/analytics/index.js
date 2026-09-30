/*
* <license header>
*/

/**
 * Adobe Analytics reporting action.
 *
 * Two operations, selected by input params:
 *   - no `rsid`                          -> list available report suites (for the UI picker)
 *   - `rsid` + `startDate` + `endDate`   -> run a report over that date range
 *
 * The SDK THROWS aio-lib error objects (inspect err.code / err.message / err.sdk.args),
 * it does not return an HTTP response — hence the try/catch around every call.
 * Building a dummy change
 */

const { Core } = require('@adobe/aio-sdk')
const { errorResponse, stringParameters, checkMissingRequestInputs } = require('../utils')
const { initAnalytics } = require('../lib/analytics')

// metrics reported when running a report over a date range
const REPORT_METRICS = [
  { columnId: '0', id: 'metrics/pageviews', name: 'Page Views' },
  { columnId: '1', id: 'metrics/visits', name: 'Visits' },
  { columnId: '2', id: 'metrics/visitors', name: 'Unique Visitors' }
]

async function main (params) {
  const logger = Core.Logger('main', { level: params.LOG_LEVEL || 'info' })

  try {
    logger.info('Calling the analytics action')
    logger.debug(stringParameters(params))

    // Authorization header is required (require-adobe-auth enforces the user token too)
    const requiredHeaders = ['Authorization']
    const errorMessage = checkMissingRequestInputs(params, [], requiredHeaders)
    if (errorMessage) {
      return errorResponse(400, errorMessage, logger)
    }

    const { client } = await initAnalytics(params)

    // Operation 1: list report suites for the picker
    if (!params.rsid) {
      logger.info('Fetching report suites')
      const res = await client.getCollections({ limit: 100 })
      const suites = (res.body.content || []).map((s) => ({ rsid: s.rsid, name: s.name }))
      return {
        statusCode: 200,
        body: { reportSuites: suites }
      }
    }

    // Operation 2: run a report — needs a date range
    const reportErr = checkMissingRequestInputs(params, ['startDate', 'endDate'], [])
    if (reportErr) {
      return errorResponse(400, reportErr, logger)
    }

    logger.info(`Running report for rsid=${params.rsid} ${params.startDate} -> ${params.endDate}`)

    const reportBody = {
      rsid: params.rsid,
      globalFilters: [
        {
          type: 'dateRange',
          // full-day range: [startDate 00:00, endDate+1 00:00) — client sends endDate already exclusive
          dateRange: `${params.startDate}T00:00:00.000/${params.endDate}T00:00:00.000`
        }
      ],
      metricContainer: {
        metrics: REPORT_METRICS.map(({ columnId, id }) => ({ columnId, id }))
      },
      dimension: 'variables/daterangeday',
      settings: { limit: 90, page: 0, nonesBehavior: 'exclude-nones' }
    }

    const res = await client.getReport(reportBody)
    const report = res.body

    // flatten into a table-friendly shape the UI can render directly
    const rows = (report.rows || []).map((row) => ({
      key: row.itemId,
      dimension: row.value,
      metrics: row.data
    }))

    return {
      statusCode: 200,
      body: {
        rsid: params.rsid,
        columns: REPORT_METRICS.map(({ id, name }) => ({ id, name })),
        rows,
        totalElements: report.totalElements
      }
    }
  } catch (error) {
    logger.error(error)
    // aio-lib errors carry code/message; surface a useful message where we can
    const message = error.sdk ? `${error.message}` : 'server error'
    const statusCode = [400, 403, 404, 429].includes(error.code) ? error.code : 500
    return errorResponse(statusCode, message, logger)
  }
}

exports.main = main
