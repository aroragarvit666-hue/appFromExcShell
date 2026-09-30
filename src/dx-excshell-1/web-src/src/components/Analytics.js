/*
* <license header>
*/

import React, { useState, useEffect } from 'react'
import PropTypes from 'prop-types'
import {
  View,
  Flex,
  Heading,
  Picker,
  Item,
  Button,
  Text,
  ProgressCircle,
  InlineAlert,
  Content,
  IllustratedMessage,
  TableView,
  TableHeader,
  TableBody,
  Column,
  Row,
  Cell
} from '@adobe/react-spectrum'

import allActions from '../config.json'
import actionWebInvoke from '../utils'

// action URL injected into config.json at deploy/preview time — key is the exact action name
const analyticsUrl = allActions.analytics

// date-range options -> number of days back from today
const DATE_RANGES = [
  { key: '7', name: 'Last 7 days' },
  { key: '30', name: 'Last 30 days' },
  { key: '90', name: 'Last 90 days' }
]

// YYYY-MM-DD in local time
function toISODate (date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

// returns { startDate, endDate } where endDate is exclusive (today, so the range ends yesterday EOD)
function rangeForDays (days) {
  const end = new Date()
  const start = new Date()
  start.setDate(end.getDate() - Number(days))
  return { startDate: toISODate(start), endDate: toISODate(end) }
}

const Analytics = (props) => {
  const [suites, setSuites] = useState([])
  const [suitesLoading, setSuitesLoading] = useState(true)
  const [suitesError, setSuitesError] = useState(null)

  const [selectedSuite, setSelectedSuite] = useState(null)
  const [selectedRange, setSelectedRange] = useState('7')

  const [report, setReport] = useState(null)
  const [reportLoading, setReportLoading] = useState(false)
  const [reportError, setReportError] = useState(null)

  // build the IMS-authenticated headers every action call needs
  function authHeaders () {
    const headers = {}
    if (props.ims.token) headers.authorization = `Bearer ${props.ims.token}`
    if (props.ims.org) headers['x-gw-ims-org-id'] = props.ims.org
    return headers
  }

  // On load: fetch available report suites and populate the picker
  useEffect(() => {
    let cancelled = false
    async function loadSuites () {
      if (!analyticsUrl) {
        setSuitesLoading(false)
        setSuitesError('Analytics action is not deployed yet. Run "aio app deploy" (or start the sandbox) to enable it.')
        return
      }
      setSuitesLoading(true)
      setSuitesError(null)
      try {
        const res = await actionWebInvoke(analyticsUrl, authHeaders(), {})
        if (cancelled) return
        if (res.error) throw new Error(res.error)
        setSuites(res.reportSuites || [])
      } catch (e) {
        if (!cancelled) setSuitesError(e.message)
      } finally {
        if (!cancelled) setSuitesLoading(false)
      }
    }
    loadSuites()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Load Report: run the report for the selected suite + date range
  async function loadReport () {
    if (!selectedSuite || !analyticsUrl) return
    setReportLoading(true)
    setReportError(null)
    setReport(null)
    try {
      const { startDate, endDate } = rangeForDays(selectedRange)
      const res = await actionWebInvoke(analyticsUrl, authHeaders(), {
        rsid: selectedSuite,
        startDate,
        endDate
      })
      if (res.error) throw new Error(res.error)
      setReport(res)
    } catch (e) {
      setReportError(e.message)
    } finally {
      setReportLoading(false)
    }
  }

  return (
    <View width="100%" maxWidth="size-9000">
      <Heading level={1}>Adobe Analytics Dashboard</Heading>

      {/* Report-suite picker (populated on load) */}
      {suitesLoading && (
        <Flex alignItems="center" gap="size-100" marginY="size-200">
          <ProgressCircle aria-label="Loading report suites" isIndeterminate size="S" />
          <Text>Loading report suites…</Text>
        </Flex>
      )}

      {suitesError && (
        <InlineAlert variant="negative" marginY="size-200">
          <Heading>Could not load report suites</Heading>
          <Content>{suitesError}</Content>
        </InlineAlert>
      )}

      {!suitesLoading && !suitesError && (
        <Flex direction="row" gap="size-200" alignItems="end" wrap marginY="size-200">
          <Picker
            label="Report suite"
            placeholder="Select a report suite"
            width="size-3600"
            items={suites.map((s) => ({ key: s.rsid, name: s.name || s.rsid }))}
            selectedKey={selectedSuite}
            onSelectionChange={(key) => { setSelectedSuite(key); setReport(null); setReportError(null) }}
          >
            {(item) => <Item key={item.key}>{item.name}</Item>}
          </Picker>

          <Picker
            label="Date range"
            width="size-2400"
            items={DATE_RANGES}
            selectedKey={selectedRange}
            onSelectionChange={setSelectedRange}
          >
            {(item) => <Item key={item.key}>{item.name}</Item>}
          </Picker>

          <Button
            variant="accent"
            onPress={loadReport}
            isDisabled={!selectedSuite}
            isPending={reportLoading}
          >
            Load Report
          </Button>
        </Flex>
      )}

      {/* Report results */}
      {reportError && (
        <InlineAlert variant="negative" marginY="size-200">
          <Heading>Report failed</Heading>
          <Content>{reportError}</Content>
        </InlineAlert>
      )}

      {reportLoading && (
        <Flex alignItems="center" justifyContent="center" height="size-3000">
          <ProgressCircle aria-label="Loading report" isIndeterminate size="L" />
        </Flex>
      )}

      {report && !reportLoading && (
        <TableView
          aria-label="Adobe Analytics report"
          marginTop="size-200"
          renderEmptyState={() => (
            <IllustratedMessage>
              <Heading>No data</Heading>
              <Content>No results for this report suite and date range.</Content>
            </IllustratedMessage>
          )}
        >
          <TableHeader>
            <Column key="dimension" allowsResizing>Date</Column>
            {report.columns.map((c) => (
              <Column key={c.id} align="end">{c.name}</Column>
            ))}
          </TableHeader>
          <TableBody items={report.rows}>
            {(item) => (
              <Row key={item.key}>
                <Cell>{item.dimension}</Cell>
                {item.metrics.map((value, i) => (
                  <Cell key={report.columns[i].id}>
                    {typeof value === 'number' ? value.toLocaleString() : value}
                  </Cell>
                ))}
              </Row>
            )}
          </TableBody>
        </TableView>
      )}
    </View>
  )
}

Analytics.propTypes = {
  runtime: PropTypes.any,
  ims: PropTypes.any
}

export default Analytics
