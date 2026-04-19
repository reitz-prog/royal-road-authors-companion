// Follower & Favorites Analytics - React port of v1's followers.js
// Uses Royal Road's native classes for dark/light mode compatibility
import { h } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import { log } from '../../common/logging/core.js';
import * as db from '../../common/db/proxy.js';
import { getSettings, setSetting } from '../../common/settings/core.js';
import { Select } from '../../common/ui/components/index.jsx';

const logger = log.scope('analytics');
const FOLLOWER_STORE = 'followerData';
const FAVORITES_STORE = 'favoritesData';

function getFictionIdFromUrl() {
  const match = window.location.pathname.match(/\/followers\/(\d+)/);
  return match ? match[1] : null;
}

async function fetchData(fictionId, type) {
  const endpoint = type === 'followers' ? 'followers' : 'favorites';
  const url = `https://www.royalroad.com/api/data/${endpoint}/${fictionId}`;

  try {
    const response = await fetch(url, {
      credentials: 'include',
      headers: { 'Accept': 'application/json' }
    });

    if (!response.ok) {
      logger.error(`${type} API error`, { status: response.status });
      return null;
    }

    const data = await response.json();
    logger.info(`Fetched ${type} data`, { count: data.length });
    return data;
  } catch (err) {
    logger.error(`${type} fetch error`, err);
    return null;
  }
}

function processApiData(apiData, valueKey) {
  if (!Array.isArray(apiData)) return [];

  const dailyData = new Map();

  apiData.forEach(point => {
    if (!point?.date || point[valueKey] === undefined) return;

    const utcDate = new Date(point.date);
    const dateStr = utcDate.toLocaleDateString('en-CA');
    const value = point[valueKey];

    if (!dailyData.has(dateStr) || value > dailyData.get(dateStr)) {
      dailyData.set(dateStr, value);
    }
  });

  return Array.from(dailyData.entries())
    .map(([date, value]) => ({ date, value }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function calculateDailyAccumulated(dataPoints) {
  if (!dataPoints?.length) return [];

  return dataPoints.map((current, i) => {
    const previous = i > 0 ? dataPoints[i - 1] : current;
    return {
      date: current.date,
      total: current.value,
      change: i > 0 ? current.value - previous.value : 0
    };
  });
}

function processHourlyData(apiData, valueKey) {
  if (!Array.isArray(apiData)) return [];

  // Get last 48 hours of data
  const now = new Date();
  const cutoff = new Date(now.getTime() - 48 * 60 * 60 * 1000);

  return apiData
    .filter(point => point?.date && point[valueKey] !== undefined)
    .map(point => ({
      date: point.date,
      value: point[valueKey]
    }))
    .filter(point => new Date(point.date) >= cutoff)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((current, i, arr) => {
      const previous = i > 0 ? arr[i - 1] : current;
      return {
        date: current.date,
        total: current.value,
        change: i > 0 ? current.value - previous.value : 0
      };
    });
}

function calculateWeeklyGains(data) {
  if (!data?.length) return [];

  const weeklyData = new Map();

  data.forEach((row, i) => {
    if (i === 0) return;
    // Parse YYYY-MM-DD as local date
    const [year, month, day] = row.date.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    const dayOfWeek = date.getDay();
    const diff = date.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
    const monday = new Date(date);
    monday.setDate(diff);
    // Format as YYYY-MM-DD
    const weekKey = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;

    if (!weeklyData.has(weekKey)) {
      weeklyData.set(weekKey, { weekStart: weekKey, total: 0 });
    }
    weeklyData.get(weekKey).total += row.change;
  });

  return Array.from(weeklyData.values())
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart));
}

function calculateDayOfWeekStats(data) {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dayStats = days.map(day => ({ day, total: 0, count: 0 }));

  data.forEach((row, i) => {
    if (row.change === 0 && i === 0) return;
    // Parse YYYY-MM-DD as local date
    const [year, month, day] = row.date.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    const dayIndex = date.getDay();
    dayStats[dayIndex].total += row.change;
    dayStats[dayIndex].count += 1;
  });

  return dayStats.map(stat => ({
    day: stat.day,
    avg: stat.count > 0 ? (stat.total / stat.count).toFixed(1) : 0,
    count: stat.count
  }));
}

function calculateHourOfDayStats(hourlyData, timezone = 'UTC') {
  const hourStats = Array.from({ length: 24 }, (_, i) => ({
    hour: i,
    label: `${i.toString().padStart(2, '0')}:00`,
    total: 0,
    count: 0
  }));

  hourlyData.forEach((row, i) => {
    if (i === 0) return; // skip first as it has no change
    const date = new Date(row.date);
    // Get hour in the selected timezone
    const hour = parseInt(date.toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: timezone }));
    hourStats[hour].total += row.change;
    hourStats[hour].count += 1;
  });

  return hourStats.map(stat => ({
    label: stat.label,
    avg: stat.count > 0 ? (stat.total / stat.count).toFixed(2) : 0,
    count: stat.count
  }));
}

function BarChart({ items, labelKey, valueKey, dayKey = null, centeredAtZero = false, slantedLabels = false }) {
  console.log('[DEBUG BarChart] ===== RENDER =====');
  console.log('[DEBUG BarChart] items.length:', items?.length);
  console.log('[DEBUG BarChart] labelKey:', labelKey, 'valueKey:', valueKey);
  console.log('[DEBUG BarChart] slantedLabels:', slantedLabels);

  if (items?.length > 0) {
    console.log('[DEBUG BarChart] First item:', JSON.stringify(items[0]));
    console.log('[DEBUG BarChart] Last item:', JSON.stringify(items[items.length - 1]));
    console.log('[DEBUG BarChart] All labels:', items.map(d => d[labelKey]).join(', '));
  }

  const values = items.map(d => parseFloat(d[valueKey]) || 0);
  const maxValue = Math.max(...values, 0);
  const minValue = Math.min(...values, 0);

  if (centeredAtZero) {
    // Centered at zero - bars go up (positive) or down (negative)
    const absMax = Math.max(Math.abs(maxValue), Math.abs(minValue), 0.1);
    const yAxisMax = Math.ceil(absMax * 10) / 10; // Round up to 1 decimal
    const yAxisMin = -yAxisMax;
    const yAxisSteps = 4; // 4 steps = 5 lines including 0

    const yLabels = [];
    for (let i = yAxisSteps; i >= 0; i--) {
      const value = yAxisMin + (i * (yAxisMax - yAxisMin) / yAxisSteps);
      yLabels.push(value.toFixed(1));
    }

    // Zero line is at 50% from bottom
    const zeroLinePercent = 50;

    return (
      <div class="rr-chart-container">
        <div class="rr-chart-y-axis">
          {yLabels.map((label, i) => (
            <div key={i} class="rr-y-label">{label}</div>
          ))}
        </div>
        <div class="rr-chart-area">
          <div class="rr-chart-bars-wrapper">
            <div class="rr-chart-grid">
              {Array.from({ length: yAxisSteps + 1 }).map((_, i) => (
                <div key={i} class={`rr-grid-line ${i === Math.floor(yAxisSteps / 2) ? 'rr-grid-line-zero' : ''}`}></div>
              ))}
            </div>
            <div class="rr-chart-bars rr-chart-bars-centered">
              {items.map((d, i) => {
                const value = parseFloat(d[valueKey]) || 0;
                const barHeight = Math.abs(value / yAxisMax) * 50; // Max 50% in either direction
                const isNegative = value < 0;

                const dayStr = dayKey && d[dayKey] ? ` (${d[dayKey]})` : '';
                return (
                  <div key={i} class="rr-bar-group rr-bar-group-centered">
                    <div
                      class={`rr-bar ${isNegative ? 'rr-bar-negative' : 'rr-bar-positive'}`}
                      style={{
                        height: `${Math.max(1, barHeight)}%`,
                        [isNegative ? 'top' : 'bottom']: '50%'
                      }}
                      title={`${d[labelKey]}${dayStr}: ${value >= 0 ? '+' : ''}${value}`}
                    />
                  </div>
                );
              })}
            </div>
          </div>
          <div class={`rr-x-labels ${slantedLabels ? 'rr-x-labels-slanted' : ''}`}>
            {items.map((d, i) => (
              <div key={i} class={`rr-bar-label ${slantedLabels ? 'rr-bar-label-slanted' : ''}`}>
                {d[labelKey]}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Standard bar chart (from bottom)
  const range = maxValue - minValue;
  const yAxisMax = Math.ceil(maxValue / 10) * 10 || 10;
  const yAxisSteps = 5;
  const yAxisInterval = yAxisMax / yAxisSteps;

  const yLabels = [];
  for (let i = yAxisSteps; i >= 0; i--) {
    const value = i * yAxisInterval;
    yLabels.push(Math.round(value).toLocaleString());
  }

  return (
    <div class="rr-chart-container">
      <div class="rr-chart-y-axis">
        {yLabels.map((label, i) => (
          <div key={i} class="rr-y-label">{label}</div>
        ))}
      </div>
      <div class="rr-chart-area">
        <div class="rr-chart-bars-wrapper">
          <div class="rr-chart-grid">
            {Array.from({ length: yAxisSteps + 1 }).map((_, i) => (
              <div key={i} class="rr-grid-line"></div>
            ))}
          </div>
          <div class="rr-chart-bars">
            {items.map((d, i) => {
              const value = parseFloat(d[valueKey]) || 0;
              const barHeight = yAxisMax > 0 ? (value / yAxisMax) * 100 : 0;

              const dayStr = dayKey && d[dayKey] ? ` (${d[dayKey]})` : '';
              return (
                <div key={i} class="rr-bar-group">
                  <div
                    class="rr-bar"
                    style={{ height: `${Math.max(0, barHeight)}%` }}
                    title={`${d[labelKey]}${dayStr}: ${value >= 0 ? '+' : ''}${value}`}
                  />
                </div>
              );
            })}
          </div>
        </div>
        <div class={`rr-x-labels ${slantedLabels ? 'rr-x-labels-slanted' : ''}`}>
          {items.map((d, i) => (
            <div key={i} class={`rr-bar-label ${slantedLabels ? 'rr-bar-label-slanted' : ''}`}>
              {d[labelKey]}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function DailyTab({ data, label, isHourly = false, timezone = 'UTC' }) {
  const totalGain = data.reduce((sum, d) => sum + Math.max(0, d.change), 0);
  const totalLoss = data.reduce((sum, d) => sum + Math.min(0, d.change), 0);
  const avgChange = data.length > 1
    ? ((data[data.length - 1].total - data[0].total) / (data.length - 1)).toFixed(1)
    : 0;

  // Helper to format date based on timezone preference
  const formatDate = (dateStr, options) => {
    // For YYYY-MM-DD strings, treat as UTC midnight then apply timezone
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      const date = new Date(dateStr + 'T00:00:00Z'); // Parse as UTC
      return date.toLocaleDateString('en-US', { ...options, timeZone: timezone });
    }
    // For ISO strings (hourly data), use timezone
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { ...options, timeZone: timezone });
  };

  const formatDateTime = (dateStr, options) => {
    const date = new Date(dateStr);
    return date.toLocaleString('en-US', { ...options, timeZone: timezone });
  };

  return (
    <div>
      <div class="table-responsive" style={{ maxHeight: '300px' }}>
        <table class="table table-striped table-sm">
          <thead>
            <tr>
              {isHourly ? (
                <>
                  <th>Date & Time</th>
                  <th>Total {label}</th>
                  <th>Change</th>
                </>
              ) : (
                <>
                  <th>Day</th>
                  <th>Date</th>
                  <th>Total {label}</th>
                  <th>Daily Change</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {[...data].reverse().map((row, i) => {
              const changeClass = row.change > 0 ? 'text-success' : (row.change < 0 ? 'text-danger' : '');
              const changePrefix = row.change > 0 ? '+' : '';

              if (isHourly) {
                const dateTimeStr = formatDateTime(row.date, {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                });
                return (
                  <tr key={i}>
                    <td>{dateTimeStr}</td>
                    <td>{row.total.toLocaleString()}</td>
                    <td class={changeClass}>{changePrefix}{row.change}</td>
                  </tr>
                );
              }

              const dayName = formatDate(row.date, { weekday: 'short' });
              return (
                <tr key={i}>
                  <td>{dayName}</td>
                  <td>{row.date}</td>
                  <td>{row.total.toLocaleString()}</td>
                  <td class={changeClass}>{changePrefix}{row.change}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div class="row text-center mt-3 p-3 bg-light rounded">
        <div class="col-4">
          <strong class="text-success d-block" style={{ fontSize: '1.25rem' }}>+{totalGain}</strong>
          <small class="text-muted">Total Gained</small>
        </div>
        <div class="col-4">
          <strong class="text-danger d-block" style={{ fontSize: '1.25rem' }}>{totalLoss}</strong>
          <small class="text-muted">Total Lost</small>
        </div>
        <div class="col-4">
          <strong class="d-block" style={{ fontSize: '1.25rem' }}>{avgChange}</strong>
          <small class="text-muted">Avg/{isHourly ? 'Hr' : 'Day'}</small>
        </div>
      </div>
    </div>
  );
}

function downloadCSV(data, filename, label) {
  const headers = ['Date', 'Day', `Total ${label}`, 'Daily Change'];
  const rows = data.map(row => {
    const date = new Date(row.date);
    const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
    return [row.date, dayName, row.total, row.change];
  });

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.join(','))
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function ReportsTab({ data, hourlyData, dataType, graphTab, dailyRange, timezone }) {
  console.log('[DEBUG ReportsTab] ===== RENDER =====');
  console.log('[DEBUG ReportsTab] data.length:', data?.length);
  console.log('[DEBUG ReportsTab] graphTab:', graphTab);
  console.log('[DEBUG ReportsTab] dailyRange:', dailyRange);

  if (data?.length > 0) {
    console.log('[DEBUG ReportsTab] First data item:', JSON.stringify(data[0]));
    console.log('[DEBUG ReportsTab] Last data item:', JSON.stringify(data[data.length - 1]));
  }

  // Filter data by daily range (3m, 6m, or all)
  const filteredData = (() => {
    if (dailyRange === 'all' || !dailyRange) {
      console.log('[DEBUG ReportsTab] Using ALL data, no filter');
      return data;
    }
    const months = dailyRange === '3m' ? 3 : 6;
    const now = new Date();
    const cutoff = new Date(now.getFullYear(), now.getMonth() - months, now.getDate());

    console.log('[DEBUG ReportsTab] Today:', now.toISOString());
    console.log('[DEBUG ReportsTab] Range:', dailyRange, '| Months back:', months);
    console.log('[DEBUG ReportsTab] Cutoff date:', cutoff.toISOString(), '| Expected start:', cutoff.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));

    const filtered = data.filter(d => {
      const [year, month, day] = d.date.split('-').map(Number);
      const dataDate = new Date(year, month - 1, day);
      return dataDate >= cutoff;
    });

    console.log('[DEBUG ReportsTab] Filtered from', data.length, 'to', filtered.length, 'items');
    if (filtered.length > 0) {
      console.log('[DEBUG ReportsTab] Actual range:', filtered[0].date, 'to', filtered[filtered.length - 1].date);
    }
    return filtered;
  })();

  // Parse YYYY-MM-DD strings explicitly to avoid UTC interpretation issues
  const dailyGains = filteredData
    .map((d, idx) => {
      // Parse "YYYY-MM-DD" as local date (not UTC)
      const [year, month, day] = d.date.split('-').map(Number);
      const dateObj = new Date(year, month - 1, day); // month is 0-indexed
      const label = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'long' });

      if (idx < 3 || idx >= filteredData.length - 3) {
        console.log(`[DEBUG ReportsTab] Item ${idx}: raw="${d.date}" -> parsed=[${year},${month},${day}] -> dateObj=${dateObj.toISOString()} -> label="${label}"`);
      }

      return { label, day: dayName, value: d.change };
    })
    .filter((_, i) => i > 0);

  console.log('[DEBUG ReportsTab] dailyGains.length:', dailyGains.length);
  if (dailyGains.length > 0) {
    console.log('[DEBUG ReportsTab] First dailyGain:', JSON.stringify(dailyGains[0]));
    console.log('[DEBUG ReportsTab] Last dailyGain:', JSON.stringify(dailyGains[dailyGains.length - 1]));
  }

  const weeklyGains = calculateWeeklyGains(data).map(w => {
    const [year, month, day] = w.weekStart.split('-').map(Number);
    const dateObj = new Date(year, month - 1, day);
    return {
      label: dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      day: 'Week of',
      value: w.total
    };
  });

  const dayStats = calculateDayOfWeekStats(data);
  const dayChartData = dayStats.map(s => ({
    label: s.day,
    value: parseFloat(s.avg) || 0
  }));

  const hourStats = calculateHourOfDayStats(hourlyData || [], timezone);
  const hourChartData = hourStats.map(s => ({
    label: s.label,
    value: parseFloat(s.avg) || 0
  }));

  return (
    <div>
      {graphTab === 'daily' && (
        <BarChart key={`daily-${dailyRange}`} items={dailyGains} labelKey="label" valueKey="value" dayKey="day" slantedLabels />
      )}

      {graphTab === 'weekly' && (
        <BarChart items={weeklyGains} labelKey="label" valueKey="value" dayKey="day" />
      )}

      {graphTab === 'day-of-week' && (
        <BarChart items={dayChartData} labelKey="label" valueKey="value" />
      )}

      {graphTab === 'hour-of-day' && (
        <BarChart items={hourChartData} labelKey="label" valueKey="value" centeredAtZero />
      )}
    </div>
  );
}

function TableSubTabs({ tableTab, setTableTab }) {
  return (
    <div class="rr-slider-tabs">
      <a
        class={`rr-slider-tab ${tableTab === 'daily' ? 'active' : ''}`}
        href="#"
        onClick={(e) => { e.preventDefault(); setTableTab('daily'); }}
      >
        Daily
      </a>
      <a
        class={`rr-slider-tab ${tableTab === 'last24h' ? 'active' : ''}`}
        href="#"
        onClick={(e) => { e.preventDefault(); setTableTab('last24h'); }}
      >
        Last 24 Hours
      </a>
      <a
        class={`rr-slider-tab ${tableTab === 'hourly' ? 'active' : ''}`}
        href="#"
        onClick={(e) => { e.preventDefault(); setTableTab('hourly'); }}
      >
        Hourly (48h)
      </a>
    </div>
  );
}

function DailyRangeFilter({ dailyRange, setDailyRange }) {
  return (
    <div class="rr-slider-tabs" style={{ marginLeft: '10px' }}>
      <a
        class={`rr-slider-tab ${dailyRange === '3m' ? 'active' : ''}`}
        href="#"
        onClick={(e) => { e.preventDefault(); setDailyRange('3m'); }}
      >
        3 Months
      </a>
      <a
        class={`rr-slider-tab ${dailyRange === '6m' ? 'active' : ''}`}
        href="#"
        onClick={(e) => { e.preventDefault(); setDailyRange('6m'); }}
      >
        6 Months
      </a>
      <a
        class={`rr-slider-tab ${dailyRange === 'all' ? 'active' : ''}`}
        href="#"
        onClick={(e) => { e.preventDefault(); setDailyRange('all'); }}
      >
        All
      </a>
    </div>
  );
}

function GraphSubTabs({ graphTab, setGraphTab, dailyRange, setDailyRange }) {
  return (
    <div class="d-flex align-items-center">
      <div class="rr-slider-tabs">
        <a
          class={`rr-slider-tab ${graphTab === 'daily' ? 'active' : ''}`}
          href="#"
          onClick={(e) => { e.preventDefault(); setGraphTab('daily'); }}
        >
          Daily
        </a>
        <a
          class={`rr-slider-tab ${graphTab === 'weekly' ? 'active' : ''}`}
          href="#"
          onClick={(e) => { e.preventDefault(); setGraphTab('weekly'); }}
        >
          Weekly
        </a>
        <a
          class={`rr-slider-tab ${graphTab === 'day-of-week' ? 'active' : ''}`}
          href="#"
          onClick={(e) => { e.preventDefault(); setGraphTab('day-of-week'); }}
        >
          By Day of Week
        </a>
        <a
          class={`rr-slider-tab ${graphTab === 'hour-of-day' ? 'active' : ''}`}
          href="#"
          onClick={(e) => { e.preventDefault(); setGraphTab('hour-of-day'); }}
        >
          By Hour of Day
        </a>
      </div>
      {graphTab === 'daily' && (
        <DailyRangeFilter dailyRange={dailyRange} setDailyRange={setDailyRange} />
      )}
    </div>
  );
}

function DataPanel({ data, hourlyData, status, dataType, activeView, setActiveView, tableTab, setTableTab, graphTab, setGraphTab, dailyRange, setDailyRange, timezone }) {
  const label = dataType === 'followers' ? 'Followers' : 'Favorites';

  return (
    <div>
      {status === 'loading' && (
        <p class="text-muted"><i class="fa fa-spinner fa-spin"></i> Fetching {label.toLowerCase()} data...</p>
      )}

      {status === 'error' && (
        <p class="text-danger">Failed to fetch {label.toLowerCase()} data.</p>
      )}

      {status === 'ready' && data.length === 0 && (
        <p class="text-muted">No {label.toLowerCase()} data found.</p>
      )}

      {status === 'ready' && data.length > 0 && (
        <>
          <div class="d-flex justify-content-between align-items-center mb-3">
            <div class="rr-slider-tabs">
              <a
                class={`rr-slider-tab ${activeView === 'table' ? 'active' : ''}`}
                href="#"
                onClick={(e) => { e.preventDefault(); setActiveView('table'); }}
              >
                Table
              </a>
              <a
                class={`rr-slider-tab ${activeView === 'graphs' ? 'active' : ''}`}
                href="#"
                onClick={(e) => { e.preventDefault(); setActiveView('graphs'); }}
              >
                Graphs
              </a>
            </div>

            <div class="d-flex align-items-center">
              {activeView === 'table' && (
                <>
                  <TableSubTabs tableTab={tableTab} setTableTab={setTableTab} />
                  <button
                    class="btn btn-sm btn-light ml-2"
                    title="Download CSV"
                    onClick={() => {
                      const fictionId = getFictionIdFromUrl();
                      let currentData = data;
                      if (tableTab === 'hourly') {
                        currentData = hourlyData;
                      } else if (tableTab === 'last24h') {
                        const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
                        currentData = hourlyData.filter(d => new Date(d.date) >= cutoff);
                      }
                      const filename = `${dataType}-${tableTab}-${fictionId}-${new Date().toISOString().split('T')[0]}.csv`;
                      downloadCSV(currentData, filename, label);
                    }}
                  >
                    <i class="fa fa-download"></i> Export
                  </button>
                </>
              )}

              {activeView === 'graphs' && (
                <GraphSubTabs graphTab={graphTab} setGraphTab={setGraphTab} dailyRange={dailyRange} setDailyRange={setDailyRange} />
              )}
            </div>
          </div>

          {activeView === 'table' && (
            <DailyTab
              data={
                tableTab === 'hourly' ? hourlyData :
                tableTab === 'last24h' ? hourlyData.filter(d => {
                  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
                  return new Date(d.date) >= cutoff;
                }) :
                data
              }
              label={label}
              isHourly={tableTab === 'hourly' || tableTab === 'last24h'}
              timezone={timezone}
            />
          )}
          {activeView === 'graphs' && <ReportsTab data={data} hourlyData={hourlyData} dataType={dataType} graphTab={graphTab} dailyRange={dailyRange} timezone={timezone} />}
        </>
      )}
    </div>
  );
}

export function Followers() {
  const [activeTab, setActiveTab] = useState('followers');
  const [activeView, setActiveView] = useState('table');
  const [tableTab, setTableTab] = useState('daily');
  const [graphTab, setGraphTab] = useState('daily');
  const [dailyRange, setDailyRange] = useState('3m');

  // Read timezone from global settings
  const settings = getSettings();
  const [timezone, setTimezoneState] = useState(settings.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone);

  // Wrapper to save timezone to settings when changed
  const setTimezone = (tz) => {
    setTimezoneState(tz);
    setSetting('timezone', tz);
  };

  const [followerData, setFollowerData] = useState([]);
  const [followerHourly, setFollowerHourly] = useState([]);
  const [followerStatus, setFollowerStatus] = useState('loading');

  const [favoritesData, setFavoritesData] = useState([]);
  const [favoritesHourly, setFavoritesHourly] = useState([]);
  const [favoritesStatus, setFavoritesStatus] = useState('loading');

  const loadData = async (type, storeName, valueKey, setData, setHourly, setStatus, currentData) => {
    const fictionId = getFictionIdFromUrl();
    if (!fictionId) {
      logger.error('Could not extract fiction ID from URL');
      setStatus('error');
      return;
    }

    logger.info(`Loading ${type} data`, { fictionId });

    // Try to load from cache first
    try {
      const cached = await db.getById(storeName, fictionId);
      if (cached?.data?.length > 0) {
        logger.info(`Loaded ${type} from cache`, { days: cached.data.length, lastUpdated: cached.lastUpdated });
        setData(cached.data);
        setStatus('ready');
      } else {
        setStatus('loading');
      }
    } catch (err) {
      logger.debug(`No ${type} cache found`, err);
      setStatus('loading');
    }

    // Fetch fresh data from API
    const apiData = await fetchData(fictionId, type);
    if (!apiData) {
      // If we have cached data, keep showing it
      if (currentData.length > 0) {
        logger.info(`${type} API failed but using cached data`);
        return;
      }
      setStatus('error');
      return;
    }

    const dataPoints = processApiData(apiData, valueKey);
    const dailyData = calculateDailyAccumulated(dataPoints);
    const hourlyData = processHourlyData(apiData, valueKey);
    setHourly(hourlyData);

    // Check if we have new data
    const latestDate = dailyData.length > 0 ? dailyData[dailyData.length - 1].date : null;
    const cachedLatestDate = currentData.length > 0 ? currentData[currentData.length - 1].date : null;

    if (latestDate !== cachedLatestDate || dailyData.length !== currentData.length) {
      logger.info(`New ${type} data found, updating cache`, { latestDate, cachedLatestDate });

      // Save to IndexedDB
      try {
        await db.upsert(storeName, {
          fictionId,
          data: dailyData,
          lastUpdated: new Date().toISOString(),
          latestDate
        });
        logger.info(`Saved ${type} to cache`);
      } catch (err) {
        logger.error(`Failed to save ${type} to cache`, err);
      }

      setData(dailyData);
    } else {
      logger.info(`No new ${type} data, keeping cached version`);
    }

    setStatus('ready');
  };

  useEffect(() => {
    // Load both followers and favorites data
    loadData('followers', FOLLOWER_STORE, 'followers', setFollowerData, setFollowerHourly, setFollowerStatus, followerData);
    loadData('favorites', FAVORITES_STORE, 'favorites', setFavoritesData, setFavoritesHourly, setFavoritesStatus, favoritesData);
  }, []);

  return (
    <div class="row">
      <div class="col-12">
        <div class="card card-custom">
          <div class="card-header d-flex align-items-center justify-content-between">
            <div class="d-flex align-items-center">
              <span class="card-label font-weight-bolder mr-3">Analytics</span>
              <ul class="nav nav-pills mb-0">
                <li class="nav-item">
                  <a
                    class={`nav-link py-1 px-3 ${activeTab === 'followers' ? 'active' : ''}`}
                    href="#"
                    onClick={(e) => { e.preventDefault(); setActiveTab('followers'); }}
                  >
                    Followers
                  </a>
                </li>
                <li class="nav-item">
                  <a
                    class={`nav-link py-1 px-3 ${activeTab === 'favorites' ? 'active' : ''}`}
                    href="#"
                    onClick={(e) => { e.preventDefault(); setActiveTab('favorites'); }}
                  >
                    Favorites
                  </a>
                </li>
              </ul>
            </div>
            <div class="d-flex align-items-center">
              <label class="mr-2 mb-0 text-muted">Timezone:</label>
              <Select
                size="sm"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
              >
                <optgroup label="Common">
                  <option value="UTC">UTC (GMT+0)</option>
                  <option value="America/New_York">Eastern US (GMT-5/-4)</option>
                  <option value="America/Chicago">Central US (GMT-6/-5)</option>
                  <option value="America/Denver">Mountain US (GMT-7/-6)</option>
                  <option value="America/Los_Angeles">Pacific US (GMT-8/-7)</option>
                  <option value="Europe/London">London (GMT+0/+1)</option>
                  <option value="Europe/Paris">Paris (GMT+1/+2)</option>
                  <option value="Europe/Berlin">Berlin (GMT+1/+2)</option>
                  <option value="Asia/Tokyo">Tokyo (GMT+9)</option>
                  <option value="Asia/Shanghai">Shanghai (GMT+8)</option>
                  <option value="Asia/Singapore">Singapore (GMT+8)</option>
                  <option value="Asia/Manila">Manila (GMT+8)</option>
                  <option value="Australia/Sydney">Sydney (GMT+10/+11)</option>
                </optgroup>
                <optgroup label="Your Timezone">
                  <option value={Intl.DateTimeFormat().resolvedOptions().timeZone}>
                    {Intl.DateTimeFormat().resolvedOptions().timeZone} (Local)
                  </option>
                </optgroup>
              </Select>
            </div>
          </div>

      <div class="card-body">
        {activeTab === 'followers' && (
          <DataPanel
            data={followerData}
            hourlyData={followerHourly}
            status={followerStatus}
            dataType="followers"
            activeView={activeView}
            setActiveView={setActiveView}
            tableTab={tableTab}
            setTableTab={setTableTab}
            graphTab={graphTab}
            setGraphTab={setGraphTab}
            dailyRange={dailyRange}
            setDailyRange={setDailyRange}
            timezone={timezone}
          />
        )}
        {activeTab === 'favorites' && (
          <DataPanel
            data={favoritesData}
            hourlyData={favoritesHourly}
            status={favoritesStatus}
            dataType="favorites"
            activeView={activeView}
            setActiveView={setActiveView}
            tableTab={tableTab}
            setTableTab={setTableTab}
            graphTab={graphTab}
            setGraphTab={setGraphTab}
            dailyRange={dailyRange}
            setDailyRange={setDailyRange}
            timezone={timezone}
          />
        )}
        </div>
      </div>
    </div>
    </div>
  );
}

export default Followers;
