import { useState, useEffect } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'react-hot-toast';
import Sidebar from '../../components/Sidebar';
import { getBotProfiles, createBotProfile, deleteBotProfile, getBotCredentials, createBotCredential, deleteBotCredential } from '../../services/api';
import './BotDatabasePage.css';

const IconWrapper = ({ emoji, className = '' }) => <span className={`inline-flex items-center justify-center w-[1em] h-[1em] ${className}`}>{emoji}</span>;
const Bot = (p) => <IconWrapper emoji="🤖" {...p} />;
const Plus = (p) => <IconWrapper emoji="➕" {...p} />;
const Search = (p) => <IconWrapper emoji="🔍" {...p} />;
const Server = (p) => <IconWrapper emoji="🖥️" {...p} />;
const Key = (p) => <IconWrapper emoji="🔑" {...p} />;
const Copy = (p) => <IconWrapper emoji="📋" {...p} />;
const Check = (p) => <IconWrapper emoji="✅" {...p} />;
const Trash2 = (p) => <IconWrapper emoji="🗑️" {...p} />;

export default function BotDatabasePage() {
    // === State Management ===
    const [searchTerm, setSearchTerm] = useState('');
    const [copiedId, setCopiedId] = useState(null);
    
    // Data
    const [profiles, setProfiles] = useState([]);
    const [credentials, setCredentials] = useState([]);
    const [loading, setLoading] = useState(true);

    const [activeTab, setActiveTab] = useState('database');
    const [expandedPdfConfigs, setExpandedPdfConfigs] = useState({}); // track expanded state by profile id

    // Fetch Initial Data
    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [profilesRes, credsRes] = await Promise.all([
                getBotProfiles(),
                getBotCredentials()
            ]);
            setProfiles(profilesRes.data || []);
            setCredentials(credsRes.data || []);
        } catch (error) {
            console.error("Error fetching data:", error);
            toast.error("ไม่สามารถโหลดข้อมูลจากฐานข้อมูลได้");
        } finally {
            setLoading(false);
        }
    };

    const [formData, setFormData] = useState({
        platform: '',
        username: '',
        password: '',
        software: '',
        peakCode: '',
        vatStatus: 'registered', // registered, unregistered
        pdfConfigs: [{ companyName: '', customerCode: '', accountCode: '', paymentCode: '' }]
    });

    const [credFormData, setCredFormData] = useState({
        name: '',
        username: '',
        password: ''
    });

    const handleCopy = (text, id) => {
        navigator.clipboard.writeText(text);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
    };

    const togglePdfConfig = (id) => {
        setExpandedPdfConfigs(prev => ({
            ...prev,
            [id]: !prev[id]
        }));
    };

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handlePdfConfigChange = (index, field, value) => {
        const newConfigs = [...formData.pdfConfigs];
        newConfigs[index][field] = value;
        setFormData(prev => ({ ...prev, pdfConfigs: newConfigs }));
    };

    const handleAddPdfConfig = () => {
        setFormData(prev => ({ 
            ...prev, 
            pdfConfigs: [...prev.pdfConfigs, { companyName: '', customerCode: '', accountCode: '', paymentCode: '' }] 
        }));
    };

    const handleRemovePdfConfig = (index) => {
        const newConfigs = formData.pdfConfigs.filter((_, i) => i !== index);
        setFormData(prev => ({ ...prev, pdfConfigs: newConfigs }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const res = await createBotProfile(formData);
            setProfiles([res.data, ...profiles]);
            setFormData({ 
                platform: '', username: '', password: '', 
                software: '', peakCode: '', 
                vatStatus: 'registered',
                pdfConfigs: [{ companyName: '', customerCode: '', accountCode: '', paymentCode: '' }] 
            });
            toast.success("บันทึกข้อมูลบอทสำเร็จ");
        } catch (error) {
            console.error("Error creating profile:", error);
            toast.error("เกิดข้อผิดพลาดในการบันทึกข้อมูล");
        }
    };

    const handleCredInputChange = (e) => {
        const { name, value } = e.target;
        setCredFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleCredSubmit = async (e) => {
        e.preventDefault();
        try {
            const res = await createBotCredential(credFormData);
            setCredentials([res.data, ...credentials]);
            setCredFormData({ name: '', username: '', password: '' });
            toast.success("เพิ่มชุดรหัสผ่านสำเร็จ");
        } catch (error) {
            console.error("Error creating credential:", error);
            toast.error("เกิดข้อผิดพลาดในการบันทึกชุดรหัสผ่าน");
        }
    };

    const handleDeleteProfile = async (id) => {
        if (!window.confirm("คุณแน่ใจหรือไม่ว่าต้องการลบข้อมูลบอทนี้?")) return;
        try {
            await deleteBotProfile(id);
            setProfiles(profiles.filter(p => p.id !== id));
            toast.success("ลบข้อมูลบอทสำเร็จ");
        } catch (error) {
            console.error("Error deleting profile:", error);
            toast.error("เกิดข้อผิดพลาด ลบข้อมูลไม่สำเร็จ");
        }
    };

    const handleDeleteCredential = async (id) => {
        if (!window.confirm("คุณแน่ใจหรือไม่ว่าต้องการลบชุดรหัสผ่านนี้?")) return;
        try {
            await deleteBotCredential(id);
            setCredentials(credentials.filter(c => c.id !== id));
            toast.success("ลบชุดรหัสผ่านสำเร็จ");
        } catch (error) {
            console.error("Error deleting credential:", error);
            toast.error("เกิดข้อผิดพลาด ลบชุดรหัสผ่านไม่สำเร็จ");
        }
    };

    const filteredProfiles = profiles.filter(p => 
        p.platform.toLowerCase().includes(searchTerm.toLowerCase()) || 
        p.peakCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.software.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const filteredCredentials = credentials.filter(c => 
        c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
        c.username.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="app-layout">
            <Sidebar active="bot-database" />
            <main className="main-content">
                <div className="page-header animate-in">
                    <div className="breadcrumb">บอทอัตโนมัติ / ฐานข้อมูลบอท</div>
                    <h1>🔐 ฐานข้อมูลบอท — จัดการรหัสผ่านแพลตฟอร์มอย่างปลอดภัย</h1>
                    <p>ระบบบันทึกและจัดการข้อมูลการเข้าสู่ระบบ แพลตฟอร์มรหัส Build Code และรหัสบริษัท PEAK สำหรับให้บอททำงาน</p>
                </div>
                
                <div className="bot-db-page">
                    <div className="bot-tabs-container animate-in" style={{ animationDelay: '0.05s' }}>
                        <div className="bot-tabs">
                            <button type="button" className={`bot-tab ${activeTab === 'database' ? 'active' : ''}`} onClick={() => setActiveTab('database')}>
                                <Server className="icon" /> ฐานข้อมูลบอท
                            </button>
                            <button type="button" className={`bot-tab ${activeTab === 'credentials' ? 'active' : ''}`} onClick={() => setActiveTab('credentials')}>
                                <Key className="icon" /> ตั้งค่าชุดรหัสผ่าน
                            </button>
                        </div>
                    </div>

                    {/* Header Tool Actions */}
                    <header className="bot-db-header animate-in" style={{ animationDelay: '0.1s' }}>
                        <div className="bot-header-left">
                            <span className="bot-badge">SECURE DATA</span>
                        </div>
                        <div className="bot-header-right">
                            <div className="bot-search-wrap">
                                <span className="bot-search-icon"><Search /></span>
                                <input 
                                    type="text"
                                    placeholder="ค้นหา Build Code, ผู้ใช้..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="bot-search-input"
                                />
                            </div>
                        </div>
                    </header>

                    <main className="bot-db-main animate-in" style={{ animationDelay: '0.2s' }}>
                        {activeTab === 'database' && (
                            <>
                                {/* LEFT COLUMN: Data View (70%) */}
                                <div className="bot-db-list-col">
                                    <div className="list-header">
                                <h2>ฐานข้อมูลที่บันทึกแล้ว</h2>
                                <span className="record-count">{filteredProfiles.length} รายการ</span>
                            </div>

                                {loading ? (
                                    <div className="empty-state">
                                        <p>กำลังโหลดข้อมูล...</p>
                                    </div>
                                ) : filteredProfiles.length === 0 ? (
                                    <div className="empty-state">
                                        <Bot className="icon" />
                                        <p>ไม่พบข้อมูลที่ค้นหา</p>
                                    </div>
                                ) : (
                                    <div className="bot-card-grid">
                                        {filteredProfiles.map(profile => (
                                        <div key={profile.id} className="bot-card">
                                            <div className="bot-card-header">
                                                <div>
                                                    <div className="bot-id">{profile.id}</div>
                                                    <h3 className="bot-platform">{profile.platform}</h3>
                                                </div>
                                                <div className={`bot-status status-${profile.status}`}>
                                                    {profile.status === 'active' ? 'ใช้งานปกติ' : 
                                                    profile.status === 'error' ? 'มีปัญหา' : 'ไม่ได้เชื่อมต่อ'}
                                                </div>
                                            </div>

                                            <div className="bot-data-grid">
                                                <div>
                                                    <div className="data-label"><Bot /> ชื่อผู้ใช้</div>
                                                    <div className="data-value-box">
                                                        <span className="data-text">{profile.username}</span>
                                                        <button onClick={() => handleCopy(profile.username, `${profile.id}-user`)} className="btn-copy" title="คัดลอกชื่อผู้ใช้">
                                                            {copiedId === `${profile.id}-user` ? <Check style={{color: '#22c55e'}} /> : <Copy />}
                                                        </button>
                                                    </div>
                                                </div>

                                                <div>
                                                    <div className="data-label"><Key /> รหัสผ่าน</div>
                                                    <div className="data-value-box">
                                                        <span className="data-text">{profile.password || '••••••••'}</span>
                                                        <button onClick={() => handleCopy(profile.password, `${profile.id}-pass`)} className="btn-copy" title="คัดลอกรหัสผ่าน">
                                                            {copiedId === `${profile.id}-pass` ? <Check style={{color: '#22c55e'}} /> : <Copy />}
                                                        </button>
                                                    </div>
                                                </div>

                                                <div className="data-fill-row">
                                                    <div className="data-label"><Server /> โปรแกรมบัญชีสำเร็จรูป</div>
                                                    <div className="data-value-box">
                                                        <span className="data-text data-text-bold">{profile.software}</span>
                                                        <button onClick={() => handleCopy(profile.software, `${profile.id}-software`)} className="btn-copy" title="คัดลอกชื่อโปรแกรม">
                                                            {copiedId === `${profile.id}-software` ? <Check style={{color: '#22c55e'}} /> : <Copy />}
                                                        </button>
                                                    </div>
                                                </div>

                                                <div className="data-fill-row">
                                                    <div className="data-label"><Key style={{ color: '#ea580c' }}/> รหัส PEAK Code URL</div>
                                                    <div className="data-value-box highlight">
                                                        <span className="data-text data-text-bold" style={{fontSize: '16px', color: '#ea580c'}}>{profile.peakCode}</span>
                                                        <button onClick={() => handleCopy(profile.peakCode, `${profile.id}-peak`)} className="btn-copy-labeled">
                                                            {copiedId === `${profile.id}-peak` ? 'คัดลอกแล้ว' : 'คัดลอกรหัส'}
                                                        </button>
                                                    </div>
                                                </div>

                                                {profile.software === 'PEAK' && profile.vatStatus && (
                                                    <div className="data-fill-row">
                                                        <div className="data-label"><Server style={{ color: '#0ea5e9' }}/> ประเภทจดทะเบียนภาษี</div>
                                                        <div className="data-value-box">
                                                            <span className="data-text">{profile.vatStatus === 'registered' ? 'จดทะเบียนภาษีมูลค่าเพิ่ม' : 'ยังไม่จดภาษีมูลค่าเพิ่ม'}</span>
                                                        </div>
                                                    </div>
                                                )}

                                                {profile.software === 'PEAK' && profile.pdfConfigs && profile.pdfConfigs.length > 0 && (
                                                    <div className="data-fill-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '8px', padding: '16px 0 8px 0', borderTop: '1px dashed #cbd5e1' }}>
                                                        <div 
                                                            className="data-label" 
                                                            style={{ fontWeight: 700, color: '#334155', display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', cursor: 'pointer', padding: '4px 0' }}
                                                            onClick={() => togglePdfConfig(profile.id)}
                                                        >
                                                            <div style={{ display: 'flex', alignItems: 'center' }}>
                                                                <Bot style={{ color: '#8b5cf6', marginRight: '8px' }}/> ข้อมูลสำหรับบอท PDF 
                                                                <span style={{fontSize: '11px', fontWeight: 'normal', color: '#94a3b8', marginLeft: '6px', background: '#f1f5f9', padding: '2px 6px', borderRadius: '10px'}}>({profile.pdfConfigs.length} รายการ)</span>
                                                            </div>
                                                            <div style={{ color: '#94a3b8', display: 'flex', alignItems: 'center', transition: 'transform 0.2s', transform: expandedPdfConfigs[profile.id] ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                                                                <ChevronDown size={16} />
                                                            </div>
                                                        </div>
                                                        
                                                        {expandedPdfConfigs[profile.id] && (
                                                            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '4px' }}>
                                                                {profile.pdfConfigs.map((config, index) => (
                                                                    <div key={index} style={{ background: '#ffffff', padding: '14px', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 1px 2px rgba(0,0,0,0.02)', fontSize: '13px' }}>
                                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                                                                            <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '20px', height: '20px', borderRadius: '50%', background: '#f1f5f9', color: '#64748b', fontSize: '11px', fontWeight: 700 }}>{index + 1}</span>
                                                                            <span style={{ fontWeight: 600, color: '#0f172a', fontSize: '14px' }}>{config.companyName || '(ไม่มีชื่อบริษัท)'}</span>
                                                                        </div>
                                                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', color: '#475569', background: '#f8fafc', padding: '10px', borderRadius: '6px' }}>
                                                                            <div><div style={{color: '#94a3b8', fontSize: '11px', marginBottom: '2px'}}>โค้ดลูกค้า</div><div style={{fontWeight: 500}}>{config.customerCode}</div></div>
                                                                            <div><div style={{color: '#94a3b8', fontSize: '11px', marginBottom: '2px'}}>บันทึกบัญชี</div><div style={{fontWeight: 500}}>{config.accountCode}</div></div>
                                                                            <div style={{gridColumn: '1 / -1'}}><div style={{color: '#94a3b8', fontSize: '11px', marginBottom: '2px'}}>ตัดชำระเงิน</div><div style={{fontWeight: 500}}>{config.paymentCode}</div></div>
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>

                                            <div className="bot-card-footer">
                                                <span className="sync-time">อัปเดตล่าสุด: {profile.lastSync}</span>
                                                <button className="btn-delete" title="ลบข้อมูล" onClick={() => handleDeleteProfile(profile.id)}>
                                                    <Trash2 />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* RIGHT COLUMN: Form Sidebar (30%) */}
                        <div className="bot-db-form-col">
                            <div className="form-header">
                                <h2 className="form-title">
                                    <span className="hash-mark">+</span>
                                    เพิ่มข้อมูลบอทใหม่
                                </h2>
                                <p className="form-desc">บันทึกรหัสผ่านใหม่ลงฐานข้อมูล ข้อมูลจะถูกเข้ารหัสระดับสูง</p>
                            </div>

                            <form onSubmit={handleSubmit}>
                                <div className="form-section">
                                    <div className="brutal-input-group">
                                        <label className="brutal-label"><Bot className="icon" /> ชื่อโปรเจกต์ (Build Code)</label>
                                        <input type="text" name="platform" value={formData.platform} onChange={handleInputChange} className="brutal-input" placeholder="เช่น 000 ทดสอบระบบ" required />
                                    </div>
                                    
                                    <div className="brutal-input-group">
                                        <label className="brutal-label"><Key className="icon" style={{color: '#f97316'}} /> เลือกชุดรหัสผ่าน (ถ้ามี)</label>
                                        <select 
                                            className="brutal-input peak-input"
                                            onChange={(e) => {
                                                const cred = credentials.find(c => c.id === e.target.value);
                                                if(cred) {
                                                    setFormData(prev => ({...prev, username: cred.username, password: cred.password}));
                                                }
                                            }}
                                            defaultValue=""
                                        >
                                            <option value="" disabled>-- เลือกชุดรหัสผ่านจากที่ตั้งค่าไว้ --</option>
                                            {credentials.map(cred => (
                                                <option key={cred.id} value={cred.id}>{cred.name}</option>
                                            ))}
                                        </select>
                                    </div>

                                    <div className="brutal-input-group">
                                        <label className="brutal-label"><Search className="icon" /> ชื่อผู้ใช้เข้าสู่ระบบ</label>
                                        <input type="text" name="username" value={formData.username} onChange={handleInputChange} className="brutal-input" placeholder="user@email.com" required />
                                    </div>
                                    
                                    <div className="brutal-input-group">
                                        <label className="brutal-label"><Key className="icon" /> รหัสผ่าน</label>
                                        <input 
                                            type="text" 
                                            name="password" 
                                            value={formData.password} 
                                            onChange={handleInputChange} 
                                            className="brutal-input" 
                                            placeholder="กรอกรหัสผ่าน" 
                                            required 
                                        />
                                    </div>
                                </div>

                                <div className="form-section accented">
                                    <div className="section-badge">รหัสเชื่อมโยง</div>
                                    
                                    <div className="brutal-input-group">
                                        <label className="brutal-label"><Server className="icon" /> โปรแกรมบัญชีสำเร็จรูป</label>
                                        <select 
                                            name="software" 
                                            value={formData.software} 
                                            onChange={handleInputChange} 
                                            className="brutal-input" 
                                            required
                                        >
                                            <option value="" disabled>-- เลือกโปรแกรมบัญชี --</option>
                                            <option value="PEAK">PEAK (พีก)</option>
                                            <option value="FlowAccount">FlowAccount (โฟลว์แอคเคาท์)</option>
                                            <option value="TRCLOUD">TRCLOUD (ทีอาร์คลาวด์)</option>
                                            <option value="SMEMOVE">SMEMOVE (เอสเอ็มอีมูฟ)</option>
                                            <option value="Express">Express (เอ็กซ์เพรส)</option>
                                            <option value="Prosoft WINSpeed">Prosoft WINSpeed</option>
                                            <option value="MAC-5">MAC-5</option>
                                            <option value="CD Organizer">CD Organizer</option>
                                            <option value="AutoFlight">AutoFlight</option>
                                            <option value="AccCloud">AccCloud</option>
                                            <option value="Nexto">Nexto (เน็กซ์โตะ)</option>
                                            <option value="SeniorSoft">SeniorSoft</option>
                                            <option value="Formula">Formula / Crystal Formula</option>
                                            <option value="EASY-ACC">EASY-ACC</option>
                                            <option value="Bplus ERP">Bplus ERP</option>
                                            <option value="SAP Business One">SAP Business One</option>
                                            <option value="Oracle NetSuite">Oracle NetSuite</option>
                                            <option value="Odoo">Odoo</option>
                                            <option value="Custom / อื่นๆ">โปรแกรมอื่นๆ (Custom)</option>
                                        </select>
                                    </div>

                                    {formData.software === 'PEAK' ? (
                                        <>
                                            <div className="brutal-input-group">
                                                <label className="brutal-label"><Key className="icon" /> รหัส PEAK Code URL</label>
                                                <p className="form-hint">ต้องตรงกับรหัสบริษัทที่ส่งมาจากระบบ PEAK Accounting</p>
                                                <input type="text" name="peakCode" value={formData.peakCode} onChange={handleInputChange} className="brutal-input peak-input" placeholder="P-XXXX" required />
                                            </div>

                                            <div className="brutal-input-group">
                                                <label className="brutal-label"><Server className="icon" /> ประเภทจดทะเบียนภาษี</label>
                                                <select name="vatStatus" value={formData.vatStatus} onChange={handleInputChange} className="brutal-input">
                                                    <option value="registered">จดทะเบียนภาษีมูลค่าเพิ่ม</option>
                                                    <option value="unregistered">ยังไม่จดภาษีมูลค่าเพิ่ม</option>
                                                </select>
                                            </div>

                                            <div className="pdf-configs-section" style={{ marginTop: '16px', borderTop: '1px solid #e2e8f0', paddingTop: '16px' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                                    <label className="brutal-label" style={{ marginBottom: 0 }}>
                                                        <Bot className="icon" /> ข้อมูลสำหรับบอท PDF
                                                    </label>
                                                    <button type="button" onClick={handleAddPdfConfig} style={{ background: 'none', border: 'none', color: '#f97316', cursor: 'pointer', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                        <Plus style={{fontSize: '10px'}}/> เพิ่มรายการ
                                                    </button>
                                                </div>
                                                
                                                {formData.pdfConfigs.map((config, index) => (
                                                    <div key={index} style={{ background: '#f8fafc', padding: '12px', borderRadius: '6px', marginBottom: '12px', border: '1px solid #e2e8f0', position: 'relative' }}>
                                                        {formData.pdfConfigs.length > 1 && (
                                                            <button type="button" onClick={() => handleRemovePdfConfig(index)} style={{ position: 'absolute', top: '8px', right: '8px', background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px' }}>
                                                                <Trash2 />
                                                            </button>
                                                        )}
                                                        <div className="pdf-config-header" style={{ fontSize: '12px', fontWeight: 'bold', color: '#64748b', marginBottom: '8px' }}>
                                                            รายการที่ {index + 1}
                                                        </div>
                                                        <div className="brutal-input-group" style={{ marginBottom: '8px' }}>
                                                            <input type="text" value={config.companyName} onChange={(e) => handlePdfConfigChange(index, 'companyName', e.target.value)} className="brutal-input" placeholder="ชื่อบริษัทที่ใช้บอท" style={{ padding: '8px' }} />
                                                        </div>
                                                        <div className="brutal-input-group" style={{ marginBottom: '8px' }}>
                                                            <input type="text" value={config.customerCode} onChange={(e) => handlePdfConfigChange(index, 'customerCode', e.target.value)} className="brutal-input" placeholder="โค้ดลูกค้าใน Peak" style={{ padding: '8px' }} />
                                                        </div>
                                                        <div className="brutal-input-group" style={{ marginBottom: '8px' }}>
                                                            <input type="text" value={config.accountCode} onChange={(e) => handlePdfConfigChange(index, 'accountCode', e.target.value)} className="brutal-input" placeholder="โค้ดบันทึกบัญชี" style={{ padding: '8px' }} />
                                                        </div>
                                                        <div className="brutal-input-group" style={{ marginBottom: 0 }}>
                                                            <input type="text" value={config.paymentCode} onChange={(e) => handlePdfConfigChange(index, 'paymentCode', e.target.value)} className="brutal-input" placeholder="โค้ดตัดชำระเงิน" style={{ padding: '8px' }} />
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </>
                                    ) : formData.software ? (
                                        <div className="brutal-input-group" style={{ marginBottom: 0 }}>
                                            <label className="brutal-label" style={{ color: '#94a3b8' }}><Key className="icon" style={{ color: '#94a3b8' }} /> รหัสเชื่อมโยงระบบ</label>
                                            <p className="form-hint">โครงสร้างการเชื่อมโยงสำหรับ {formData.software}</p>
                                            <input type="text" className="brutal-input" value="รอการพัฒนา" disabled style={{ backgroundColor: '#f1f5f9', color: '#94a3b8', borderColor: '#cbd5e1', cursor: 'not-allowed' }} />
                                        </div>
                                    ) : null}
                                </div>

                                <div className="form-actions">
                                    <button type="submit" className="bot-btn-primary btn-submit">
                                        <Plus /> บันทึกข้อมูลบอท
                                    </button>
                                </div>
                            </form>
                        </div>
                            </>
                        )}
                        
                        {/* CREDENTIALS VIEW */}
                        {activeTab === 'credentials' && (
                            <>
                                <div className="bot-db-list-col">
                                    <div className="list-header">
                                        <h2>ชุดรหัสผ่านที่บันทึกไว้</h2>
                                        <span className="record-count">{filteredCredentials.length} รายการ</span>
                                    </div>
                                    {loading ? (
                                        <div className="empty-state">
                                            <p>กำลังโหลดข้อมูล...</p>
                                        </div>
                                    ) : filteredCredentials.length === 0 ? (
                                        <div className="empty-state">
                                            <Key className="icon" />
                                            <p>ไม่พบข้อมูลชุดรหัสผ่าน</p>
                                        </div>
                                    ) : (
                                        <div className="bot-card-grid">
                                            {filteredCredentials.map(cred => (
                                                <div key={cred.id} className="bot-card">
                                                    <div className="bot-card-header">
                                                        <div>
                                                            <div className="bot-id">{cred.id}</div>
                                                            <h3 className="bot-platform">{cred.name}</h3>
                                                        </div>
                                                    </div>
                                                    <div className="bot-data-grid">
                                                        <div>
                                                            <div className="data-label"><Bot /> ชื่อผู้ใช้เข้าสู่ระบบ</div>
                                                            <div className="data-value-box">
                                                                <span className="data-text">{cred.username}</span>
                                                            </div>
                                                        </div>
                                                        <div>
                                                            <div className="data-label"><Key /> รหัสผ่าน</div>
                                                            <div className="data-value-box">
                                                                <span className="data-text">{cred.password}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="bot-card-footer">
                                                        <span className="sync-time">ใช้สำหรับระบบออโต้ฟิล</span>
                                                        <button className="btn-delete" title="ลบข้อมูล" onClick={() => handleDeleteCredential(cred.id)}>
                                                            <Trash2 />
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* CREDENTIAL FORM */}
                                <div className="bot-db-form-col">
                                    <div className="form-header">
                                        <h2 className="form-title">
                                            <span className="hash-mark">+</span>
                                            เพิ่มชุดรหัสผ่านใหม่
                                        </h2>
                                        <p className="form-desc">บันทึกข้อมูลเข้าสู่ระบบเพื่อนำไปใช้สร้างบอทได้รวดเร็วขึ้น</p>
                                    </div>
                                    <form onSubmit={handleCredSubmit}>
                                        <div className="form-section">
                                            <div className="brutal-input-group">
                                                <label className="brutal-label"><Bot className="icon" /> ชื่อเรียกชุดรหัสผ่าน</label>
                                                <input type="text" name="name" value={credFormData.name} onChange={handleCredInputChange} className="brutal-input" placeholder="เช่น Admin PEAK" required />
                                            </div>
                                            <div className="brutal-input-group">
                                                <label className="brutal-label"><Search className="icon" /> ชื่อผู้ใช้เข้าสู่ระบบ</label>
                                                <input type="text" name="username" value={credFormData.username} onChange={handleCredInputChange} className="brutal-input" placeholder="user@email.com" required />
                                            </div>
                                            <div className="brutal-input-group">
                                                <label className="brutal-label"><Key className="icon" /> รหัสผ่าน</label>
                                                <input type="text" name="password" value={credFormData.password} onChange={handleCredInputChange} className="brutal-input" placeholder="กรอกรหัสผ่าน" required />
                                            </div>
                                        </div>
                                        <div className="form-actions">
                                            <button type="submit" className="bot-btn-primary btn-submit">
                                                <Plus /> บันทึกการตั้งค่า
                                            </button>
                                        </div>
                                    </form>
                                </div>
                            </>
                        )}
                    </main>
                </div>
            </main>
        </div>
    );
}
