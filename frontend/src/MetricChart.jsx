import { number, chartCeiling } from './lib';

export const metricOptions = [{ key: 'max', label: '최고 중량', unit: 'kg', color: '#4d7846' }, { key: 'reps', label: '총 반복 수', unit: '회', color: '#4b75b0' }];
export const chartModes = [{ key: 'max', label: '최고 중량' }, { key: 'reps', label: '총 반복 수' }, { key: 'both', label: '두 지표 함께' }];
export function MetricChart({ mode, points }) {
  const metrics = metricOptions.filter((m) => mode === 'both' || m.key === mode);
  const combined = mode === 'both';
  const title = combined ? '최고 중량 · 총 반복 수' : metrics[0].label;
  return <article className="chart-card"><div className="chart-heading"><span>{title}</span>
    <div className="chart-latest">{metrics.map((m) => <div key={m.key}><span className="chart-legend" style={{ color: m.color }}><i />{m.label}</span><strong>{number(points.at(-1)[m.key])}<small>{m.unit}</small></strong></div>)}</div>
    <small>마지막 기록 기준{combined ? ' · 왼쪽 축 kg / 오른쪽 축 회' : ''}</small></div>
    <svg className="chart" viewBox="0 0 390 205" role="img" aria-label={`${title} 날짜별 변화.${combined ? ' 왼쪽 축은 중량 kg, 오른쪽 축은 반복 수 회입니다.' : ''} 아래 기록 표에서 정확한 수치를 확인할 수 있습니다.`}>
      {[0, 0.5, 1].map((ratio) => <line key={ratio} x1="55" x2="335" y1={160 - ratio * 115} y2={160 - ratio * 115} stroke="#e7e9e1" strokeDasharray="3 4" />)}
      {metrics.map((m, metricIndex) => {
        const values = points.map((p) => p[m.key]);
        const ceiling = chartCeiling(values);
        const right = combined && metricIndex === 1;
        const coords = values.map((v, i) => [points.length === 1 ? 195 : 55 + i / (points.length - 1) * 280, 160 - v / ceiling * 115]);
        return <g key={m.key}>
          <text x={right ? 344 : 47} y="23" textAnchor={right ? 'start' : 'end'} style={{ fill: m.color }}>{m.unit}</text>
          {[0, 0.5, 1].map((ratio) => <text key={ratio} x={right ? 344 : 47} y={164 - ratio * 115} textAnchor={right ? 'start' : 'end'} style={{ fill: m.color }}>{number(ceiling * ratio)}</text>)}
          <polyline points={coords.map((c) => c.join(',')).join(' ')} fill="none" stroke={m.color} strokeWidth="2.5" strokeDasharray={m.key === 'reps' ? '6 4' : undefined} strokeLinejoin="round" />
          {coords.map(([x, y], i) => <circle key={points[i].day} cx={x} cy={y} r={right ? 3 : 4.5} fill={right ? m.color : '#fff'} stroke={m.color} strokeWidth="1.5"><title>{points[i].day}: {m.label} {number(values[i])} {m.unit}</title></circle>)}
        </g>;
      })}
      <text x="55" y="192">{points[0].day.slice(5).replace('-', '/')}</text><text x="335" y="192" textAnchor="end">{points.length > 1 ? points.at(-1).day.slice(5).replace('-', '/') : ''}</text>
    </svg>
  </article>;
}
