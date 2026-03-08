// ── Confidence Badge Component ──
// แสดงค่าความแม่นยำของการอ่านเอกสาร (🟢🟡🔴)

const LEVELS = [
    { min: 100, color: '#22c55e', bg: '#f0fdf4', border: '#bbf7d0', label: 'แม่นยำ', icon: '🟢' },
    { min: 60,  color: '#f59e0b', bg: '#fffbeb', border: '#fde68a', label: 'ต้องตรวจสอบ', icon: '🟡' },
    { min: 0,   color: '#ef4444', bg: '#fef2f2', border: '#fecaca', label: 'ต้องแก้ไข', icon: '🔴' },
]

function getLevel(score) {
    return LEVELS.find(l => score >= l.min) || LEVELS[LEVELS.length - 1]
}

export default function ConfidenceBadge({ score = 0, size = 'md' }) {
    const level = getLevel(score)
    const isSm = size === 'sm'

    return (
        <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: isSm ? 5 : 8,
            padding: isSm ? '4px 10px' : '6px 14px',
            background: level.bg,
            border: `1.5px solid ${level.border}`,
            borderRadius: 20,
            fontSize: isSm ? 11 : 13,
            fontWeight: 600,
            color: level.color,
            whiteSpace: 'nowrap',
        }}>
            <span style={{ fontSize: isSm ? 10 : 14 }}>{level.icon}</span>
            <span>{score}%</span>
            {!isSm && <span style={{ opacity: 0.8, fontWeight: 500 }}>— {level.label}</span>}
        </div>
    )
}
