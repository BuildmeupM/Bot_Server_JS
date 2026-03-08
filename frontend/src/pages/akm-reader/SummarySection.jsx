// ── Summary Section Component ──
// แสดงสรุปยอดรวมทั้งหมด แยกตามวันที่
import { useMemo } from 'react'

/**
 * แปลง string ตัวเลขเป็น number
 */
function parseNum(str) {
    if (!str) return 0
    const n = parseFloat(str.replace(/,/g, ''))
    return isNaN(n) ? 0 : n
}

/**
 * จัดกลุ่มผลลัพธ์ตามวัน -> คำนวณยอดรวม
 */
function groupByDate(results) {
    const map = new Map()

    for (const r of results) {
        const date = r.date || 'ไม่ระบุวันที่'
        if (!map.has(date)) {
            map.set(date, { date, count: 0, preVat: 0, vat: 0, grandTotal: 0 })
        }
        const g = map.get(date)
        g.count += 1
        g.preVat += parseNum(r.preVat)
        g.vat += parseNum(r.vat)
        g.grandTotal += parseNum(r.grandTotal)
    }

    // เรียงตามวันที่
    return [...map.values()].sort((a, b) => a.date.localeCompare(b.date))
}

const fmt = (n) => n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const S = {
    container: {
        background: '#fff',
        border: '1.5px solid #e8ecf1',
        borderRadius: 16,
        overflow: 'hidden',
        marginBottom: 24,
        boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
    },
    header: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '18px 24px',
        background: 'linear-gradient(135deg, #1e1e2d, #2d2d44)',
        color: '#fff',
    },
    headerLeft: {
        display: 'flex',
        alignItems: 'center',
        gap: 10,
    },
    headerIcon: {
        width: 36,
        height: 36,
        borderRadius: 10,
        background: 'linear-gradient(135deg, #f97316, #fb923c)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 18,
    },
    headerTitle: {
        fontSize: 16,
        fontWeight: 800,
        fontFamily: 'Inter, sans-serif',
    },
    headerSub: {
        fontSize: 12,
        color: '#a1a1b5',
        marginTop: 1,
    },
    totalCard: {
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 0,
        borderBottom: '1px solid #f0f2f5',
    },
    totalItem: (color, border) => ({
        padding: '20px 24px',
        textAlign: 'center',
        borderRight: border ? '1px solid #f0f2f5' : 'none',
    }),
    totalLabel: {
        fontSize: 11,
        fontWeight: 700,
        color: '#8b8fa3',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        marginBottom: 6,
    },
    totalValue: (color) => ({
        fontSize: 22,
        fontWeight: 800,
        color,
        fontFamily: 'Inter, sans-serif',
    }),
    table: {
        width: '100%',
        borderCollapse: 'collapse',
    },
    th: {
        padding: '12px 16px',
        fontSize: 11,
        fontWeight: 700,
        color: '#8b8fa3',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        textAlign: 'left',
        background: '#fafbfc',
        borderBottom: '1.5px solid #e8ecf1',
    },
    thRight: {
        padding: '12px 16px',
        fontSize: 11,
        fontWeight: 700,
        color: '#8b8fa3',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        textAlign: 'right',
        background: '#fafbfc',
        borderBottom: '1.5px solid #e8ecf1',
    },
    td: {
        padding: '12px 16px',
        fontSize: 13,
        fontWeight: 600,
        color: '#374151',
        borderBottom: '1px solid #f0f2f5',
    },
    tdRight: {
        padding: '12px 16px',
        fontSize: 13,
        fontWeight: 600,
        color: '#374151',
        borderBottom: '1px solid #f0f2f5',
        textAlign: 'right',
        fontFamily: "'Fira Code', 'Consolas', monospace",
    },
    dateBadge: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 12px',
        background: '#fff7ed',
        border: '1px solid #fed7aa',
        borderRadius: 8,
        fontSize: 13,
        fontWeight: 700,
        color: '#ea580c',
    },
    countBadge: {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: 28,
        height: 24,
        borderRadius: 12,
        background: '#eff6ff',
        color: '#3b82f6',
        fontSize: 12,
        fontWeight: 700,
    },
    footerRow: {
        background: '#f8f9fb',
    },
    footerTd: {
        padding: '14px 16px',
        fontSize: 14,
        fontWeight: 800,
        color: '#1a1a2e',
        borderTop: '2px solid #e8ecf1',
    },
    footerTdRight: {
        padding: '14px 16px',
        fontSize: 14,
        fontWeight: 800,
        color: '#1a1a2e',
        borderTop: '2px solid #e8ecf1',
        textAlign: 'right',
        fontFamily: "'Fira Code', 'Consolas', monospace",
    },
}

export default function SummarySection({ results }) {
    const groups = useMemo(() => groupByDate(results), [results])

    const totals = useMemo(() => ({
        count: results.length,
        preVat: results.reduce((s, r) => s + parseNum(r.preVat), 0),
        vat: results.reduce((s, r) => s + parseNum(r.vat), 0),
        grandTotal: results.reduce((s, r) => s + parseNum(r.grandTotal), 0),
    }), [results])

    if (results.length === 0) return null

    return (
        <div style={S.container}>
            {/* Header */}
            <div style={S.header}>
                <div style={S.headerLeft}>
                    <div style={S.headerIcon}>📊</div>
                    <div>
                        <div style={S.headerTitle}>สรุปยอดรวม</div>
                        <div style={S.headerSub}>{groups.length} วัน • {totals.count} เอกสาร</div>
                    </div>
                </div>
            </div>

            {/* Grand Total Cards */}
            <div style={S.totalCard}>
                <div style={S.totalItem('#3b82f6', true)}>
                    <div style={S.totalLabel}>ยอดก่อน VAT รวม</div>
                    <div style={S.totalValue('#3b82f6')}>{fmt(totals.preVat)}</div>
                </div>
                <div style={S.totalItem('#f59e0b', true)}>
                    <div style={S.totalLabel}>VAT 7% รวม</div>
                    <div style={S.totalValue('#f59e0b')}>{fmt(totals.vat)}</div>
                </div>
                <div style={S.totalItem('#22c55e', false)}>
                    <div style={S.totalLabel}>ยอดรวมทั้งสิ้น</div>
                    <div style={S.totalValue('#22c55e')}>{fmt(totals.grandTotal)}</div>
                </div>
            </div>

            {/* Table — แยกตามวัน */}
            <table style={S.table}>
                <thead>
                    <tr>
                        <th style={S.th}>วันที่</th>
                        <th style={{ ...S.thRight, textAlign: 'center' }}>จำนวนเอกสาร</th>
                        <th style={S.thRight}>ยอดก่อน VAT</th>
                        <th style={S.thRight}>VAT 7%</th>
                        <th style={S.thRight}>ยอดรวมทั้งสิ้น</th>
                    </tr>
                </thead>
                <tbody>
                    {groups.map(g => (
                        <tr key={g.date}>
                            <td style={S.td}>
                                <span style={S.dateBadge}>📅 {g.date}</span>
                            </td>
                            <td style={{ ...S.td, textAlign: 'center' }}>
                                <span style={S.countBadge}>{g.count}</span>
                            </td>
                            <td style={S.tdRight}>{fmt(g.preVat)}</td>
                            <td style={S.tdRight}>{fmt(g.vat)}</td>
                            <td style={S.tdRight}>
                                <span style={{ color: '#16a34a', fontWeight: 800 }}>
                                    {fmt(g.grandTotal)}
                                </span>
                            </td>
                        </tr>
                    ))}
                </tbody>
                <tfoot>
                    <tr style={S.footerRow}>
                        <td style={S.footerTd}>📌 รวมทั้งหมด</td>
                        <td style={{ ...S.footerTd, textAlign: 'center' }}>{totals.count}</td>
                        <td style={S.footerTdRight}>{fmt(totals.preVat)}</td>
                        <td style={S.footerTdRight}>{fmt(totals.vat)}</td>
                        <td style={S.footerTdRight}>
                            <span style={{ color: '#16a34a' }}>{fmt(totals.grandTotal)}</span>
                        </td>
                    </tr>
                </tfoot>
            </table>
        </div>
    )
}
