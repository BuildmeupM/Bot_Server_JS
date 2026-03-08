// ── Processing Status Component ──
// แสดง Progress bar และสถานะการประมวลผล

const S = {
    container: {
        background: '#fff',
        border: '1px solid #e8ecf1',
        borderRadius: 16,
        padding: 24,
        marginBottom: 24,
    },
    header: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 16,
    },
    title: {
        fontSize: 15,
        fontWeight: 700,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
    },
    statsGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 12,
        marginBottom: 16,
    },
    statBox: (color) => ({
        background: color + '0d',
        border: `1.5px solid ${color}22`,
        borderRadius: 12,
        padding: '12px 14px',
        textAlign: 'center',
    }),
    statValue: (color) => ({
        fontSize: 22,
        fontWeight: 700,
        color,
    }),
    statLabel: {
        fontSize: 11,
        color: '#8b8fa3',
        fontWeight: 600,
        marginTop: 2,
        letterSpacing: '0.03em',
    },
    trackOuter: {
        height: 8,
        background: '#f1f3f5',
        borderRadius: 4,
        overflow: 'hidden',
    },
    trackFill: (pct) => ({
        height: '100%',
        width: `${pct}%`,
        background: pct >= 100
            ? 'linear-gradient(90deg, #22c55e, #4ade80)'
            : 'linear-gradient(90deg, #f97316, #fb923c)',
        borderRadius: 4,
        transition: 'width 0.4s ease',
    }),
    stepList: {
        display: 'flex',
        gap: 12,
        marginTop: 16,
        flexWrap: 'wrap',
    },
    stepItem: (active, done) => ({
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 14px',
        borderRadius: 20,
        fontSize: 12,
        fontWeight: 600,
        background: done ? '#f0fdf4' : active ? '#fff7ed' : '#f8f9fb',
        color: done ? '#16a34a' : active ? '#f97316' : '#8b8fa3',
        border: `1.5px solid ${done ? '#bbf7d0' : active ? '#fed7aa' : '#e8ecf1'}`,
        transition: 'all 0.3s',
    }),
}

const STEPS = [
    { key: 'upload', label: 'อัพโหลดไฟล์', icon: '📤' },
    { key: 'reading', label: 'อ่าน PDF', icon: '🔤' },
    { key: 'extracting', label: 'ดึงข้อมูล', icon: '🔍' },
    { key: 'merging', label: 'รวมหน้า', icon: '🔀' },
    { key: 'done', label: 'เสร็จสิ้น', icon: '✅' },
]

export default function ProcessingStatus({ total = 0, processed = 0, success = 0, failed = 0, currentStep = 'upload' }) {
    const pct = total > 0 ? Math.round((processed / total) * 100) : 0
    const stepIdx = STEPS.findIndex(s => s.key === currentStep)

    return (
        <div style={S.container}>
            <div style={S.header}>
                <div style={S.title}>
                    <span>⚡</span> สถานะการประมวลผล
                </div>
                {total > 0 && (
                    <span style={{ fontSize: 13, color: '#8b8fa3', fontWeight: 600 }}>
                        {processed}/{total} ไฟล์ ({pct}%)
                    </span>
                )}
            </div>

            {/* สถิติ */}
            <div style={S.statsGrid}>
                <div style={S.statBox('#6366f1')}>
                    <div style={S.statValue('#6366f1')}>{total}</div>
                    <div style={S.statLabel}>ทั้งหมด</div>
                </div>
                <div style={S.statBox('#f97316')}>
                    <div style={S.statValue('#f97316')}>{processed - success - failed}</div>
                    <div style={S.statLabel}>กำลังอ่าน</div>
                </div>
                <div style={S.statBox('#22c55e')}>
                    <div style={S.statValue('#22c55e')}>{success}</div>
                    <div style={S.statLabel}>สำเร็จ</div>
                </div>
                <div style={S.statBox('#ef4444')}>
                    <div style={S.statValue('#ef4444')}>{failed}</div>
                    <div style={S.statLabel}>ล้มเหลว</div>
                </div>
            </div>

            {/* Progress bar */}
            <div style={S.trackOuter}>
                <div style={S.trackFill(pct)} />
            </div>

            {/* ขั้นตอน */}
            <div style={S.stepList}>
                {STEPS.map((step, i) => (
                    <div key={step.key} style={S.stepItem(i === stepIdx, i < stepIdx)}>
                        <span>{step.icon}</span> {step.label}
                    </div>
                ))}
            </div>
        </div>
    )
}
