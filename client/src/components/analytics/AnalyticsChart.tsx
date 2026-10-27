import { useId, useState } from 'react';
import { formatPrice } from '@/lib/event-format';
import type { AnalyticsPoint } from '@/types/analytics';
type ChartKind = 'reservations' | 'money' | 'attendance';
const utcDate = (value: string) => new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(value));
const number = (value: bigint) => new Intl.NumberFormat('en-IN').format(value);
export function AnalyticsChart({ points, kind }: { points: AnalyticsPoint[]; kind: ChartKind }) {
  const [selected, setSelected] = useState(0), id = useId();
  const title = kind === 'money' ? 'Simulated Gross Revenue trend' : kind === 'attendance' ? 'Check-in activity' : 'Reservation activity';
  const value = (point: AnalyticsPoint) => BigInt(kind === 'money' ? point.simulatedGrossRevenuePaise : kind === 'attendance' ? point.checkIns : point.reservationsCreated);
  const values = points.map(value), maximum = values.reduce((a, b) => a > b ? a : b, 0n), chosen = points[Math.min(selected, points.length - 1)]!;
  const format = (v: bigint) => kind === 'money' ? formatPrice(v.toString()) : number(v);
  const x = (index: number) => 28 + (index + 0.5) / points.length * 584;
  const height = (v: bigint) => maximum ? Number(v * 14000n / maximum) / 100 : 0;
  return <section className="analytics-chart" aria-labelledby={id + '-title'}><header><div><p className="eyebrow">{kind === 'money' ? 'SIMULATED · INR' : 'PERSISTED ACTIVITY'}</p><h2 id={id + '-title'}>{title}</h2></div><span className="analytics-unit">{kind === 'money' ? 'Indian rupees (₹)' : kind === 'attendance' ? 'Check-ins' : 'Reservations'}</span></header>
    {maximum === 0n ? <p className="analytics-chart-empty">{kind === 'money' ? 'No simulated revenue in this period.' : kind === 'attendance' ? 'No check-ins in this period.' : 'No reservations created in this period.'}</p> : <>
      <div className="analytics-axis"><span>{format(maximum)}</span><span>Maximum per UTC bucket</span></div>
      <svg className="analytics-plot" viewBox="0 0 640 180" role="img" aria-label={title + '; full values in the chart data table'}>
        <line x1="20" y1="155" x2="620" y2="155" className="chart-grid" /><line x1="20" y1="85" x2="620" y2="85" className="chart-grid" /><line x1="20" y1="15" x2="620" y2="15" className="chart-grid" />
        {kind === 'reservations' ? <><polyline className="chart-reservations" points={values.map((v, i) => `${x(i)},${155 - height(v)}`).join(' ')} /><polyline className="chart-confirmed" points={points.map((p, i) => `${x(i)},${155 - height(BigInt(p.cohortConfirmed))}`).join(' ')} /></> : null}
        {values.map((v, index) => <rect key={points[index]!.from} x={x(index) - Math.max(2, 220 / points.length)} y={kind === 'reservations' ? 15 : 155 - height(v)} width={Math.max(4, 440 / points.length)} height={kind === 'reservations' ? 140 : Math.max(v ? 1 : 0, height(v))} className={kind === 'reservations' ? 'chart-hit' : 'chart-bar' + (index === selected ? ' is-selected' : '')} onMouseEnter={() => setSelected(index)}><title>{utcDate(points[index]!.from)}: {format(v)}</title></rect>)}
      </svg>
      {kind === 'reservations' && <p className="analytics-legend"><span>Reservations created</span><span>Currently confirmed from that cohort</span></p>}
      <div className="analytics-chart-dates"><span>{utcDate(points[0]!.from)}</span><span>{utcDate(points.at(-1)!.to)} · UTC</span></div>
      <label className="analytics-bucket" htmlFor={id + '-bucket'}>Explore UTC bucket<input id={id + '-bucket'} type="range" min={0} max={points.length - 1} value={Math.min(selected, points.length - 1)} onChange={(event) => setSelected(Number(event.target.value))} aria-describedby={id + '-tooltip'} /></label>
      <p id={id + '-tooltip'} className="analytics-tooltip" role="status"><strong>{utcDate(chosen.from)} → {utcDate(chosen.to)} (end exclusive)</strong><span>{kind === 'money' ? 'Simulated Gross Revenue' : kind === 'attendance' ? 'Check-ins' : 'Reservations created'}: {format(value(chosen))}{kind === 'reservations' ? ' · Currently confirmed: ' + number(BigInt(chosen.cohortConfirmed)) : ''}</span></p>
    </>}
    <details className="analytics-chart-data"><summary>View {title.toLowerCase()} data</summary><div className="analytics-table-scroll"><table><caption>{title} · UTC intervals, end exclusive</caption><thead><tr><th scope="col">From (UTC)</th><th scope="col">To (UTC)</th><th scope="col">{kind === 'money' ? 'Simulated Gross Revenue (INR)' : kind === 'attendance' ? 'Check-ins' : 'Reservations created'}</th>{kind === 'reservations' && <th scope="col">Currently confirmed cohort</th>}</tr></thead><tbody>{points.map((p) => <tr key={p.from}><td>{new Date(p.from).toISOString()}</td><td>{new Date(p.to).toISOString()}</td><td>{format(value(p))}</td>{kind === 'reservations' && <td>{number(BigInt(p.cohortConfirmed))}</td>}</tr>)}</tbody></table></div></details>
  </section>;
}
