/*
* <license header>
*/

/* Adobe Analytics 2.0 auth helper.
 * Turns the injected IMS S2S creds into an access token, discovers the
 * globalCompanyId for the org, and returns an initialized SDK client. */

const fetch = require('node-fetch')
const { generateAccessToken } = require('@adobe/aio-lib-core-auth')
const sdk = require('@adobe/aio-lib-analytics')

async function initAnalytics (params) {
  const tokenResponse = await generateAccessToken(params) // include-ims-credentials injects creds
  const accessToken = typeof tokenResponse === 'string' ? tokenResponse : tokenResponse.access_token
  const apiKey = params.apiKey // bound to $SERVICE_API_KEY

  const res = await fetch('https://analytics.adobe.io/discovery/me', {
    headers: { Authorization: `Bearer ${accessToken}`, 'x-api-key': apiKey }
  })
  if (!res.ok) {
    throw new Error(`discovery/me failed with status ${res.status}`)
  }
  const { imsOrgs } = await res.json()
  const globalCompanyId = imsOrgs[0].companies[0].globalCompanyId // pick by companyName if >1

  const client = await sdk.init(globalCompanyId, apiKey, accessToken)
  return { client, accessToken, apiKey, globalCompanyId }
}

module.exports = { initAnalytics }
