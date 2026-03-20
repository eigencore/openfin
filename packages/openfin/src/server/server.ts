import { Hono } from "hono"
import { cors } from "hono/cors"
import { streamSSE } from "hono/streaming"
import { HTTPException } from "hono/http-exception"
import { Bus } from "../bus"
import { NamedError } from "../util/error"
import { lazy } from "../util/lazy"
import { Log } from "../util/log"
import { SessionRoutes } from "./routes/session"
import { ProviderRoutes } from "./routes/provider"
import { ProfileRoutes } from "./routes/profile"
import type { ContentfulStatusCode } from "hono/utils/http-status"

const log = Log.create({ service: "server" })

function buildDashboardHTML(): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>OpenFin Dashboard</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #0f1117; color: #e2e8f0; font-family: 'SF Mono', 'Fira Code', monospace; font-size: 13px; padding: 24px; }
    h1 { font-size: 18px; font-weight: 600; color: #7ee8a2; margin-bottom: 4px; letter-spacing: 0.05em; }
    .subtitle { color: #64748b; font-size: 11px; margin-bottom: 24px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 16px; }
    .card { background: #1a1f2e; border: 1px solid #2d3748; border-radius: 10px; padding: 20px; }
    .card h2 { font-size: 11px; font-weight: 600; letter-spacing: 0.1em; color: #7ee8a2; margin-bottom: 14px; text-transform: uppercase; }
    .stat-row { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 8px; }
    .stat-label { color: #94a3b8; font-size: 12px; }
    .stat-value { font-size: 15px; font-weight: 600; }
    .positive { color: #7ee8a2; }
    .negative { color: #fc8181; }
    .neutral { color: #e2e8f0; }
    .chart-wrap { position: relative; height: 200px; }
    .chart-wrap-sm { position: relative; height: 160px; }
    .alert { padding: 8px 12px; border-radius: 6px; margin-bottom: 8px; font-size: 12px; }
    .alert-critical { background: rgba(252,129,129,0.1); border-left: 3px solid #fc8181; color: #fc8181; }
    .alert-warning  { background: rgba(246,173,85,0.1);  border-left: 3px solid #f6ad55; color: #f6ad55; }
    .loading { color: #64748b; text-align: center; padding: 40px; }
    .refresh { font-size: 11px; color: #64748b; text-align: right; margin-bottom: 16px; }
    a.refresh-btn { color: #7ee8a2; cursor: pointer; text-decoration: none; margin-left: 8px; }
  </style>
</head>
<body>
  <h1>OpenFin Dashboard</h1>
  <p class="subtitle" id="ts">Cargando...</p>
  <div id="root"><p class="loading">Cargando datos financieros...</p></div>

  <script>
    const fmt = (n, cur = 'MXN') => {
      const abs = Math.abs(n).toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
      return (n < 0 ? '-$' : '$') + abs + ' ' + cur
    }

    const COLORS = ['#7ee8a2','#63b3ed','#f6ad55','#fc8181','#b794f4','#76e4f7','#fbd38d','#9ae6b4']

    let charts = []
    function destroyCharts() { charts.forEach(c => c.destroy()); charts = [] }

    async function load() {
      destroyCharts()
      try {
        const d = await fetch('/profile/dashboard').then(r => r.json())
        document.getElementById('ts').textContent =
          'Actualizado: ' + new Date().toLocaleTimeString('es-MX') +
          ' · <a class="refresh-btn" onclick="load()">↻ Refrescar</a>'
        render(d)
      } catch(e) {
        document.getElementById('root').innerHTML = '<p class="loading">Error cargando datos: ' + e.message + '</p>'
      }
    }

    function render(d) {
      const nw = d.netWorth
      const delta = nw.delta != null ? (nw.delta >= 0 ? '+' : '') + fmt(nw.delta, nw.currency) : ''
      const deltaClass = nw.delta == null ? 'neutral' : nw.delta >= 0 ? 'positive' : 'negative'

      const alertsHTML = d.alerts.length === 0
        ? '<p style="color:#64748b;font-size:12px">Sin alertas activas</p>'
        : d.alerts.map(a =>
            '<div class="alert alert-' + a.severity + '">' + a.message + '</div>'
          ).join('')

      const budgetRows = d.budgets.map(b => {
        const pct = b.amount === 0 ? 0 : Math.round((b.spent / b.amount) * 100)
        const color = pct >= 100 ? '#fc8181' : pct >= 80 ? '#f6ad55' : '#7ee8a2'
        return '<div class="stat-row"><span class="stat-label">' + b.category + '</span>' +
          '<span style="color:' + color + ';font-size:12px">' + pct + '% · ' + fmt(b.spent, b.currency) + ' / ' + fmt(b.amount, b.currency) + '</span></div>'
      }).join('')

      const goalsRows = d.goals.map(g => {
        const pct = g.target_amount === 0 ? 100 : Math.round((g.current_amount / g.target_amount) * 100)
        return '<div class="stat-row"><span class="stat-label">' + g.name + '</span>' +
          '<span class="neutral" style="font-size:12px">' + pct + '% · ' + fmt(g.current_amount, g.currency) + '</span></div>'
      }).join('')

      const debtRows = d.debts.map(dbt =>
        '<div class="stat-row"><span class="stat-label">' + dbt.name + '</span><span class="negative">' + fmt(dbt.balance, dbt.currency) + '</span></div>'
      ).join('')

      document.getElementById('root').innerHTML = \`
        <div class="grid">

          <div class="card">
            <h2>Patrimonio Neto</h2>
            <div class="stat-row">
              <span class="stat-label">Total</span>
              <span class="stat-value \${nw.net_worth >= 0 ? 'positive' : 'negative'}">\${fmt(nw.net_worth, nw.currency)}</span>
            </div>
            <div class="stat-row">
              <span class="stat-label">Activos</span>
              <span class="stat-value neutral">\${fmt(nw.assets, nw.currency)}</span>
            </div>
            <div class="stat-row">
              <span class="stat-label">Deudas</span>
              <span class="stat-value negative">\${fmt(nw.debts, nw.currency)}</span>
            </div>
            \${delta ? '<div class="stat-row"><span class="stat-label">Cambio vs anterior</span><span class="stat-value ' + deltaClass + '">' + delta + '</span></div>' : ''}
            \${d.netWorthHistory.length > 2 ? '<div class="chart-wrap-sm" style="margin-top:16px"><canvas id="nwChart"></canvas></div>' : ''}
          </div>

          <div class="card">
            <h2>Gastos del Mes</h2>
            \${d.topExpenses.length > 0
              ? '<div class="chart-wrap"><canvas id="expChart"></canvas></div>'
              : '<p style="color:#64748b;font-size:12px">Sin gastos registrados este mes</p>'}
          </div>

          <div class="card">
            <h2>Presupuestos</h2>
            \${d.budgets.length > 0
              ? '<div class="chart-wrap-sm" style="margin-bottom:12px"><canvas id="budgetChart"></canvas></div>' + budgetRows
              : '<p style="color:#64748b;font-size:12px">Sin presupuestos configurados</p>'}
          </div>

          <div class="card">
            <h2>Metas de Ahorro</h2>
            \${d.goals.length > 0 ? goalsRows : '<p style="color:#64748b;font-size:12px">Sin metas configuradas</p>'}
          </div>

          <div class="card">
            <h2>Deudas</h2>
            \${d.debts.length > 0 ? debtRows : '<p style="color:#64748b;font-size:12px">Sin deudas registradas</p>'}
          </div>

          <div class="card">
            <h2>Alertas</h2>
            \${alertsHTML}
          </div>

        </div>
      \`

      const chartDefaults = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: '#64748b', font: { size: 10 } }, grid: { color: '#1e2535' } },
          y: { ticks: { color: '#64748b', font: { size: 10 } }, grid: { color: '#1e2535' } },
        },
      }

      // Net worth trend
      if (d.netWorthHistory.length > 2) {
        const labels = d.netWorthHistory.map(h => new Date(h.date).toLocaleDateString('es-MX', { month: 'short', day: 'numeric' }))
        const values = d.netWorthHistory.map(h => h.value)
        charts.push(new Chart(document.getElementById('nwChart'), {
          type: 'line',
          data: {
            labels,
            datasets: [{ data: values, borderColor: '#7ee8a2', backgroundColor: 'rgba(126,232,162,0.08)', fill: true, tension: 0.3, pointRadius: 2 }]
          },
          options: { ...chartDefaults, plugins: { ...chartDefaults.plugins } },
        }))
      }

      // Top expenses doughnut
      if (d.topExpenses.length > 0) {
        charts.push(new Chart(document.getElementById('expChart'), {
          type: 'doughnut',
          data: {
            labels: d.topExpenses.map(e => e.category),
            datasets: [{ data: d.topExpenses.map(e => e.amount), backgroundColor: COLORS, borderWidth: 0 }]
          },
          options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
              legend: { display: true, position: 'right', labels: { color: '#94a3b8', font: { size: 10 }, boxWidth: 10, padding: 8 } }
            }
          },
        }))
      }

      // Budget bar chart
      if (d.budgets.length > 0) {
        charts.push(new Chart(document.getElementById('budgetChart'), {
          type: 'bar',
          data: {
            labels: d.budgets.map(b => b.category),
            datasets: [
              { label: 'Gastado', data: d.budgets.map(b => b.spent), backgroundColor: '#63b3ed', borderRadius: 4 },
              { label: 'Límite',  data: d.budgets.map(b => b.amount), backgroundColor: '#2d3748', borderRadius: 4 },
            ]
          },
          options: { ...chartDefaults, plugins: { legend: { display: true, labels: { color: '#94a3b8', font: { size: 10 } } } } },
        }))
      }
    }

    load()
    // Auto-refresh every 60s
    setInterval(load, 60_000)
  </script>
</body>
</html>`
}

export namespace Server {
  export const PORT = 4096

  export const Default = lazy(() => createApp())

  export function createApp(): Hono {
    const app = new Hono()

    return app
      // ── Error handler ────────────────────────────────────────────────────
      .onError((err, c) => {
        if (err instanceof NamedError) {
          let status: ContentfulStatusCode = 500
          if (err.name === "NotFoundError") status = 404
          return c.json(err.toObject(), { status })
        }
        if (err instanceof HTTPException) {
          return c.json({ error: err.message }, { status: err.status as ContentfulStatusCode })
        }
        log.error("unhandled error", { error: err instanceof Error ? err : String(err) })
        const message = err instanceof Error && err.stack ? err.stack : String(err)
        return c.json(new NamedError.Unknown({ message }).toObject(), { status: 500 })
      })

      // ── Request logging ───────────────────────────────────────────────────
      .use(async (c, next) => {
        const start = Date.now()
        log.info("request", { method: c.req.method, path: c.req.path })
        await next()
        log.info("response", { method: c.req.method, path: c.req.path, status: c.res.status, ms: Date.now() - start })
      })

      // ── CORS ──────────────────────────────────────────────────────────────
      .use(
        cors({
          origin(input) {
            if (!input) return
            if (input.startsWith("http://localhost:")) return input
            if (input.startsWith("http://127.0.0.1:")) return input
            return
          },
        }),
      )

      // ── Routes ────────────────────────────────────────────────────────────
      .route("/session", SessionRoutes())
      .route("/provider", ProviderRoutes())
      .route("/profile", ProfileRoutes())

      // ── Web dashboard ─────────────────────────────────────────────────────
      .get("/dashboard", (c) => {
        const html = buildDashboardHTML()
        return c.html(html)
      })

      // ── SSE /event — Bus events in real time ──────────────────────────────
      .get("/event", async (c) => {
        log.info("event connected")
        c.header("X-Accel-Buffering", "no")
        c.header("X-Content-Type-Options", "nosniff")

        return streamSSE(c, async (stream) => {
          // Send initial connected event
          await stream.writeSSE({
            data: JSON.stringify({ type: "server.connected", properties: {} }),
          })

          const unsub = Bus.subscribeAll(async (event) => {
            await stream.writeSSE({ data: JSON.stringify(event) })
          })

          // Heartbeat every 10s to prevent stalled proxy streams
          const heartbeat = setInterval(() => {
            stream.writeSSE({
              data: JSON.stringify({ type: "server.heartbeat", properties: {} }),
            })
          }, 10_000)

          await new Promise<void>((resolve) => {
            stream.onAbort(() => {
              clearInterval(heartbeat)
              unsub()
              resolve()
              log.info("event disconnected")
            })
          })
        })
      })
  }

  export function listen(port = PORT) {
    const app = Default()
    const server = Bun.serve({
      fetch: app.fetch,
      port,
      idleTimeout: 255,
    })
    log.info(`listening on http://localhost:${server.port}`)
    return server
  }
}
