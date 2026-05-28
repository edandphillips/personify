import { useEffect, useMemo, useState } from 'react'
import { BrowserRouter, Routes, Route, Link, useParams } from 'react-router-dom'

const API_URL = 'http://localhost:3000'

// Locked to a single solo creator. Swap this constant to relaunch the studio for someone else.
const CREATOR = {
  id: '11111111-1111-4111-8111-111111111111',
  display_name: 'Alex Rivera',
  email: 'alex@studio.example',
  handle: 'alex-rivera',
}

const usd = (cents) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)

const formatProductType = (t) =>
  (t || '').split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')

const toNum = (v) => (v == null ? null : Number(v))

const normalizeInvoice = (raw) => ({
  ...raw,
  amount_cents: Number(raw.amount_cents),
  platform_fee_cents: toNum(raw.platform_fee_cents),
  creator_net_cents: toNum(raw.creator_net_cents),
  status: raw.status === 'pending_payment' ? 'pending' : raw.status,
})

async function readError(res) {
  try {
    const body = await res.json()
    if (body?.error) return body.error
  } catch {
    /* response wasn't JSON */
  }
  return `${res.status} ${res.statusText || 'request failed'}`
}

function StatusBadge({ status }) {
  const styles = {
    draft: 'bg-slate-100 text-slate-700 ring-slate-200',
    pending: 'bg-amber-50 text-amber-700 ring-amber-200',
    paid: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  }
  const label = status ? status[0].toUpperCase() + status.slice(1) : 'Unknown'
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${
        styles[status] ?? styles.draft
      }`}
    >
      {label}
    </span>
  )
}

function MetricCard({ label, value, hint, accent }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="text-sm font-medium text-slate-500">{label}</div>
      <div className={`mt-2 text-3xl font-semibold tracking-tight ${accent ?? 'text-slate-900'}`}>
        {value}
      </div>
      {hint && <div className="mt-1 text-xs text-slate-400">{hint}</div>}
    </div>
  )
}

function ErrorBanner({ error, onDismiss }) {
  if (!error) return null
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
      <div>
        <div className="font-semibold">Network error</div>
        <div className="mt-0.5 text-rose-700">{error}</div>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="rounded-md px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100"
      >
        Dismiss
      </button>
    </div>
  )
}

function PrivateDashboard() {
  const [invoices, setInvoices] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [form, setForm] = useState({ invoice_number: '', brand_name: '', amount: '', description: '' })
  const [formError, setFormError] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [payingId, setPayingId] = useState(null)

  useEffect(() => {
    const controller = new AbortController()
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`${API_URL}/api/invoices`, { signal: controller.signal })
        if (!res.ok) throw new Error(await readError(res))
        const data = await res.json()
        setInvoices(Array.isArray(data) ? data.map(normalizeInvoice) : [])
      } catch (err) {
        if (err.name === 'AbortError') return
        console.error('Failed to load invoices:', err)
        setError(`Couldn't load invoices: ${err.message}`)
      } finally {
        setLoading(false)
      }
    }
    load()
    return () => controller.abort()
  }, [])

  const metrics = useMemo(() => {
    const totalInvoiced = invoices.reduce((s, i) => s + i.amount_cents, 0)
    const pendingPayments = invoices
      .filter((i) => i.status === 'pending')
      .reduce((s, i) => s + i.amount_cents, 0)
    const collectedRevenue = invoices
      .filter((i) => i.status === 'paid')
      .reduce((s, i) => s + i.amount_cents, 0)
    return { totalInvoiced, pendingPayments, collectedRevenue }
  }, [invoices])

  const topBrands = useMemo(() => {
    const totals = new Map()
    for (const inv of invoices) {
      if (inv.status !== 'paid') continue
      const name = inv.brand_name && inv.brand_name.trim()
      if (!name) continue
      totals.set(name, (totals.get(name) || 0) + inv.amount_cents)
    }
    return [...totals.entries()]
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5)
  }, [invoices])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setFormError(null)
    const amount = Number(form.amount)
    if (!form.invoice_number.trim()) {
      setFormError('Invoice number is required.')
      return
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setFormError('Amount must be greater than zero.')
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`${API_URL}/api/invoices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          creator_id: CREATOR.id,
          invoice_number: form.invoice_number.trim(),
          amount_cents: Math.round(amount * 100),
          description: form.description.trim() || null,
          brand_name: form.brand_name.trim() || null,
        }),
      })
      if (!res.ok) throw new Error(await readError(res))
      const created = await res.json()
      setInvoices((prev) => [normalizeInvoice(created), ...prev])
      setForm({ invoice_number: '', brand_name: '', amount: '', description: '' })
    } catch (err) {
      console.error('Failed to create invoice:', err)
      setError(`Couldn't create invoice: ${err.message}`)
    } finally {
      setSubmitting(false)
    }
  }

  const simulatePayment = async (id) => {
    setPayingId(id)
    setError(null)
    try {
      const payRes = await fetch(`${API_URL}/api/invoices/${id}/pay`, { method: 'POST' })
      if (!payRes.ok) throw new Error(await readError(payRes))
      const payPayload = await payRes.json()
      const intermediate = normalizeInvoice(payPayload.invoice ?? payPayload)
      setInvoices((prev) => prev.map((inv) => (inv.id === id ? intermediate : inv)))

      const bridgeRes = await fetch(`${API_URL}/api/dev/simulate-settlement/${id}`, {
        method: 'POST',
      })
      if (!bridgeRes.ok) throw new Error(await readError(bridgeRes))

      setInvoices((prev) =>
        prev.map((inv) =>
          inv.id === id
            ? { ...inv, status: 'paid', north_payment_status: 'succeeded' }
            : inv
        )
      )
    } catch (err) {
      console.error('Failed to simulate payment:', err)
      setError(`Payment simulation failed: ${err.message}`)
    } finally {
      setPayingId(null)
    }
  }

  const initials = CREATOR.display_name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 text-base font-bold text-white">
              P
            </div>
            <div>
              <div className="text-lg font-semibold tracking-tight">Personify</div>
              <div className="text-xs text-slate-500">Creator finance, on autopilot</div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Link
              to={`/shop/${CREATOR.handle}`}
              className="text-xs font-medium text-violet-600 hover:text-violet-700 hover:underline"
            >
              View Public Store ↗
            </Link>
            <div className="h-6 w-px bg-slate-200" />
            <div className="text-right">
              <div className="text-sm font-medium text-slate-900">{CREATOR.display_name}</div>
              <div className="text-xs text-slate-500">Solo Studio</div>
            </div>
            <div className="grid h-9 w-9 place-items-center rounded-full bg-violet-100 text-sm font-semibold text-violet-700">
              {initials}
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-8 px-6 py-8">
        <ErrorBanner error={error} onDismiss={() => setError(null)} />

        <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <MetricCard
            label="Total Invoiced"
            value={usd(metrics.totalInvoiced)}
            hint={`${invoices.length} invoice${invoices.length === 1 ? '' : 's'}`}
          />
          <MetricCard
            label="Pending Payments"
            value={usd(metrics.pendingPayments)}
            hint="Awaiting payout"
            accent="text-amber-600"
          />
          <MetricCard
            label="Collected Revenue"
            value={usd(metrics.collectedRevenue)}
            hint="Settled to date"
            accent="text-emerald-600"
          />
        </section>

        <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-1 space-y-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-base font-semibold text-slate-900">Create New Invoice</h2>
              <p className="mt-1 text-xs text-slate-500">For {CREATOR.display_name}</p>

              <form onSubmit={handleSubmit} className="mt-5 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700">
                    Invoice Number
                  </label>
                  <input
                    type="text"
                    value={form.invoice_number}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, invoice_number: e.target.value }))
                    }
                    placeholder="INV-2026-004"
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-200"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">
                    Brand Name
                  </label>
                  <input
                    type="text"
                    value={form.brand_name}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, brand_name: e.target.value }))
                    }
                    placeholder="Acme Industries"
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-200"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">
                    Amount (USD)
                  </label>
                  <div className="relative mt-1">
                    <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-sm text-slate-400">
                      $
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={form.amount}
                      onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                      placeholder="1500.00"
                      className="w-full rounded-lg border border-slate-200 py-2 pl-7 pr-3 text-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-200"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Description</label>
                  <textarea
                    rows={3}
                    value={form.description}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, description: e.target.value }))
                    }
                    placeholder="What is this invoice for?"
                    className="mt-1 w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-200"
                  />
                </div>
                {formError && (
                  <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-rose-200">
                    {formError}
                  </div>
                )}
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full rounded-lg bg-gradient-to-r from-violet-600 to-fuchsia-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:from-violet-500 hover:to-fuchsia-500 focus:outline-none focus:ring-2 focus:ring-violet-300 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting ? 'Creating…' : 'Create Draft Invoice'}
                </button>
              </form>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 px-6 py-4">
                <h2 className="text-base font-semibold text-slate-900">Top Brand Partners</h2>
                <p className="mt-0.5 text-xs text-slate-500">By settled revenue</p>
              </div>
              {topBrands.length === 0 ? (
                <div className="px-6 py-8 text-center text-sm text-slate-400">
                  No brand revenue yet — settle an invoice to see your top partners.
                </div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {topBrands.map((b, idx) => (
                    <li key={b.name} className="flex items-center justify-between px-6 py-3">
                      <div className="flex items-center gap-3">
                        <div className="grid h-5 w-5 place-items-center rounded-full bg-slate-100 text-[10px] font-semibold text-slate-500">
                          {idx + 1}
                        </div>
                        <div className="text-sm font-medium text-slate-900">{b.name}</div>
                      </div>
                      <div className="text-sm font-semibold tabular-nums text-emerald-700">
                        {usd(b.total)}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="lg:col-span-2">
            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
                <h2 className="text-base font-semibold text-slate-900">Recent Invoices</h2>
                <span className="text-xs text-slate-500">
                  {loading ? 'Loading…' : `${invoices.length} total`}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                        Invoice
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                        Amount
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                        Status
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {loading && (
                      <tr>
                        <td colSpan={4} className="px-6 py-10 text-center text-sm text-slate-400">
                          Loading invoices…
                        </td>
                      </tr>
                    )}
                    {!loading && invoices.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-6 py-10 text-center text-sm text-slate-400">
                          No invoices yet — create your first one.
                        </td>
                      </tr>
                    )}
                    {!loading &&
                      invoices.map((inv) => (
                        <tr key={inv.id} className="hover:bg-slate-50">
                          <td className="px-6 py-4">
                            <div className="text-sm font-medium text-slate-900">
                              {inv.invoice_number}
                            </div>
                            {inv.brand_name && (
                              <div className="mt-0.5 text-xs font-medium text-violet-700">
                                {inv.brand_name}
                              </div>
                            )}
                            {inv.description && (
                              <div className="mt-0.5 line-clamp-1 text-xs text-slate-500">
                                {inv.description}
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-4 text-sm font-medium text-slate-900">
                            {usd(inv.amount_cents)}
                          </td>
                          <td className="px-6 py-4">
                            <StatusBadge status={inv.status} />
                          </td>
                          <td className="px-6 py-4 text-right">
                            {inv.status === 'paid' ? (
                              <div className="inline-block min-w-[12rem] space-y-1 text-xs">
                                <div className="flex items-center justify-between gap-4">
                                  <span className="text-slate-500">Platform Fee (7%)</span>
                                  <span className="font-medium tabular-nums text-slate-700">
                                    {inv.platform_fee_cents != null ? usd(inv.platform_fee_cents) : '—'}
                                  </span>
                                </div>
                                <div className="flex items-center justify-between gap-4 border-t border-slate-100 pt-1">
                                  <span className="font-medium text-slate-700">Your Net Payout (93%)</span>
                                  <span className="font-semibold tabular-nums text-emerald-700">
                                    {inv.creator_net_cents != null ? usd(inv.creator_net_cents) : '—'}
                                  </span>
                                </div>
                              </div>
                            ) : (
                              <button
                                onClick={() => simulatePayment(inv.id)}
                                disabled={payingId === inv.id}
                                className="inline-flex items-center rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-700 transition hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {payingId === inv.id
                                  ? 'Contacting North…'
                                  : 'Simulate Payment via North'}
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}

function StorefrontProductCard({ product, isBuying, fileUrl, isPurchased, onBuy }) {
  const initials = product.title
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 3)
    .toUpperCase()

  return (
    <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex h-32 items-center justify-center bg-gradient-to-br from-violet-500 to-fuchsia-500 text-3xl font-bold text-white/90">
        {initials}
      </div>
      <div className="space-y-3 p-4">
        <span className="inline-flex items-center rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-violet-700 ring-1 ring-inset ring-violet-200">
          {formatProductType(product.type)}
        </span>
        <div className="text-base font-semibold text-slate-900">{product.title}</div>
        {isPurchased && fileUrl ? (
          <a
            href={fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 px-4 py-3 text-center text-sm font-semibold text-white shadow-sm transition hover:from-emerald-400 hover:to-teal-400 hover:shadow-md active:scale-95"
          >
            Download Asset ⬇
          </a>
        ) : isPurchased ? (
          <div className="rounded-lg bg-emerald-50 px-4 py-3 text-center text-sm font-semibold text-emerald-700">
            Purchased ✓ (no asset available)
          </div>
        ) : (
          <button
            type="button"
            onClick={onBuy}
            disabled={isBuying}
            className="w-full rounded-lg bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-90"
          >
            {isBuying ? 'Processing…' : `Buy now · ${usd(product.price_cents)}`}
          </button>
        )}
      </div>
    </article>
  )
}

function PublicStorefront() {
  const { handle } = useParams()
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [buyingId, setBuyingId] = useState(null)
  const [purchased, setPurchased] = useState({})

  useEffect(() => {
    const controller = new AbortController()
    const load = async () => {
      setLoading(true)
      try {
        const res = await fetch(`${API_URL}/api/products`, { signal: controller.signal })
        if (!res.ok) throw new Error(await readError(res))
        const data = await res.json()
        setProducts(Array.isArray(data) ? data : [])
      } catch (err) {
        if (err.name === 'AbortError') return
        console.error('Failed to load products:', err)
        setError(`Couldn't load store: ${err.message}`)
      } finally {
        setLoading(false)
      }
    }
    load()
    return () => controller.abort()
  }, [])

  const handleBuyNow = async (productId) => {
    setBuyingId(productId)
    setError(null)
    try {
      const res = await fetch(`${API_URL}/api/products/${productId}/checkout`, {
        method: 'POST',
      })
      if (!res.ok) throw new Error(await readError(res))
      const data = await res.json()
      setPurchased((prev) => ({ ...prev, [productId]: data.file_url ?? null }))
    } catch (err) {
      console.error('Checkout failed:', err)
      setError(`Couldn't complete checkout: ${err.message}`)
    } finally {
      setBuyingId(null)
    }
  }

  const handleInitials = (handle || '?')
    .split('-')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-12">
      <div className="mx-auto max-w-md space-y-6">
        <div className="text-center">
          <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 text-2xl font-bold text-white shadow">
            {handleInitials}
          </div>
          <h1 className="mt-4 text-xl font-semibold text-slate-900">@{handle}</h1>
          <p className="mt-1 text-sm text-slate-500">Solo creator · Fan store</p>
        </div>

        <ErrorBanner error={error} onDismiss={() => setError(null)} />

        {loading ? (
          <div className="rounded-2xl border border-slate-200 bg-white px-6 py-10 text-center text-sm text-slate-400">
            Loading store…
          </div>
        ) : products.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white px-6 py-10 text-center text-sm text-slate-400">
            No products available yet.
          </div>
        ) : (
          <div className="space-y-4">
            {products.map((p) => (
              <StorefrontProductCard
                key={p.id}
                product={p}
                isBuying={buyingId === p.id}
                isPurchased={Object.prototype.hasOwnProperty.call(purchased, p.id)}
                fileUrl={purchased[p.id]}
                onBuy={() => handleBuyNow(p.id)}
              />
            ))}
          </div>
        )}

        <div className="pt-2 text-center">
          <Link to="/" className="text-xs text-slate-400 hover:text-slate-600">
            ← back to dashboard
          </Link>
        </div>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<PrivateDashboard />} />
        <Route path="/shop/:handle" element={<PublicStorefront />} />
      </Routes>
    </BrowserRouter>
  )
}
