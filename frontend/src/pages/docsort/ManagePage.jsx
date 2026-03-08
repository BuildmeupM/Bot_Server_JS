import { useState, useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react'
import Sidebar from '../../components/Sidebar'
import { browseDirectory, getDrives, renameFile, moveFile, getPdfInfo, getFileContent, executeRename, executeBatchRename, backupAllFiles, consolidateFiles, getCompanies, createCompany, updateCompany, logUsage } from '../../services/api'
import toast from 'react-hot-toast'

const FILE_TYPE_ICONS = {
    pdf: '📄', image: '🖼️', video: '🎬', audio: '🎵',
    text: '📝', office: '📊', other: '📎'
}

function formatSize(bytes) {
    if (!bytes) return '—'
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / 1048576).toFixed(1) + ' MB'
}

function formatDate(dateStr) {
    if (!dateStr) return ''
    return new Date(dateStr).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })
}

// ── Rename Form Component (Tab 1 & shared) ──
const RenameForm = forwardRef(function RenameForm({ data, onChange, initialCodes, mode = 'single', groupCode = '' }, ref) {
    const {
        companyName = '', docType = '', whtExpenseType = '', whtSubType = '',
        whtPercent = '', whtAmount = '', pp36Amount = '',
        vatAmount = '', noneVatAmount = '',
        accountCodes = [{ code: '', description: '' }],
        paymentCodes = [{ code: '', description: '' }], originalName = ''
    } = data

    const update = (field, value) => onChange({ ...data, [field]: value })

    // ── Company autocomplete state ──
    const [companySuggestions, setCompanySuggestions] = useState([])
    const [showSuggestions, setShowSuggestions] = useState(false)
    const [addingCompany, setAddingCompany] = useState(false)
    const companyInputRef = useRef(null)
    const suggestionsRef = useRef(null)

    // ── Track selected company for DB update ──
    const [selectedCompanyId, setSelectedCompanyId] = useState(null)
    const [dbCodes, setDbCodes] = useState(null)  // original codes from DB

    // Fetch companies when typing
    useEffect(() => {
        if (!companyName || companyName.length < 1) {
            setCompanySuggestions([])
            return
        }
        const timer = setTimeout(async () => {
            try {
                const res = await getCompanies(companyName, groupCode)
                setCompanySuggestions(res.data || [])
            } catch { setCompanySuggestions([]) }
        }, 300)
        return () => clearTimeout(timer)
    }, [companyName, groupCode])

    // Close dropdown on outside click
    useEffect(() => {
        const handleClick = (e) => {
            if (companyInputRef.current && !companyInputRef.current.contains(e.target) &&
                suggestionsRef.current && !suggestionsRef.current.contains(e.target)) {
                setShowSuggestions(false)
            }
        }
        document.addEventListener('mousedown', handleClick)
        return () => document.removeEventListener('mousedown', handleClick)
    }, [])

    // Select a company from suggestions — auto-fill codes + store for DB update
    const selectCompany = (company) => {
        const acctCodes = company.account_codes?.length > 0
            ? company.account_codes.map(c => ({ code: c.code, description: c.description || '' }))
            : [{ code: '', description: '' }]
        const pmtCodes = company.payment_codes?.length > 0
            ? company.payment_codes.map(c => ({ code: c.code, description: c.description || '' }))
            : [{ code: '', description: '' }]

        onChange({
            ...data,
            companyName: company.company_name,
            accountCodes: acctCodes,
            paymentCodes: pmtCodes,
        })

        // Store company ID + original codes for detecting changes later
        setSelectedCompanyId(company.id)
        setDbCodes({
            accountCodes: JSON.parse(JSON.stringify(acctCodes)),
            paymentCodes: JSON.parse(JSON.stringify(pmtCodes))
        })
        setShowSuggestions(false)
    }

    // ── Custom confirm modal state ──
    const [confirmModal, setConfirmModal] = useState(null) // { changes, resolve }

    // ── Check if codes changed from DB and prompt to update ──
    const checkAndUpdateCompanyCodes = async () => {
        if (!selectedCompanyId || !dbCodes) return

        const normalize = (codes) => codes.filter(c => c.code.trim()).map(c => `${c.code}|${c.description || ''}`).sort().join(',')

        const dbAcct = normalize(dbCodes.accountCodes)
        const dbPmt = normalize(dbCodes.paymentCodes)
        const curAcct = normalize(accountCodes)
        const curPmt = normalize(paymentCodes)

        if (dbAcct === curAcct && dbPmt === curPmt) return  // no changes

        // Build changes data for modal
        const changes = []
        if (dbAcct !== curAcct) {
            changes.push({
                type: 'account',
                label: 'โค้ดบันทึกบัญชี',
                icon: '📊',
                oldCodes: dbCodes.accountCodes.filter(c => c.code.trim()).map(c => c.code),
                newCodes: accountCodes.filter(c => c.code.trim()).map(c => c.code),
            })
        }
        if (dbPmt !== curPmt) {
            changes.push({
                type: 'payment',
                label: 'โค้ดตัดชำระเงิน',
                icon: '💳',
                oldCodes: dbCodes.paymentCodes.filter(c => c.code.trim()).map(c => c.code),
                newCodes: paymentCodes.filter(c => c.code.trim()).map(c => c.code),
            })
        }

        // Show modal and wait for user response
        const confirmed = await new Promise(resolve => {
            setConfirmModal({ changes, resolve })
        })

        if (!confirmed) return

        try {
            await updateCompany(selectedCompanyId, {
                company_name: companyName,
                group_code: groupCode || 'DEFAULT',
                account_codes: accountCodes.filter(c => c.code.trim()),
                payment_codes: paymentCodes.filter(c => c.code.trim()),
            })
            toast.success('อัพเดทโค้ดในฐานข้อมูลสำเร็จ ✅')
            setDbCodes({
                accountCodes: JSON.parse(JSON.stringify(accountCodes)),
                paymentCodes: JSON.parse(JSON.stringify(paymentCodes))
            })
        } catch (err) {
            toast.error(err.response?.data?.error || 'ไม่สามารถอัพเดทโค้ดในฐานข้อมูลได้')
        }
    }

    // Expose checkAndUpdateCompanyCodes to parent via ref
    useImperativeHandle(ref, () => ({
        checkAndUpdateCompanyCodes
    }), [selectedCompanyId, dbCodes, accountCodes, paymentCodes, companyName, groupCode])

    // Add new company to DB
    const handleAddCompany = async () => {
        if (!companyName.trim()) return toast.error('กรุณาระบุชื่อบริษัท')
        setAddingCompany(true)
        try {
            const payload = {
                company_name: companyName.trim(),
                group_code: groupCode || 'DEFAULT',
                account_codes: accountCodes.filter(c => c.code.trim()),
                payment_codes: paymentCodes.filter(c => c.code.trim()),
            }
            await createCompany(payload)
            toast.success(`เพิ่มบริษัท "${companyName.trim()}" สำเร็จ`)
            setShowSuggestions(false)
        } catch (err) {
            toast.error(err.response?.data?.error || 'ไม่สามารถเพิ่มบริษัทได้')
        } finally { setAddingCompany(false) }
    }

    // Code change warning
    const handleCodeChange = (type, index, field, value) => {
        const codes = type === 'account' ? [...accountCodes] : [...paymentCodes]
        const key = type === 'account' ? 'accountCodes' : 'paymentCodes'
        const initialList = type === 'account' ? initialCodes?.accountCodes : initialCodes?.paymentCodes

        if (field === 'code' && initialList && initialList[index]?.code && initialList[index].code !== '' && value !== initialList[index].code) {
            const confirmed = window.confirm(
                `โค้ดที่กรอก "${value}" ไม่ได้เป็นโค้ดเดิม "${initialList[index].code}"\nต้องการเปลี่ยนโค้ดหรือไม่?`
            )
            if (!confirmed) return
        }

        codes[index] = { ...codes[index], [field]: value }
        update(key, codes)
    }

    const addCode = (type) => {
        const key = type === 'account' ? 'accountCodes' : 'paymentCodes'
        const codes = type === 'account' ? [...accountCodes] : [...paymentCodes]
        codes.push({ code: '', description: '', amount: '' })
        update(key, codes)
    }

    const removeCode = (type, index) => {
        const key = type === 'account' ? 'accountCodes' : 'paymentCodes'
        const codes = (type === 'account' ? [...accountCodes] : [...paymentCodes]).filter((_, i) => i !== index)
        if (codes.length === 0) codes.push({ code: '', description: '' })
        update(key, codes)
    }

    // Get document total amount based on docType
    const getDocAmount = () => {
        const hasWHT = docType === 'WHT' || docType === 'WHT&VAT'
        if (hasWHT) {
            if (whtExpenseType === 'domestic') return whtAmount || ''
            if (whtExpenseType === 'foreign') {
                if (whtSubType === 'wht54' || whtSubType === 'wht54-pp36') {
                    if (whtPercent && whtAmount) {
                        const amt = parseFloat(whtAmount)
                        const pct = parseFloat(whtPercent)
                        const tax = (amt * pct) / (100 - pct)
                        return (amt + tax).toFixed(2).replace(/\.?0+$/, '')
                    }
                    return ''
                }
                if (whtSubType === 'pp36') return pp36Amount || ''
            }
            return ''
        }
        return ''
    }

    // Build code-amount part: pairs each code with its amount
    const buildCodeAmountPart = (codes, totalAmount) => {
        const validCodes = codes.filter(c => c.code)
        if (validCodes.length === 0) return totalAmount || ''
        if (validCodes.length === 1) {
            // Single code: code_totalAmount
            return [validCodes[0].code, totalAmount].filter(Boolean).join('_')
        }
        // Multiple codes: check if per-code amounts exist
        const hasPerCodeAmounts = validCodes.some(c => c.amount)
        if (hasPerCodeAmounts) {
            // code1_amt1_code2_amt2
            return validCodes.map(c => [c.code, c.amount].filter(Boolean).join('_')).join('_')
        }
        // Fallback: code1_code2_totalAmount
        const codesPart = validCodes.map(c => c.code).join('_')
        return [codesPart, totalAmount].filter(Boolean).join('_')
    }

    // Build preview filename
    // Unified pattern: ประเภทเอกสาร - โค้ดบันทึกบัญชี_ยอดเงิน - ชื่อไฟล์เดิม - โค้ดตัดชำระเงิน
    const buildPreview = () => {
        let docPart = ''
        const totalAmount = getDocAmount()
        const hasWHT = docType === 'WHT' || docType === 'WHT&VAT'
        const hasVAT = docType === 'VAT' || docType === 'WHT&VAT'
        if (hasWHT) {
            if (whtExpenseType === 'domestic') {
                docPart = `WHT${whtPercent || '?'}%`
            } else if (whtExpenseType === 'foreign') {
                if (whtSubType === 'wht54' || whtSubType === 'wht54-pp36') {
                    docPart = `WHT54-${whtPercent || '?'}%`
                    if (whtSubType === 'wht54-pp36') docPart += '-PP36'
                } else if (whtSubType === 'pp36') {
                    docPart = 'PP36'
                } else {
                    docPart = 'WHT'
                }
            } else {
                docPart = 'WHT'
            }
            if (hasVAT) docPart += '&VAT'
        } else if (docType === 'VAT') {
            docPart = 'VAT'
        } else if (docType === 'None_Vat') {
            docPart = 'None_Vat'
        }

        const acctAmountPart = buildCodeAmountPart(accountCodes, totalAmount)
        const payAmountPart = buildCodeAmountPart(paymentCodes, '')

        // Unified: ประเภท - โค้ดบัญชี_ยอดเงิน - ชื่อเดิม - โค้ดตัดชำระ
        const displayOriginalName = originalName || (mode === 'batch' ? '{ชื่อไฟล์เดิม}' : '')
        let nameParts = []
        if (docPart) nameParts.push(docPart)
        if (acctAmountPart) nameParts.push(acctAmountPart)
        if (displayOriginalName) nameParts.push(displayOriginalName)
        if (payAmountPart) nameParts.push(payAmountPart)
        return nameParts.join(' - ') + '.pdf'
    }

    return (
        <div className="rename-form">
            {/* ชื่อบริษัท (Autocomplete) */}
            <div className="form-group" style={{ marginBottom: 12, position: 'relative' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <label className="form-label-sm" style={{ margin: 0 }}>🏢 ชื่อบริษัท</label>
                    {companyName.trim() && (
                        <button
                            onClick={handleAddCompany}
                            disabled={addingCompany}
                            style={{
                                fontSize: 10, padding: '3px 10px', borderRadius: 6, border: '1px solid #a5d6a7',
                                background: addingCompany ? '#e0e0e0' : '#e8f5e9', color: '#2e7d32',
                                cursor: addingCompany ? 'wait' : 'pointer', fontWeight: 600
                            }}>
                            {addingCompany ? '⏳' : '➕'} เพิ่มบริษัทใหม่
                        </button>
                    )}
                </div>
                <input ref={companyInputRef} className="form-input" value={companyName}
                    onChange={e => { update('companyName', e.target.value); setShowSuggestions(true) }}
                    onFocus={() => { if (companySuggestions.length > 0 || companyName) setShowSuggestions(true) }}
                    placeholder="พิมพ์ชื่อบริษัท..."
                    style={{ fontSize: 12, padding: '8px 12px' }}
                    autoComplete="off" />
                {/* Suggestions dropdown */}
                {showSuggestions && companySuggestions.length > 0 && (
                    <div ref={suggestionsRef} style={{
                        position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 999,
                        background: '#fff', borderRadius: 10, border: '1px solid #e2e8f0',
                        boxShadow: '0 8px 24px rgba(0,0,0,.12)', maxHeight: 200, overflowY: 'auto',
                        marginTop: 2
                    }}>
                        {companySuggestions.map(c => (
                            <div key={c.id} onClick={() => selectCompany(c)}
                                style={{
                                    padding: '8px 12px', cursor: 'pointer', fontSize: 12,
                                    borderBottom: '1px solid #f4f6f8', display: 'flex', alignItems: 'center', gap: 8,
                                    transition: 'background .15s'
                                }}
                                onMouseEnter={e => e.currentTarget.style.background = '#f0f4ff'}
                                onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                                <span style={{ fontSize: 14 }}>🏢</span>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: 600, color: '#1e293b' }}>{c.company_name}</div>
                                    {(c.account_codes?.length > 0 || c.payment_codes?.length > 0) && (
                                        <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>
                                            {c.account_codes?.length > 0 && `📊 ${c.account_codes.map(ac => ac.code).join(', ')}`}
                                            {c.account_codes?.length > 0 && c.payment_codes?.length > 0 && ' · '}
                                            {c.payment_codes?.length > 0 && `💳 ${c.payment_codes.map(pc => pc.code).join(', ')}`}
                                        </div>
                                    )}
                                </div>
                                <span style={{ fontSize: 10, color: '#a5b4fc' }}>เลือก</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* ชื่อไฟล์เดิม (แก้ไขได้) */}
            <div className="form-group" style={{ marginBottom: 12 }}>
                <label className="form-label-sm">📝 ชื่อไฟล์เดิม (แก้ไขได้)</label>
                <input className="form-input" value={originalName}
                    onChange={e => update('originalName', e.target.value)}
                    placeholder="ชื่อไฟล์เดิม"
                    style={{ fontSize: 12, padding: '8px 12px' }} />
            </div>

            {/* ประเภทเอกสาร */}
            <div className="form-group" style={{ marginBottom: 12 }}>
                <label className="form-label-sm">📋 ประเภทเอกสาร</label>
                <div className="doc-type-selector">
                    {['WHT', 'VAT', 'None_Vat'].map(type => {
                        const isActive = docType === type || (docType === 'WHT&VAT' && (type === 'WHT' || type === 'VAT'))
                        return (
                            <button key={type}
                                className={`doc-type-btn ${isActive ? 'active' : ''}`}
                                onClick={() => {
                                    if (type === 'None_Vat') {
                                        update('docType', 'None_Vat')
                                    } else if (type === 'WHT') {
                                        if (docType === 'WHT') update('docType', '')
                                        else if (docType === 'VAT') update('docType', 'WHT&VAT')
                                        else if (docType === 'WHT&VAT') update('docType', 'VAT')
                                        else update('docType', 'WHT')
                                    } else if (type === 'VAT') {
                                        if (docType === 'VAT') update('docType', '')
                                        else if (docType === 'WHT') update('docType', 'WHT&VAT')
                                        else if (docType === 'WHT&VAT') update('docType', 'WHT')
                                        else update('docType', 'VAT')
                                    }
                                }}>
                                {type}
                            </button>
                        )
                    })}
                </div>
            </div>

            {/* WHT Sub-options */}
            {(docType === 'WHT' || docType === 'WHT&VAT') && (
                <div className="wht-options-panel">
                    <label className="form-label-sm">🔧 ตัวเลือก WHT</label>

                    {/* ค่าใช้จ่ายในประเทศ / ต่างประเทศ */}
                    <div className="wht-expense-type">
                        <button className={`wht-expense-btn ${whtExpenseType === 'domestic' ? 'active' : ''}`}
                            onClick={() => onChange({ ...data, whtExpenseType: 'domestic', whtSubType: '' })}>
                            <img src="https://flagcdn.com/w40/th.png" alt="TH" style={{ width: 20, height: 14, borderRadius: 2, objectFit: 'cover', verticalAlign: 'middle', marginRight: 6, border: '1px solid rgba(0,0,0,0.1)' }} />
                            ค่าใช้จ่ายในประเทศ
                        </button>
                        <button className={`wht-expense-btn ${whtExpenseType === 'foreign' ? 'active' : ''}`}
                            onClick={() => update('whtExpenseType', 'foreign')}>
                            🌍 ค่าใช้จ่ายต่างประเทศ
                        </button>
                    </div>

                    {/* ค่าใช้จ่ายในประเทศ: WHT{ตัวเลข}% - {ยอดเงิน} */}
                    {whtExpenseType === 'domestic' && (
                        <div className="wht-detail-row">
                            <span className="wht-prefix">WHT</span>
                            <input className="form-input wht-number-input" type="number"
                                value={whtPercent} onChange={e => update('whtPercent', e.target.value)}
                                placeholder="ตัวเลข" style={{ width: 70, fontSize: 12 }} />
                            <span className="wht-suffix">% -</span>
                            <input className="form-input wht-number-input" type="number"
                                value={whtAmount} onChange={e => update('whtAmount', e.target.value)}
                                placeholder="ยอดเงิน" style={{ width: 100, fontSize: 12 }} />
                        </div>
                    )}

                    {/* ค่าใช้จ่ายต่างประเทศ */}
                    {whtExpenseType === 'foreign' && (
                        <div className="wht-foreign-options">
                            <button className={`wht-sub-btn ${whtSubType === 'wht54' ? 'active' : ''}`}
                                onClick={() => update('whtSubType', 'wht54')}>
                                WHT54-{'{ตัวเลข}'}% - {'{ยอดเงิน}'}
                            </button>
                            <button className={`wht-sub-btn ${whtSubType === 'pp36' ? 'active' : ''}`}
                                onClick={() => update('whtSubType', 'pp36')}>
                                PP36
                            </button>

                            {whtSubType === 'pp36' && (
                                <div className="wht-detail-row" style={{ marginTop: 8 }}>
                                    <span className="wht-prefix">PP36</span>
                                    <span className="wht-suffix">ยอดเงิน:</span>
                                    <input className="form-input wht-number-input" type="number"
                                        value={pp36Amount} onChange={e => update('pp36Amount', e.target.value)}
                                        placeholder="ยอดเงิน" style={{ width: 120, fontSize: 12 }} />
                                </div>
                            )}
                            <button className={`wht-sub-btn ${whtSubType === 'wht54-pp36' ? 'active' : ''}`}
                                onClick={() => update('whtSubType', 'wht54-pp36')}>
                                WHT54-{'{ตัวเลข}'}% - {'{ยอดเงิน}'} - PP36
                            </button>

                            {(whtSubType === 'wht54' || whtSubType === 'wht54-pp36') && (
                                <>
                                    <div className="wht-detail-row" style={{ marginTop: 8 }}>
                                        <span className="wht-prefix">WHT54-</span>
                                        <input className="form-input wht-number-input" type="number"
                                            value={whtPercent} onChange={e => update('whtPercent', e.target.value)}
                                            placeholder="ตัวเลข" style={{ width: 70, fontSize: 12 }} />
                                        <span className="wht-suffix">% -</span>
                                        <input className="form-input wht-number-input" type="number"
                                            value={whtAmount} onChange={e => update('whtAmount', e.target.value)}
                                            placeholder="ยอดเงิน" style={{ width: 100, fontSize: 12 }} />
                                    </div>
                                    {whtPercent && whtAmount && (
                                        <div style={{
                                            marginTop: 6, padding: '6px 10px', borderRadius: 6,
                                            background: 'linear-gradient(135deg, #e0f2fe, #dbeafe)',
                                            border: '1px solid #93c5fd', fontSize: 11, color: '#1e40af'
                                        }}>
                                            💡 คำนวณ: ({whtAmount} × {whtPercent}) ÷ (100 - {whtPercent}) = <strong style={{ color: '#1d4ed8' }}>
                                                {((parseFloat(whtAmount) * parseFloat(whtPercent)) / (100 - parseFloat(whtPercent))).toFixed(2)}
                                            </strong>
                                            <br />✅ รวม: {whtAmount} + {((parseFloat(whtAmount) * parseFloat(whtPercent)) / (100 - parseFloat(whtPercent))).toFixed(2)} = <strong style={{ color: '#16a34a' }}>
                                                {(parseFloat(whtAmount) + (parseFloat(whtAmount) * parseFloat(whtPercent)) / (100 - parseFloat(whtPercent))).toFixed(2)}
                                            </strong>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    )}
                </div>
            )}



            {/* โค้ดบัญชี */}
            <div className="form-group" style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <label className="form-label-sm" style={{ margin: 0 }}>📊 โค้ดบันทึกบัญชี</label>
                    <button className="add-code-btn" onClick={() => addCode('account')}>+ เพิ่ม</button>
                </div>
                {accountCodes.map((ac, i) => (
                    <div key={i} className="code-entry-row">
                        <input className="form-input" value={ac.code}
                            onChange={e => handleCodeChange('account', i, 'code', e.target.value)}
                            placeholder="โค้ด" style={{ flex: 1, fontSize: 11, padding: '6px 10px' }} />
                        <input className="form-input" value={ac.description}
                            onChange={e => handleCodeChange('account', i, 'description', e.target.value)}
                            placeholder="คำอธิบาย" style={{ flex: 2, fontSize: 11, padding: '6px 10px' }} />
                        {accountCodes.length > 1 && (
                            <input className="form-input" type="number" value={ac.amount || ''}
                                onChange={e => handleCodeChange('account', i, 'amount', e.target.value)}
                                placeholder="ยอดเงิน" style={{ width: 90, fontSize: 11, padding: '6px 10px', background: '#fffbeb', border: '1px solid #fde68a' }} />
                        )}
                        {accountCodes.length > 1 && (
                            <button className="remove-code-btn" onClick={() => removeCode('account', i)}>✕</button>
                        )}
                    </div>
                ))}
                {/* Amount validation bar for account codes */}
                {accountCodes.length > 1 && (() => {
                    const totalDoc = getDocAmount()
                    const sumAmounts = accountCodes.reduce((s, c) => s + (parseFloat(c.amount) || 0), 0)
                    const totalDocNum = parseFloat(totalDoc) || 0
                    const isMatch = totalDocNum > 0 && Math.abs(sumAmounts - totalDocNum) < 0.01
                    const hasAnyAmount = accountCodes.some(c => c.amount)
                    if (!hasAnyAmount && !totalDoc) return null
                    return (
                        <div style={{
                            marginTop: 4, padding: '5px 10px', borderRadius: 6, fontSize: 10,
                            background: isMatch ? '#dcfce7' : '#fef3c7',
                            border: `1px solid ${isMatch ? '#86efac' : '#fde68a'}`,
                            color: isMatch ? '#166534' : '#92400e',
                            display: 'flex', alignItems: 'center', gap: 6
                        }}>
                            <span>{isMatch ? '✅' : '⚠️'}</span>
                            <span>ผลรวมยอดเงิน: <strong>{sumAmounts || 0}</strong> / <strong>{totalDocNum || '?'}</strong></span>
                            {isMatch && <span style={{ marginLeft: 'auto', fontWeight: 600 }}>ตรงกัน</span>}
                            {!isMatch && hasAnyAmount && totalDocNum > 0 && (
                                <span style={{ marginLeft: 'auto', fontWeight: 600 }}>ไม่ตรง (ต่าง {Math.abs(sumAmounts - totalDocNum).toFixed(2)})</span>
                            )}
                        </div>
                    )
                })()}
            </div>

            {/* โค้ดชำระเงิน */}
            <div className="form-group" style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <label className="form-label-sm" style={{ margin: 0 }}>💳 โค้ดตัดชำระเงิน</label>
                    <button className="add-code-btn" onClick={() => addCode('payment')}>+ เพิ่ม</button>
                </div>
                {paymentCodes.map((pc, i) => (
                    <div key={i} className="code-entry-row">
                        <input className="form-input" value={pc.code}
                            onChange={e => handleCodeChange('payment', i, 'code', e.target.value)}
                            placeholder="โค้ด" style={{ flex: 1, fontSize: 11, padding: '6px 10px' }} />
                        <input className="form-input" value={pc.description}
                            onChange={e => handleCodeChange('payment', i, 'description', e.target.value)}
                            placeholder="คำอธิบาย" style={{ flex: 2, fontSize: 11, padding: '6px 10px' }} />
                        {paymentCodes.length > 1 && (
                            <input className="form-input" type="number" value={pc.amount || ''}
                                onChange={e => handleCodeChange('payment', i, 'amount', e.target.value)}
                                placeholder="ยอดเงิน" style={{ width: 90, fontSize: 11, padding: '6px 10px', background: '#fffbeb', border: '1px solid #fde68a' }} />
                        )}
                        {paymentCodes.length > 1 && (
                            <button className="remove-code-btn" onClick={() => removeCode('payment', i)}>✕</button>
                        )}
                    </div>
                ))}
                {/* Amount validation bar for payment codes */}
                {paymentCodes.length > 1 && (() => {
                    const totalDoc = getDocAmount()
                    const sumAmounts = paymentCodes.reduce((s, c) => s + (parseFloat(c.amount) || 0), 0)
                    const totalDocNum = parseFloat(totalDoc) || 0
                    const isMatch = totalDocNum > 0 && Math.abs(sumAmounts - totalDocNum) < 0.01
                    const hasAnyAmount = paymentCodes.some(c => c.amount)
                    if (!hasAnyAmount && !totalDoc) return null
                    return (
                        <div style={{
                            marginTop: 4, padding: '5px 10px', borderRadius: 6, fontSize: 10,
                            background: isMatch ? '#dcfce7' : '#fef3c7',
                            border: `1px solid ${isMatch ? '#86efac' : '#fde68a'}`,
                            color: isMatch ? '#166534' : '#92400e',
                            display: 'flex', alignItems: 'center', gap: 6
                        }}>
                            <span>{isMatch ? '✅' : '⚠️'}</span>
                            <span>ผลรวมยอดเงิน: <strong>{sumAmounts || 0}</strong> / <strong>{totalDocNum || '?'}</strong></span>
                            {isMatch && <span style={{ marginLeft: 'auto', fontWeight: 600 }}>ตรงกัน</span>}
                            {!isMatch && hasAnyAmount && totalDocNum > 0 && (
                                <span style={{ marginLeft: 'auto', fontWeight: 600 }}>ไม่ตรง (ต่าง {Math.abs(sumAmounts - totalDocNum).toFixed(2)})</span>
                            )}
                        </div>
                    )
                })()}
            </div>

            {/* Preview ชื่อไฟล์ใหม่ */}
            <div className="filename-preview">
                <label className="form-label-sm">🔍 ชื่อไฟล์ใหม่ (Preview)</label>
                <div className="preview-filename">{buildPreview()}</div>
                {/* Pattern description */}
                <div style={{
                    marginTop: 8, padding: '8px 12px', borderRadius: 8,
                    background: 'linear-gradient(135deg, #f0f9ff, #e0f2fe)',
                    border: '1px solid #bae6fd', fontSize: 10, color: '#0369a1',
                    lineHeight: 1.6
                }}>
                    <div style={{ fontWeight: 700, marginBottom: 4, fontSize: 11, color: '#0c4a6e' }}>
                        📐 แพทเทิร์นการตั้งชื่อไฟล์:
                    </div>
                    {docType && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
                            <span style={{ background: '#fef3c7', color: '#92400e', padding: '2px 8px', borderRadius: 4, fontWeight: 600, border: '1px solid #fde68a' }}>ประเภทเอกสาร</span>
                            <span style={{ color: '#94a3b8', fontWeight: 700 }}>-</span>
                            <span style={{ background: '#dbeafe', color: '#1e40af', padding: '2px 8px', borderRadius: 4, fontWeight: 600, border: '1px solid #93c5fd' }}>โค้ดบันทึกบัญชี</span>
                            <span style={{ color: '#94a3b8', fontWeight: 700 }}>_</span>
                            <span style={{ background: '#fff7ed', color: '#c2410c', padding: '2px 8px', borderRadius: 4, fontWeight: 600, border: '1px solid #fdba74' }}>ยอดเงิน</span>
                            <span style={{ color: '#94a3b8', fontWeight: 700 }}>-</span>
                            <span style={{ background: '#dcfce7', color: '#166534', padding: '2px 8px', borderRadius: 4, fontWeight: 600, border: '1px solid #86efac' }}>ชื่อไฟล์เดิม</span>
                            <span style={{ color: '#94a3b8', fontWeight: 700 }}>-</span>
                            <span style={{ background: '#fce7f3', color: '#9d174d', padding: '2px 8px', borderRadius: 4, fontWeight: 600, border: '1px solid #f9a8d4' }}>โค้ดตัดชำระเงิน</span>
                        </div>
                    )}
                    {!docType && (
                        <div style={{ color: '#64748b', fontStyle: 'italic' }}>
                            กรุณาเลือกประเภทเอกสารเพื่อดูแพทเทิร์น
                        </div>
                    )}
                </div>
            </div>

            {/* ── Code Change Confirm Modal ── */}
            {confirmModal && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,.45)', backdropFilter: 'blur(4px)',
                    zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    animation: 'fadeIn .2s ease'
                }} onClick={() => { confirmModal.resolve(false); setConfirmModal(null) }}>
                    <div onClick={e => e.stopPropagation()} style={{
                        background: '#fff', borderRadius: 16, width: 420, maxWidth: '90vw',
                        boxShadow: '0 20px 60px rgba(0,0,0,.25), 0 0 0 1px rgba(255,255,255,.1)',
                        animation: 'slideUp .25s ease', overflow: 'hidden'
                    }}>
                        {/* Header */}
                        <div style={{
                            background: 'linear-gradient(135deg, #ff9800, #f57c00)',
                            padding: '18px 24px', color: '#fff',
                            display: 'flex', alignItems: 'center', gap: 10
                        }}>
                            <span style={{ fontSize: 24 }}>⚠️</span>
                            <div>
                                <div style={{ fontWeight: 700, fontSize: 15 }}>ตรวจพบการเปลี่ยนแปลงโค้ด</div>
                                <div style={{ fontSize: 11, opacity: .85 }}>โค้ดไม่ตรงกับข้อมูลเดิมในฐานข้อมูล</div>
                            </div>
                        </div>

                        {/* Body */}
                        <div style={{ padding: '16px 24px' }}>
                            {confirmModal.changes.map((change, idx) => (
                                <div key={idx} style={{
                                    background: '#f8f9fb', borderRadius: 12, padding: 14,
                                    marginBottom: idx < confirmModal.changes.length - 1 ? 12 : 0,
                                    border: '1px solid #e8ecf1'
                                }}>
                                    <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10, color: '#334155', display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <span>{change.icon}</span> {change.label}
                                    </div>

                                    {/* Old codes */}
                                    <div style={{ marginBottom: 8 }}>
                                        <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, marginBottom: 4, textTransform: 'uppercase', letterSpacing: .5 }}>เดิม</div>
                                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                            {change.oldCodes.length > 0 ? change.oldCodes.map((c, i) => (
                                                <span key={i} style={{
                                                    background: '#fee2e2', color: '#dc2626', padding: '4px 10px',
                                                    borderRadius: 6, fontSize: 12, fontWeight: 600, fontFamily: 'monospace',
                                                    border: '1px solid #fca5a5', textDecoration: 'line-through'
                                                }}>{c}</span>
                                            )) : <span style={{ color: '#94a3b8', fontSize: 11 }}>(ว่าง)</span>}
                                        </div>
                                    </div>

                                    {/* Arrow */}
                                    <div style={{ textAlign: 'center', margin: '4px 0', fontSize: 14, color: '#94a3b8' }}>↓</div>

                                    {/* New codes */}
                                    <div>
                                        <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, marginBottom: 4, textTransform: 'uppercase', letterSpacing: .5 }}>ใหม่</div>
                                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                            {change.newCodes.length > 0 ? change.newCodes.map((c, i) => (
                                                <span key={i} style={{
                                                    background: '#dcfce7', color: '#16a34a', padding: '4px 10px',
                                                    borderRadius: 6, fontSize: 12, fontWeight: 600, fontFamily: 'monospace',
                                                    border: '1px solid #86efac'
                                                }}>{c}</span>
                                            )) : <span style={{ color: '#94a3b8', fontSize: 11 }}>(ว่าง)</span>}
                                        </div>
                                    </div>
                                </div>
                            ))}

                            <div style={{
                                marginTop: 14, padding: '10px 14px', background: '#fffbeb',
                                borderRadius: 8, fontSize: 11, color: '#92400e', lineHeight: 1.5,
                                border: '1px solid #fde68a'
                            }}>
                                💡 ต้องการอัพเดทโค้ดในฐานข้อมูลให้ตรงกับค่าใหม่หรือไม่?
                            </div>
                        </div>

                        {/* Footer */}
                        <div style={{
                            padding: '14px 24px', display: 'flex', gap: 10, justifyContent: 'flex-end',
                            borderTop: '1px solid #f1f5f9', background: '#fafbfc'
                        }}>
                            <button
                                onClick={() => { confirmModal.resolve(false); setConfirmModal(null) }}
                                style={{
                                    padding: '9px 20px', borderRadius: 8, border: '1px solid #d1d5db',
                                    background: '#fff', color: '#64748b', fontSize: 13, fontWeight: 600,
                                    cursor: 'pointer', transition: 'all .15s'
                                }}
                                onMouseEnter={e => { e.target.style.background = '#f1f5f9' }}
                                onMouseLeave={e => { e.target.style.background = '#fff' }}
                            >ข้ามไป</button>
                            <button
                                onClick={() => { confirmModal.resolve(true); setConfirmModal(null) }}
                                style={{
                                    padding: '9px 20px', borderRadius: 8, border: 'none',
                                    background: 'linear-gradient(135deg, #f97316, #ea580c)',
                                    color: '#fff', fontSize: 13, fontWeight: 700,
                                    cursor: 'pointer', transition: 'all .15s',
                                    boxShadow: '0 2px 8px rgba(249,115,22,.35)'
                                }}
                                onMouseEnter={e => { e.target.style.transform = 'translateY(-1px)'; e.target.style.boxShadow = '0 4px 12px rgba(249,115,22,.45)' }}
                                onMouseLeave={e => { e.target.style.transform = ''; e.target.style.boxShadow = '0 2px 8px rgba(249,115,22,.35)' }}
                            >✅ อัพเดทในฐานข้อมูล</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
})

// Extract group code from path (e.g. Build000 from V:\...\Build000 ทดสอบระบบ\...)
function extractGroupCode(pathStr) {
    if (!pathStr) return ''
    const parts = pathStr.replace(/\\/g, '/').split('/')
    for (const part of parts) {
        const match = part.match(/^(Build\d+)/i)
        if (match) return match[1]
    }
    return ''
}

// ══════════════════════════════════════════════
// ── Main ManagePage ──
// ══════════════════════════════════════════════
export default function ManagePage() {
    const renameFormRef = useRef(null)
    const batchFormRef = useRef(null)
    const [currentPath, setCurrentPath] = useState('')
    const [items, setItems] = useState([])
    const [folders, setFolders] = useState([])
    const [selectedFile, setSelectedFile] = useState(null)
    const [pdfInfo, setPdfInfo] = useState(null)
    const [textContent, setTextContent] = useState('')
    const [zoomLevel, setZoomLevel] = useState(1)
    const [lightbox, setLightbox] = useState(false)
    const [isDragging, setIsDragging] = useState(false)
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
    const previewContainerRef = useRef(null)
    const [moveTarget, setMoveTarget] = useState('')
    const [loading, setLoading] = useState(false)
    const [pathInput, setPathInput] = useState('')
    const [renameProcessing, setRenameProcessing] = useState(false)
    const [processingMsg, setProcessingMsg] = useState('')  // overlay message
    const [showConsolidate, setShowConsolidate] = useState(false)  // consolidate popup
    const [archiveConfirm, setArchiveConfirm] = useState(null)  // { filePath, fileName }
    const [showBackupModal, setShowBackupModal] = useState(false)
    const [backupSelection, setBackupSelection] = useState([])  // array of file names

    // Tab state: 'single' or 'batch'
    const [activeTab, setActiveTab] = useState('single')

    // Single rename form data
    const [renameData, setRenameData] = useState({
        companyName: '', docType: '', whtExpenseType: '', whtSubType: '',
        whtPercent: '', whtAmount: '', pp36Amount: '',
        vatAmount: '', noneVatAmount: '',
        accountCodes: [{ code: '', description: '' }],
        paymentCodes: [{ code: '', description: '' }],
        originalName: ''
    })
    const [initialCodes, setInitialCodes] = useState(null)

    // Batch mode state
    const [batchSelected, setBatchSelected] = useState([]) // selected file paths
    const [batchFieldSelection, setBatchFieldSelection] = useState({
        docType: true,
        accountCodes: true,
        accountDesc: true,
        paymentCodes: true,
        paymentDesc: true
    })
    const [batchData, setBatchData] = useState({
        companyName: '', docType: '', whtExpenseType: '', whtSubType: '',
        whtPercent: '', whtAmount: '', pp36Amount: '',
        vatAmount: '', noneVatAmount: '',
        accountCodes: [{ code: '', description: '' }],
        paymentCodes: [{ code: '', description: '' }],
        originalName: ''
    })
    const [noResetForm, setNoResetForm] = useState(false)

    // ── Resizable columns ──
    const STORAGE_KEY = 'manage-col-widths'
    const getInitialWidths = () => {
        try {
            const saved = localStorage.getItem(STORAGE_KEY)
            if (saved) return JSON.parse(saved)
        } catch { }
        return { col1: 240, col2: 360 }  // defaults; col3 fills remaining
    }
    const [colWidths, setColWidths] = useState(getInitialWidths)
    const resizingRef = useRef(null)       // { col: 1|2, startX, startWidth }
    const containerRef = useRef(null)

    const onResizeStart = useCallback((col, e) => {
        e.preventDefault()
        const startX = e.clientX
        const startWidth = col === 1 ? colWidths.col1 : colWidths.col2
        resizingRef.current = { col, startX, startWidth }
        document.body.style.cursor = 'col-resize'
        document.body.style.userSelect = 'none'
    }, [colWidths])

    useEffect(() => {
        const onMove = (e) => {
            if (!resizingRef.current) return
            const { col, startX, startWidth } = resizingRef.current
            const delta = e.clientX - startX
            setColWidths(prev => {
                const maxW = Math.round(window.innerWidth * 0.5)
                const newW = Math.max(160, Math.min(maxW, startWidth + delta))
                return col === 1 ? { ...prev, col1: newW } : { ...prev, col2: newW }
            })
        }
        const onUp = () => {
            if (!resizingRef.current) return
            resizingRef.current = null
            document.body.style.cursor = ''
            document.body.style.userSelect = ''
            setColWidths(prev => {
                try { localStorage.setItem(STORAGE_KEY, JSON.stringify(prev)) } catch { }
                return prev
            })
        }
        window.addEventListener('mousemove', onMove)
        window.addEventListener('mouseup', onUp)
        return () => {
            window.removeEventListener('mousemove', onMove)
            window.removeEventListener('mouseup', onUp)
        }
    }, [])

    // Load initial path
    useEffect(() => {
        const saved = localStorage.getItem('lastPath')
        if (saved) {
            loadDirectory(saved)
        }
    }, [])

    const loadDirectory = async (dirPath) => {
        setLoading(true)
        try {
            const res = await browseDirectory(dirPath)
            setCurrentPath(res.data.currentPath)
            setPathInput(res.data.currentPath)
            localStorage.setItem('lastPath', res.data.currentPath)

            const allItems = res.data.items
            setFolders(allItems.filter(i => i.isDirectory))
            setItems(allItems)
            setSelectedFile(null)
            setPdfInfo(null)
            setBatchSelected([])
        } catch (err) {
            toast.error(err.response?.data?.error || 'ไม่สามารถเปิดโฟลเดอร์ได้')
        } finally {
            setLoading(false)
        }
    }

    const handleBrowse = () => {
        if (pathInput.trim()) loadDirectory(pathInput.trim())
    }

    const handleSelectFile = async (item) => {
        if (item.isDirectory) {
            loadDirectory(item.path)
            return
        }
        setSelectedFile(item)
        setPdfInfo(null)
        setTextContent('')
        setZoomLevel(1)
        setLightbox(false)

        // Pre-fill original name (without extension)
        const nameWithoutExt = item.name.replace(/\.[^.]+$/, '')
        setRenameData(prev => ({ ...prev, originalName: nameWithoutExt }))

        // Store initial codes for warning
        if (!initialCodes) {
            setInitialCodes({
                accountCodes: [{ code: '', description: '' }],
                paymentCodes: [{ code: '', description: '' }]
            })
        }

        if (item.isPdf) {
            try {
                const res = await getPdfInfo(item.path)
                setPdfInfo(res.data)
            } catch { setPdfInfo(null) }
        } else if (item.fileType === 'text') {
            try {
                const res = await getFileContent(item.path)
                setTextContent(typeof res.data === 'string' ? res.data : JSON.stringify(res.data, null, 2))
            } catch { setTextContent('ไม่สามารถอ่านไฟล์ได้') }
        }
    }

    const handleMove = async () => {
        if (!selectedFile || !moveTarget) return
        try {
            await moveFile(selectedFile.path, moveTarget)
            toast.success('ย้ายไฟล์สำเร็จ')
            loadDirectory(currentPath)
        } catch (err) {
            toast.error(err.response?.data?.error || 'เกิดข้อผิดพลาด')
        }
    }

    // ── Archive unused file ──
    const handleArchiveFile = (e, filePath, fileName) => {
        e.stopPropagation()
        setArchiveConfirm({ filePath, fileName })
    }

    const executeArchive = async () => {
        if (!archiveConfirm) return
        const { filePath, fileName } = archiveConfirm
        setArchiveConfirm(null)
        try {
            const archiveDir = currentPath + '\\เอกสารไม่ได้ใช้งาน'
            await moveFile(filePath, archiveDir)
            toast.success(`ย้าย "${fileName}" ไปเก็บแล้ว`)
            if (selectedFile?.path === filePath) setSelectedFile(null)
            loadDirectory(currentPath)
        } catch (err) {
            toast.error(err.response?.data?.error || 'ไม่สามารถย้ายไฟล์ได้')
        }
    }

    const goUp = () => {
        const parent = currentPath.replace(/\\[^\\]+$/, '')
        if (parent && parent !== currentPath) loadDirectory(parent)
    }

    const handleSingleRename = async () => {
        if (!selectedFile) return
        if (!renameData.docType) {
            toast.error('กรุณาเลือกประเภทเอกสาร')
            return
        }
        setRenameProcessing(true)
        try {
            const res = await executeRename({
                filePath: selectedFile.path,
                ...renameData
            })
            toast.success(res.data.message)
            logUsage({ page: 'manage', path_used: currentPath, action: 'rename' })

            // Check if company codes changed from DB → prompt update
            if (renameFormRef.current?.checkAndUpdateCompanyCodes) {
                await renameFormRef.current.checkAndUpdateCompanyCodes()
            }

            // Save initial codes after first submit
            setInitialCodes({
                accountCodes: [...renameData.accountCodes],
                paymentCodes: [...renameData.paymentCodes]
            })

            if (noResetForm) {
                // Partial reset: only clear % and amount
                setRenameData(prev => ({ ...prev, whtPercent: '', whtAmount: '' }))
                // Soft refresh: reload file list but keep form open
                try {
                    const dirRes = await browseDirectory(currentPath)
                    const allItems = dirRes.data.items
                    setFolders(allItems.filter(i => i.isDirectory))
                    setItems(allItems)
                    // Don't clear selectedFile or pdfInfo — keep form visible
                } catch { }
            } else {
                loadDirectory(currentPath)
            }
        } catch (err) {
            toast.error(err.response?.data?.error || 'เกิดข้อผิดพลาด')
        } finally {
            setRenameProcessing(false)
        }
    }

    // ── Batch toggle file selection ──
    const toggleBatchFile = (filePath) => {
        setBatchSelected(prev =>
            prev.includes(filePath) ? prev.filter(p => p !== filePath) : [...prev, filePath]
        )
    }

    const selectAllFiles = () => {
        const allFilePaths = files.map(f => f.path)
        setBatchSelected(allFilePaths)
    }

    const deselectAllFiles = () => {
        setBatchSelected([])
    }

    const toggleBatchField = (field) => {
        setBatchFieldSelection(prev => ({ ...prev, [field]: !prev[field] }))
    }

    const selectAllFields = () => {
        setBatchFieldSelection({
            docType: true, accountCodes: true, accountDesc: true,
            paymentCodes: true, paymentDesc: true
        })
    }

    const deselectAllFields = () => {
        setBatchFieldSelection({
            docType: false, accountCodes: false, accountDesc: false,
            paymentCodes: false, paymentDesc: false
        })
    }

    // ── Batch Rename Execute ──
    const handleBatchRename = async () => {
        if (batchSelected.length === 0) {
            toast.error('กรุณาเลือกไฟล์อย่างน้อย 1 ไฟล์')
            return
        }
        if (batchFieldSelection.docType && !batchData.docType) {
            toast.error('กรุณาเลือกประเภทเอกสาร')
            return
        }
        setRenameProcessing(true)
        try {
            const filesPayload = batchSelected.map(fp => {
                const file = files.find(f => f.path === fp)
                const nameWithoutExt = file ? file.name.replace(/\.[^.]+$/, '') : ''

                return {
                    filePath: fp,
                    companyName: batchData.companyName,
                    docType: batchFieldSelection.docType ? batchData.docType : 'None_Vat',
                    whtSubType: batchFieldSelection.docType ? batchData.whtSubType : '',
                    whtExpenseType: batchFieldSelection.docType ? batchData.whtExpenseType : '',
                    whtPercent: batchFieldSelection.docType ? batchData.whtPercent : '',
                    whtAmount: batchFieldSelection.docType ? batchData.whtAmount : '',
                    accountCodes: batchFieldSelection.accountCodes ? batchData.accountCodes : [{ code: '', description: '' }],
                    paymentCodes: batchFieldSelection.paymentCodes ? batchData.paymentCodes : [{ code: '', description: '' }],
                    originalName: nameWithoutExt
                }
            })

            const res = await executeBatchRename({ files: filesPayload })
            toast.success(res.data.message)
            logUsage({ page: 'manage', path_used: currentPath, action: 'batch_rename' })

            // Check if company codes changed from DB → prompt update
            if (batchFormRef.current?.checkAndUpdateCompanyCodes) {
                await batchFormRef.current.checkAndUpdateCompanyCodes()
            }

            if (res.data.errors?.length > 0) {
                toast.error(`${res.data.errors.length} ไฟล์มีปัญหา`)
            }

            loadDirectory(currentPath)
            setBatchSelected([])
        } catch (err) {
            toast.error(err.response?.data?.error || 'เกิดข้อผิดพลาด')
        } finally {
            setRenameProcessing(false)
        }
    }

    const files = items.filter(i => !i.isDirectory)
    const token = 'bypass';

    return (
        <div className="app-layout">
            <Sidebar active="manage" />
            <main className="main-content">
                <div className="page-header animate-in">
                    <div className="breadcrumb">หน้าหลัก / คัดแยกเอกสาร / จัดการไฟล์</div>
                    <h1>📁 จัดการไฟล์</h1>
                    <p>พรีวิว เปลี่ยนชื่อ และย้ายไฟล์ PDF</p>
                </div>

                {/* Folder Picker */}
                <div className="folder-picker animate-in" style={{ animationDelay: '.05s', position: 'relative', zIndex: 10 }}>
                    <div className="picker-row">
                        <span className="picker-label">📂 ที่อยู่โฟลเดอร์ทำงาน</span>
                        <div style={{ display: 'flex', gap: 6 }}>
                            <button className="browse-btn" onClick={handleBrowse}>📂 เปิดโฟลเดอร์</button>
                            {currentPath && (
                                <button className="browse-btn" style={{ background: '#fff3e0', color: '#e65100', border: '1px solid #ffcc80' }}
                                    disabled={!!processingMsg}
                                    onClick={() => {
                                        // Open modal with all non-directory files checked
                                        const skipFolders = ['ต้นฉบับ', 'WHT', 'VAT', 'None_Vat']
                                        const fileItems = items.filter(i => !i.isDirectory || !skipFolders.includes(i.name))
                                        setBackupSelection(fileItems.map(i => i.name))
                                        setShowBackupModal(true)
                                    }}>💾 สำรองต้นฉบับ</button>
                            )}
                            {currentPath && (
                                <div style={{ position: 'relative' }}>
                                    <button className="browse-btn" style={{ background: '#e8f5e9', color: '#2e7d32', border: '1px solid #a5d6a7' }}
                                        disabled={!!processingMsg}
                                        onClick={() => setShowConsolidate(v => !v)}>📦 รวมเอกสาร</button>
                                    {showConsolidate && (
                                        <div style={{
                                            position: 'absolute', top: '100%', right: 0, marginTop: 6,
                                            background: '#fff', borderRadius: 10, padding: 16,
                                            boxShadow: '0 8px 32px rgba(0,0,0,.18)', border: '1px solid #e0e0e0',
                                            zIndex: 1000, minWidth: 260
                                        }}>
                                            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, color: '#1a1a2e' }}>📦 เลือกระดับการสแกน</div>
                                            <div style={{ fontSize: 11, color: '#888', marginBottom: 12 }}>ย้ายไฟล์จากโฟลเดอร์ WHT/VAT/None_Vat มารวมกัน</div>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                                <button className="btn-accent" style={{ fontSize: 12, padding: '8px 14px', justifyContent: 'center' }}
                                                    onClick={async () => {
                                                        setShowConsolidate(false)
                                                        setProcessingMsg('📦 กำลังรวมเอกสาร (1 ชั้น)...')
                                                        try {
                                                            const res = await consolidateFiles(currentPath, false)
                                                            toast.success(`${res.data.message} (ข้าม ${res.data.skipped})`)
                                                            loadDirectory(currentPath)
                                                        } catch (err) {
                                                            toast.error(err.response?.data?.error || 'เกิดข้อผิดพลาด')
                                                        } finally { setProcessingMsg('') }
                                                    }}>📂 สแกน 1 ชั้น (เฉพาะโฟลเดอร์ลูกตรง)</button>
                                                <button className="btn-accent" style={{ fontSize: 12, padding: '8px 14px', justifyContent: 'center', background: 'linear-gradient(135deg, #43a047, #2e7d32)' }}
                                                    onClick={async () => {
                                                        setShowConsolidate(false)
                                                        setProcessingMsg('📦 กำลังรวมเอกสาร (ทุกชั้น)...')
                                                        try {
                                                            const res = await consolidateFiles(currentPath, true)
                                                            toast.success(`${res.data.message} (ข้าม ${res.data.skipped})`)
                                                            loadDirectory(currentPath)
                                                        } catch (err) {
                                                            toast.error(err.response?.data?.error || 'เกิดข้อผิดพลาด')
                                                        } finally { setProcessingMsg('') }
                                                    }}>🔍 สแกนลึกทุกชั้น (recursive)</button>
                                            </div>
                                            <button onClick={() => setShowConsolidate(false)} style={{
                                                marginTop: 8, fontSize: 11, color: '#999', background: 'none', border: 'none',
                                                cursor: 'pointer', width: '100%', textAlign: 'center', padding: 4
                                            }}>✕ ปิด</button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <input className="form-input" value={pathInput} onChange={e => setPathInput(e.target.value)}
                            placeholder="เช่น C:\Documents\PDF" onKeyDown={e => e.key === 'Enter' && handleBrowse()}
                            style={{ flex: 1, fontSize: 13 }} />
                    </div>
                </div>

                {currentPath && (
                    <div ref={containerRef} style={{ display: 'flex', gap: 0, alignItems: 'stretch', minHeight: 'calc(100vh - 200px)' }} className="animate-in" >
                        {/* ═══ Column 1: Folders + File List ═══ */}
                        <div style={{ width: colWidths.col1, minWidth: 160, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
                            {/* Folders */}
                            <div className="card">
                                <div className="card-header" style={{ padding: '10px 14px' }}><h3 style={{ fontSize: 13 }}>📂 โฟลเดอร์</h3></div>
                                <div style={{ padding: 6, maxHeight: 140, overflowY: 'auto' }}>
                                    <button className="folder-item" onClick={goUp} style={{ padding: '5px 10px', fontSize: 12 }}>⬆️ ..</button>
                                    {folders.map(f => (
                                        <button key={f.path} className="folder-item" onClick={() => loadDirectory(f.path)} style={{ padding: '5px 10px', fontSize: 12 }}>
                                            📁 {f.name}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* File List */}
                            <div className="card" style={{ flex: 1 }}>
                                <div className="card-header" style={{ padding: '10px 14px' }}>
                                    <h3 style={{ fontSize: 13 }}>ไฟล์</h3>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{files.length} ไฟล์</span>
                                        {activeTab === 'batch' && files.length > 0 && (
                                            <div style={{ display: 'flex', gap: 4 }}>
                                                <button className="mini-btn" onClick={selectAllFiles}>เลือกทั้งหมด</button>
                                                <button className="mini-btn" onClick={deselectAllFiles}>ยกเลิก</button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <div style={{ maxHeight: 'calc(100vh - 340px)', overflowY: 'auto' }}>
                                    {loading && <p style={{ padding: 12, textAlign: 'center', color: '#999', fontSize: 12 }}>กำลังโหลด...</p>}
                                    {!loading && files.length === 0 && <p style={{ padding: 12, textAlign: 'center', color: '#999', fontSize: 12 }}>ไม่มีไฟล์</p>}
                                    {files.map(item => (
                                        <div key={item.path}
                                            className={`file-list-item ${selectedFile?.path === item.path ? 'selected' : ''} ${batchSelected.includes(item.path) ? 'batch-selected' : ''}`}
                                            onClick={() => { if (activeTab === 'batch') { toggleBatchFile(item.path); handleSelectFile(item) } else { handleSelectFile(item) } }}
                                            style={{ padding: '8px 12px', gap: 8 }}>
                                            {activeTab === 'batch' && (
                                                <input type="checkbox" checked={batchSelected.includes(item.path)}
                                                    onChange={() => toggleBatchFile(item.path)}
                                                    style={{ marginRight: 4, accentColor: 'var(--accent)' }}
                                                    onClick={e => e.stopPropagation()} />
                                            )}
                                            <div className="file-icon" style={{ width: 30, height: 30, fontSize: 14, borderRadius: 7, ...(item.isPdf ? {} : { background: '#f0f9ff', color: '#3b82f6' }) }}>
                                                {FILE_TYPE_ICONS[item.fileType] || '📎'}
                                            </div>
                                            <div className="file-info" style={{ flex: 1 }}>
                                                <div className="file-name" style={{ fontSize: 12 }}>{item.name}</div>
                                                <div className="file-meta" style={{ fontSize: 10 }}>
                                                    {formatSize(item.size)} · {formatDate(item.modified)}
                                                </div>
                                            </div>
                                            {!currentPath.includes('เอกสารไม่ได้ใช้งาน') && (
                                                <button
                                                    onClick={(e) => handleArchiveFile(e, item.path, item.name)}
                                                    title="ย้ายไปเอกสารไม่ได้ใช้งาน"
                                                    style={{
                                                        width: 26, height: 26, borderRadius: 6,
                                                        border: '1px solid #fecaca', background: '#fef2f2',
                                                        color: '#ef4444', cursor: 'pointer', fontSize: 12,
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        flexShrink: 0, transition: 'all .15s'
                                                    }}
                                                    onMouseEnter={e => { e.currentTarget.style.background = '#ef4444'; e.currentTarget.style.color = '#fff' }}
                                                    onMouseLeave={e => { e.currentTarget.style.background = '#fef2f2'; e.currentTarget.style.color = '#ef4444' }}
                                                >🗑</button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* ── Resize Handle 1 ── */}
                        <div className="col-resize-handle" onMouseDown={(e) => onResizeStart(1, e)} />

                        {/* ═══ Column 2: Rename/Batch Tabs + Form ═══ */}
                        <div style={{ width: colWidths.col2, minWidth: 160, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
                            <div className="card">
                                {/* Tab Navigation */}
                                <div className="rename-tabs">
                                    <button className={`rename-tab ${activeTab === 'single' ? 'active' : ''}`}
                                        onClick={() => setActiveTab('single')}>
                                        ✏️ เปลี่ยนชื่อ
                                    </button>
                                    <button className={`rename-tab ${activeTab === 'batch' ? 'active' : ''}`}
                                        onClick={() => setActiveTab('batch')}>
                                        📦 โหมดชุด
                                    </button>
                                </div>

                                <div className="card-body" style={{ padding: 14, maxHeight: 'calc(100vh - 280px)', overflowY: 'auto' }}>
                                    {/* ── Tab 1: Single Rename ── */}
                                    {activeTab === 'single' && (
                                        <div>
                                            {!selectedFile ? (
                                                <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-secondary)' }}>
                                                    <div style={{ fontSize: 32, marginBottom: 8 }}>📄</div>
                                                    <div style={{ fontSize: 13 }}>เลือกไฟล์จากรายการทางซ้าย</div>
                                                </div>
                                            ) : (
                                                <>
                                                    <div style={{ marginBottom: 12, padding: '8px 12px', background: '#f8f9fb', borderRadius: 8, fontSize: 11 }}>
                                                        <strong>ไฟล์เดิม:</strong> {selectedFile.name}
                                                    </div>
                                                    <RenameForm
                                                        ref={renameFormRef}
                                                        data={renameData}
                                                        onChange={setRenameData}
                                                        initialCodes={initialCodes}
                                                        mode="single"
                                                        groupCode={extractGroupCode(currentPath)}
                                                    />
                                                    <button className="btn-accent"
                                                        style={{ width: '100%', justifyContent: 'center', fontSize: 12, padding: 10, marginTop: 12 }}
                                                        onClick={handleSingleRename}
                                                        disabled={renameProcessing || !renameData.docType}>
                                                        {renameProcessing ? '⏳ กำลังดำเนินการ...' : '✏️ เปลี่ยนชื่อ + สร้าง PDF'}
                                                    </button>

                                                    {/* Toggle: ไม่ต้องรีเซ็ตข้อมูล */}
                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 10 }}>
                                                        <div
                                                            onClick={() => setNoResetForm(v => !v)}
                                                            style={{
                                                                width: 38, height: 20, borderRadius: 10,
                                                                background: noResetForm ? 'var(--accent)' : '#ccc',
                                                                position: 'relative', cursor: 'pointer',
                                                                transition: 'background .2s'
                                                            }}>
                                                            <div style={{
                                                                width: 16, height: 16, borderRadius: '50%',
                                                                background: '#fff', position: 'absolute',
                                                                top: 2, left: noResetForm ? 20 : 2,
                                                                transition: 'left .2s',
                                                                boxShadow: '0 1px 3px rgba(0,0,0,.2)'
                                                            }} />
                                                        </div>
                                                        <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>ไม่ต้องรีเซ็ตข้อมูล</span>
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    )}

                                    {/* ── Tab 2: Batch Mode ── */}
                                    {activeTab === 'batch' && (
                                        <div>
                                            {/* Batch file count */}
                                            <div style={{ marginBottom: 12, padding: '8px 12px', background: '#f8f9fb', borderRadius: 8, fontSize: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span>📋 เลือกแล้ว <strong>{batchSelected.length}</strong> ไฟล์ จาก {files.length} ไฟล์</span>
                                            </div>

                                            {/* Field selection */}
                                            <div className="batch-field-selector">
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                                    <label className="form-label-sm" style={{ margin: 0 }}>🎯 เลือกฟิลด์</label>
                                                    <div style={{ display: 'flex', gap: 4 }}>
                                                        <button className="mini-btn" onClick={selectAllFields}>ทั้งหมด</button>
                                                        <button className="mini-btn" onClick={deselectAllFields}>ยกเลิก</button>
                                                    </div>
                                                </div>
                                                <div className="field-toggle-list">
                                                    {[
                                                        { key: 'docType', label: '📋 ประเภทเอกสาร' },
                                                        { key: 'accountCodes', label: '📊 โค้ดบัญชี' },
                                                        { key: 'accountDesc', label: '📝 คำอธิบายโค้ดบัญชี' },
                                                        { key: 'paymentCodes', label: '💳 โค้ดชำระเงิน' },
                                                        { key: 'paymentDesc', label: '📝 คำอธิบายชำระเงิน' },
                                                    ].map(f => (
                                                        <label key={f.key} className={`field-toggle ${batchFieldSelection[f.key] ? 'checked' : ''}`}>
                                                            <input type="checkbox" checked={batchFieldSelection[f.key]}
                                                                onChange={() => toggleBatchField(f.key)} />
                                                            <span>{f.label}</span>
                                                        </label>
                                                    ))}
                                                </div>
                                            </div>

                                            {/* Rename Form (shared) */}
                                            <div style={{ marginTop: 12 }}>
                                                <RenameForm
                                                    ref={batchFormRef}
                                                    data={batchData}
                                                    onChange={setBatchData}
                                                    initialCodes={null}
                                                    mode="batch"
                                                    groupCode={extractGroupCode(currentPath)}
                                                />
                                            </div>

                                            <button className="btn-accent"
                                                style={{ width: '100%', justifyContent: 'center', fontSize: 12, padding: 10, marginTop: 12 }}
                                                onClick={handleBatchRename}
                                                disabled={renameProcessing || batchSelected.length === 0}>
                                                {renameProcessing
                                                    ? '⏳ กำลังดำเนินการ...'
                                                    : `📦 เปลี่ยนชื่อ (${batchSelected.length} ไฟล์)`}
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>


                        </div>

                        {/* ── Resize Handle 2 ── */}
                        <div className="col-resize-handle" onMouseDown={(e) => onResizeStart(2, e)} />

                        {/* ═══ Column 3: Preview (fills remaining) ═══ */}
                        <div style={{ flex: 1, minWidth: 280, position: 'sticky', top: 16 }}>
                            <div className="card">
                                <div className="card-header" style={{ padding: '10px 16px' }}>
                                    <h3 style={{ fontSize: 14 }}>👁️ พรีวิว</h3>
                                    {pdfInfo && <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{pdfInfo.pageCount} หน้า</span>}
                                </div>
                                <div style={{ padding: 8 }}>
                                    <div className="preview-area" style={{ minHeight: 'calc(100vh - 280px)' }}>
                                        {!selectedFile ? (
                                            <div className="placeholder">
                                                <div className="icon">📄</div>
                                                <div style={{ fontSize: 14, fontWeight: 600 }}>เลือกไฟล์เพื่อพรีวิว</div>
                                            </div>
                                        ) : selectedFile.fileType === 'pdf' ? (
                                            <iframe
                                                src={`/api/files/preview?path=${encodeURIComponent(selectedFile.path)}&token=${token}#pagemode=none`}
                                                style={{ width: '100%', height: 'calc(100vh - 290px)', border: 'none' }}
                                                title="PDF Preview"
                                            />
                                        ) : selectedFile.fileType === 'image' ? (
                                            <div style={{ position: 'relative' }}>
                                                <div style={{ position: 'absolute', top: 8, right: 8, zIndex: 2, display: 'flex', gap: 4 }}>
                                                    <button onClick={() => setZoomLevel(z => Math.max(0.1, z - 0.1))}
                                                        style={{ width: 32, height: 32, borderRadius: 8, border: 'none', background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                                        title="ซูมออก">−</button>
                                                    <span style={{ minWidth: 48, height: 32, borderRadius: 8, background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                        {Math.round(zoomLevel * 100)}%
                                                    </span>
                                                    <button onClick={() => setZoomLevel(z => Math.min(5, z + 0.1))}
                                                        style={{ width: 32, height: 32, borderRadius: 8, border: 'none', background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                                        title="ซูมเข้า">+</button>
                                                    <button onClick={() => setZoomLevel(1)}
                                                        style={{ width: 32, height: 32, borderRadius: 8, border: 'none', background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                                        title="รีเซ็ต">↺</button>
                                                    <button onClick={() => setLightbox(true)}
                                                        style={{ width: 32, height: 32, borderRadius: 8, border: 'none', background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                                        title="เต็มจอ">⛶</button>
                                                </div>
                                                <div
                                                    ref={previewContainerRef}
                                                    style={{ overflow: 'auto', maxHeight: 'calc(100vh - 300px)', minHeight: 300, borderRadius: 8, background: '#f8fafc', cursor: isDragging ? 'grabbing' : (zoomLevel > 1 ? 'grab' : 'default'), ...(zoomLevel <= 1 ? { display: 'flex', alignItems: 'center', justifyContent: 'center' } : {}) }}
                                                    onWheel={e => { e.preventDefault(); setZoomLevel(z => Math.min(5, Math.max(0.1, z + (e.deltaY < 0 ? 0.1 : -0.1)))) }}
                                                    onMouseDown={e => {
                                                        if (e.button !== 0 || zoomLevel <= 1) return
                                                        e.preventDefault()
                                                        setIsDragging(true)
                                                        setDragStart({ x: e.clientX + e.currentTarget.scrollLeft, y: e.clientY + e.currentTarget.scrollTop })
                                                    }}
                                                    onMouseMove={e => {
                                                        if (!isDragging) return
                                                        e.currentTarget.scrollLeft = dragStart.x - e.clientX
                                                        e.currentTarget.scrollTop = dragStart.y - e.clientY
                                                    }}
                                                    onMouseUp={() => setIsDragging(false)}
                                                    onMouseLeave={() => setIsDragging(false)}
                                                >
                                                    <img
                                                        src={`/api/files/preview?path=${encodeURIComponent(selectedFile.path)}&token=${token}`}
                                                        alt={selectedFile.name}
                                                        draggable={false}
                                                        style={zoomLevel <= 1
                                                            ? { width: '100%', maxHeight: '100%', display: 'block', objectFit: 'contain', borderRadius: 8, transition: isDragging ? 'none' : 'all 0.15s ease', userSelect: 'none' }
                                                            : { width: `${zoomLevel * 100}%`, display: 'block', objectFit: 'contain', borderRadius: 8, transition: isDragging ? 'none' : 'width 0.15s ease', userSelect: 'none', flexShrink: 0 }
                                                        }
                                                    />
                                                </div>
                                            </div>
                                        ) : selectedFile.fileType === 'text' ? (
                                            <pre style={{
                                                width: '100%', height: 'calc(100vh - 300px)', overflow: 'auto', margin: 0,
                                                padding: 16, fontSize: 12, lineHeight: 1.6,
                                                fontFamily: "'Consolas', 'Monaco', 'Courier New', monospace",
                                                background: '#1e1e2e', color: '#cdd6f4', borderRadius: 8,
                                                whiteSpace: 'pre-wrap', wordBreak: 'break-word'
                                            }}>
                                                {textContent || 'กำลังโหลด...'}
                                            </pre>
                                        ) : (
                                            <div className="placeholder">
                                                <div className="icon" style={{ fontSize: 48 }}>{FILE_TYPE_ICONS[selectedFile.fileType] || '📎'}</div>
                                                <div style={{ fontSize: 16, fontWeight: 600, marginTop: 8 }}>{selectedFile.name}</div>
                                                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                                                    ไม่รองรับการพรีวิวไฟล์ประเภทนี้
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Lightbox overlay */}
                            {lightbox && selectedFile?.fileType === 'image' && (
                                <div onClick={() => setLightbox(false)} style={{
                                    position: 'fixed', inset: 0, zIndex: 9999,
                                    background: 'rgba(0,0,0,0.85)', display: 'flex',
                                    alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out'
                                }}>
                                    <button onClick={(e) => { e.stopPropagation(); setLightbox(false) }} style={{
                                        position: 'absolute', top: 16, right: 16, width: 40, height: 40,
                                        borderRadius: 10, border: 'none', background: 'rgba(255,255,255,0.15)',
                                        color: '#fff', fontSize: 20, cursor: 'pointer', zIndex: 10000
                                    }}>✕</button>
                                    <img
                                        src={`/api/files/preview?path=${encodeURIComponent(selectedFile.path)}&token=${token}`}
                                        alt={selectedFile.name}
                                        onClick={e => e.stopPropagation()}
                                        style={{ maxWidth: '95vw', maxHeight: '95vh', objectFit: 'contain', borderRadius: 8, cursor: 'default' }}
                                    />
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </main>

            {/* Archive Confirm Modal */}
            {archiveConfirm && (
                <div style={{
                    position: 'fixed', inset: 0, zIndex: 9998,
                    background: 'rgba(0,0,0,.45)', backdropFilter: 'blur(4px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    animation: 'fadeIn .2s ease'
                }} onClick={() => setArchiveConfirm(null)}>
                    <div onClick={e => e.stopPropagation()} style={{
                        background: '#fff', borderRadius: 16, padding: '28px 32px',
                        boxShadow: '0 20px 60px rgba(0,0,0,.25), 0 0 0 1px rgba(0,0,0,.05)',
                        maxWidth: 400, width: '90%',
                        animation: 'slideUp .25s ease'
                    }}>
                        {/* Icon */}
                        <div style={{ textAlign: 'center', marginBottom: 16 }}>
                            <div style={{
                                width: 56, height: 56, borderRadius: '50%',
                                background: 'linear-gradient(135deg, #fff7ed, #ffedd5)',
                                border: '2px solid #fed7aa',
                                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: 26
                            }}>📦</div>
                        </div>

                        {/* Title */}
                        <h3 style={{
                            textAlign: 'center', margin: '0 0 8px', fontSize: 16,
                            fontWeight: 700, color: '#1a1a2e'
                        }}>ย้ายไปเอกสารไม่ได้ใช้งาน?</h3>

                        {/* Message */}
                        <p style={{
                            textAlign: 'center', margin: '0 0 8px', fontSize: 13,
                            color: '#64748b', lineHeight: 1.5
                        }}>ไฟล์จะถูกย้ายไปเก็บในโฟลเดอร์</p>
                        <div style={{
                            textAlign: 'center', marginBottom: 20, padding: '8px 14px',
                            background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0'
                        }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: '#334155', wordBreak: 'break-all' }}>
                                📄 {archiveConfirm.fileName}
                            </div>
                            <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 4 }}>
                                → 📂 เอกสารไม่ได้ใช้งาน
                            </div>
                        </div>

                        {/* Buttons */}
                        <div style={{ display: 'flex', gap: 10 }}>
                            <button onClick={() => setArchiveConfirm(null)} style={{
                                flex: 1, padding: '10px 0', borderRadius: 10,
                                border: '1px solid #e2e8f0', background: '#f8fafc',
                                color: '#64748b', fontSize: 13, fontWeight: 600,
                                cursor: 'pointer', transition: 'all .15s'
                            }}
                                onMouseEnter={e => { e.currentTarget.style.background = '#e2e8f0' }}
                                onMouseLeave={e => { e.currentTarget.style.background = '#f8fafc' }}
                            >ยกเลิก</button>
                            <button onClick={executeArchive} style={{
                                flex: 1, padding: '10px 0', borderRadius: 10,
                                border: 'none', background: 'linear-gradient(135deg, #f97316, #ea580c)',
                                color: '#fff', fontSize: 13, fontWeight: 600,
                                cursor: 'pointer', transition: 'all .15s',
                                boxShadow: '0 2px 8px rgba(249,115,22,.3)'
                            }}
                                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 4px 14px rgba(249,115,22,.4)' }}
                                onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(249,115,22,.3)' }}
                            >ย้ายไฟล์</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Processing Overlay */}
            {(processingMsg || renameProcessing) && (
                <div style={{
                    position: 'fixed', inset: 0, zIndex: 9999,
                    background: 'rgba(0,0,0,.5)', backdropFilter: 'blur(6px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                    <div style={{
                        background: '#fff', borderRadius: 16, padding: '40px 56px',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20,
                        boxShadow: '0 20px 60px rgba(0,0,0,.3), 0 0 0 1px rgba(255,255,255,.1)',
                        minWidth: 320
                    }}>
                        {/* Spinner */}
                        <div style={{
                            width: 56, height: 56,
                            border: '5px solid #f0f0f0',
                            borderTop: '5px solid var(--accent)',
                            borderRadius: '50%',
                            animation: 'spin 1s linear infinite'
                        }} />

                        {/* Title */}
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: 17, fontWeight: 700, color: '#1a1a2e', marginBottom: 6 }}>
                                {processingMsg || '⏳ กำลังดำเนินการ...'}
                            </div>
                            <div style={{ fontSize: 13, color: '#888' }}>
                                กรุณาอย่าปิดหน้านี้จนกว่าจะเสร็จ
                            </div>
                        </div>

                        {/* Animated dots */}
                        <div style={{ display: 'flex', gap: 6 }}>
                            {[0, 1, 2].map(i => (
                                <div key={i} style={{
                                    width: 8, height: 8, borderRadius: '50%',
                                    background: 'var(--accent)',
                                    animation: `pulse 1.4s ease-in-out ${i * 0.2}s infinite`
                                }} />
                            ))}
                        </div>
                    </div>
                    <style>{`
                        @keyframes spin { to { transform: rotate(360deg) } }
                        @keyframes pulse {
                            0%, 80%, 100% { opacity: .3; transform: scale(.8) }
                            40% { opacity: 1; transform: scale(1.2) }
                        }
                    `}</style>
                </div>
            )}

            {/* ══════ BACKUP SELECTION MODAL ══════ */}
            {showBackupModal && (
                <div style={{
                    position: 'fixed', inset: 0, zIndex: 9999,
                    background: 'rgba(0,0,0,.45)', backdropFilter: 'blur(4px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                }} onClick={() => setShowBackupModal(false)}>
                    <div style={{
                        background: '#fff', borderRadius: 16, padding: 24,
                        width: '90%', maxWidth: 520, maxHeight: '80vh',
                        boxShadow: '0 20px 60px rgba(0,0,0,.25)',
                        display: 'flex', flexDirection: 'column', gap: 16
                    }} onClick={e => e.stopPropagation()}>
                        {/* Header */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h3 style={{ margin: 0, fontSize: 18, color: '#1a1a2e' }}>💾 เลือกไฟล์สำรองต้นฉบับ</h3>
                            <button onClick={() => setShowBackupModal(false)} style={{
                                background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#888',
                                width: 32, height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center'
                            }}>✕</button>
                        </div>

                        {/* Select all / none */}
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
                            <button onClick={() => {
                                const skipFolders = ['ต้นฉบับ', 'WHT', 'VAT', 'None_Vat']
                                setBackupSelection(items.filter(i => !i.isDirectory || !skipFolders.includes(i.name)).map(i => i.name))
                            }} style={{
                                padding: '4px 12px', borderRadius: 6, border: '1px solid #f97316',
                                background: '#fff7ed', color: '#e65100', cursor: 'pointer', fontSize: 12, fontWeight: 600
                            }}>เลือกทั้งหมด</button>
                            <button onClick={() => setBackupSelection([])} style={{
                                padding: '4px 12px', borderRadius: 6, border: '1px solid #ddd',
                                background: '#f5f5f5', color: '#666', cursor: 'pointer', fontSize: 12, fontWeight: 600
                            }}>ยกเลิกทั้งหมด</button>
                            <span style={{ marginLeft: 'auto', color: '#888' }}>
                                เลือก {backupSelection.length} จาก {items.filter(i => { const skip = ['ต้นฉบับ','WHT','VAT','None_Vat']; return !i.isDirectory || !skip.includes(i.name) }).length} ไฟล์
                            </span>
                        </div>

                        {/* File list */}
                        <div style={{
                            flex: 1, overflowY: 'auto', border: '1px solid #eee',
                            borderRadius: 10, maxHeight: 400
                        }}>
                            {items.filter(i => {
                                const skipFolders = ['ต้นฉบับ', 'WHT', 'VAT', 'None_Vat']
                                return !i.isDirectory || !skipFolders.includes(i.name)
                            }).map((item, idx) => (
                                <label key={item.name} style={{
                                    display: 'flex', alignItems: 'center', gap: 10,
                                    padding: '10px 14px', cursor: 'pointer',
                                    borderBottom: '1px solid #f5f5f5',
                                    background: idx % 2 === 0 ? '#fff' : '#fafafa',
                                    transition: 'background .15s'
                                }}
                                onMouseOver={e => e.currentTarget.style.background = '#fff7ed'}
                                onMouseOut={e => e.currentTarget.style.background = idx % 2 === 0 ? '#fff' : '#fafafa'}>
                                    <input type="checkbox"
                                        checked={backupSelection.includes(item.name)}
                                        onChange={() => {
                                            setBackupSelection(prev =>
                                                prev.includes(item.name)
                                                    ? prev.filter(n => n !== item.name)
                                                    : [...prev, item.name]
                                            )
                                        }}
                                        style={{ width: 18, height: 18, accentColor: '#f97316', cursor: 'pointer' }} />
                                    <span style={{ fontSize: 16 }}>{item.isDirectory ? '📁' : (FILE_TYPE_ICONS[item.fileType] || '📎')}</span>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: 13, fontWeight: 500, color: '#1a1a2e', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
                                        <div style={{ fontSize: 11, color: '#aaa' }}>{item.isDirectory ? 'โฟลเดอร์' : formatSize(item.size)}</div>
                                    </div>
                                </label>
                            ))}
                        </div>

                        {/* Actions */}
                        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                            <button onClick={() => setShowBackupModal(false)} style={{
                                padding: '10px 20px', borderRadius: 10, border: '1px solid #ddd',
                                background: '#f5f5f5', color: '#666', cursor: 'pointer', fontSize: 13, fontWeight: 600
                            }}>ยกเลิก</button>
                            <button
                                disabled={backupSelection.length === 0}
                                onClick={async () => {
                                    setShowBackupModal(false)
                                    setProcessingMsg('💾 กำลังสำรองไฟล์ต้นฉบับ...')
                                    try {
                                        const res = await backupAllFiles(currentPath, backupSelection)
                                        toast.success(`${res.data.message} (ข้าม ${res.data.skipped} ไฟล์ที่มีอยู่แล้ว)`)
                                        loadDirectory(currentPath)
                                    } catch (err) {
                                        toast.error(err.response?.data?.error || 'เกิดข้อผิดพลาด')
                                    } finally {
                                        setProcessingMsg('')
                                    }
                                }}
                                style={{
                                    padding: '10px 24px', borderRadius: 10, border: 'none',
                                    background: backupSelection.length === 0 ? '#ccc' : 'linear-gradient(135deg, #f97316, #ea580c)',
                                    color: '#fff', cursor: backupSelection.length === 0 ? 'not-allowed' : 'pointer',
                                    fontSize: 13, fontWeight: 700, boxShadow: backupSelection.length > 0 ? '0 4px 12px rgba(249,115,22,.3)' : 'none'
                                }}>
                                💾 สำรอง {backupSelection.length} ไฟล์
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
