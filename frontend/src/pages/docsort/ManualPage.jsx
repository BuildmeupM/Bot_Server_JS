import { useState } from 'react'
import Sidebar from '../../components/Sidebar'

export default function ManualPage() {
    return (
        <div className="app-layout">
            <Sidebar active="manual" />
            <main className="main-content" style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
                <div className="page-header animate-in" style={{ flexShrink: 0, paddingBottom: 16 }}>
                    <div className="breadcrumb">หน้าหลัก / คัดแยกเอกสาร / คู่มือการใช้งาน</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span style={{ fontSize: 28, background: '#fff', width: 48, height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 12, boxShadow: '0 4px 12px rgba(0,0,0,.05)' }}>📖</span>
                        <div>
                            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: 'var(--text-primary)' }}>คู่มือการใช้งาน DocSort Pro</h1>
                            <p style={{ margin: '4px 0 0 0', color: 'var(--text-secondary)', fontSize: 13 }}>ระบบคัดแยกและจัดการเอกสาร</p>
                        </div>
                    </div>
                </div>

                <div className="animate-in" style={{ animationDelay: '.05s', overflowY: 'auto', flex: 1, paddingRight: 8, paddingBottom: 40 }}>
                    <div style={{ maxWidth: 900, margin: '0 auto' }}>
                        
                        <div className="card" style={{ marginBottom: 24, padding: 32 }}>
                            <p style={{ fontSize: 15, lineHeight: 1.6, color: '#475569', marginBottom: 24 }}>
                                ยินดีต้อนรับสู่ <strong>DocSort Pro</strong> 🚀 ระบบที่จะช่วยให้การจัดการเอกสารบัญชีและไฟล์ PDF ของคุณกลายเป็นเรื่องง่าย ประหยัดเวลา ลดความผิดพลาดในการตั้งชื่อไฟล์ และมีเครื่องมือครบจบในโปรแกรมเดียว!
                            </p>
                            <p style={{ fontSize: 14, color: '#64748b' }}>คู่มือเล่มนี้จะพาคุณไปเรียนรู้วิธีการใช้งานทั้ง 2 ส่วนหลักของโปรแกรม ได้แก่:</p>
                            <ol style={{ marginTop: 12, paddingLeft: 24, fontSize: 14, color: '#334155', lineHeight: 1.7 }}>
                                <li><strong>ระบบจัดการไฟล์ (File Management)</strong> - สำหรับการตรวจเช็คและเปลี่ยนชื่อไฟล์อย่างเป็นระบบ</li>
                                <li><strong>เครื่องมือจัดการเอกสาร (Document Tools)</strong> - มีดพับสวิสสำหรับปรับแต่ง สับเปลี่ยน และแก้ไขไฟล์ PDF / ZIP</li>
                            </ol>
                        </div>

                        {/* การจัดการไฟล์ */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, marginTop: 40 }}>
                            <span style={{ fontSize: 20 }}>🗂️</span>
                            <h2 style={{ fontSize: 20, margin: 0, color: '#1e293b' }}>ส่วนที่ 1: ระบบจัดการไฟล์ (File Management)</h2>
                        </div>
                        <div className="card" style={{ padding: 32 }}>
                            <p style={{ fontSize: 14, color: '#475569', marginBottom: 20 }}>
                                นี่คือหน้าจอหลักที่คุณจะใช้เวลาด้วยมากที่สุด ถูกออกแบบมาให้ "ดูและแก้" ได้จบในหน้าเดียว
                            </p>
                            
                            <div style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid #e2e8f0', marginBottom: 24, boxShadow: '0 4px 20px rgba(0,0,0,.08)' }}>
                                <img src="/@fs/C:/Users/USER/.gemini/antigravity/brain/b12a1933-a8f2-41d1-8146-0c7b64ad8f9a/manage_page_1772206230220.png" alt="หน้าจัดการไฟล์หลัก" style={{ width: '100%', display: 'block' }} />
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                                <div>
                                    <h3 style={{ fontSize: 16, color: '#0f172a', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <span style={{ width: 24, height: 24, background: '#e0e7ff', color: '#4f46e5', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, fontSize: 12, fontWeight: 800 }}>1</span>
                                        การตั้งค่าโฟลเดอร์ทำงาน (Workspace)
                                    </h3>
                                    <ul style={{ paddingLeft: 24, fontSize: 14, color: '#475569', lineHeight: 1.6, margin: 0 }}>
                                        <li style={{ marginBottom: 6 }}><strong>ช่องที่อยู่โฟลเดอร์ทำงาน</strong>: ด้านบนสุดของจอ ให้คุณคลิกปุ่ม "เปิดโฟลเดอร์" เพื่อเลือกแฟ้มงานที่เตรียมมา</li>
                                        <li style={{ marginBottom: 6 }}><strong>สำรองต้นฉบับ</strong>: แนะนำให้กดปุ่มนี้ก่อนทำงานทุกครั้ง เผื่อเปลี่ยนชื่อผิดพลาด ไฟล์ต้นฉบับจะถูกก็อปปี้ไว้ให้</li>
                                        <li><strong>รวมเอกสาร</strong>: หากคุณมีโฟลเดอร์ย่อยกระจัดกระจาย ปุ่มนี้จะช่วยดูดไฟล์ทั้งหมดในโฟลเดอร์ย่อยมารวมกันไว้ที่หน้าโฟลเดอร์หลักให้ทันที</li>
                                    </ul>
                                </div>

                                <div>
                                    <h3 style={{ fontSize: 16, color: '#0f172a', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <span style={{ width: 24, height: 24, background: '#e0e7ff', color: '#4f46e5', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, fontSize: 12, fontWeight: 800 }}>2</span>
                                        การพรีวิวเอกสารและแก้ไขชื่อ (Live Preview & Smart Rename)
                                    </h3>
                                    <ul style={{ paddingLeft: 24, fontSize: 14, color: '#475569', lineHeight: 1.6, margin: 0 }}>
                                        <li style={{ marginBottom: 6 }}>เมื่อคุณคลิกที่ชื่อไฟล์ในกรอบด้านซ้ายมือ ทางขวามือจะแสดง <strong>พรีวิวเอกสารจริง</strong> ขึ้นมา (ซูมเข้า/ออกได้) ทำให้คุณกวาดสายตาอ่านข้อมูลได้ทันที</li>
                                        <li style={{ marginBottom: 6 }}><strong>การพิมพ์ชื่อบริษัท</strong>: เพียงพิมพ์สั้นๆ ระบบจะค้นหาจากฐานข้อมูลและเติมเต็ม <em>รหัสบันทึกบัญชี</em> และ <em>รหัสตัดชำระเงิน</em> ให้อัตโนมัติ!</li>
                                        <li><strong>เครื่องคิดเลขภาษี (WHT Calculator)</strong>: หากเป็นเอกสารหัก ณ ที่จ่าย หรือเสียภาษีต่างประเทศ ระบบสามารถช่วยคำนวณฐานภาษีให้ชัวร์ๆ ก่อนเซฟได้</li>
                                    </ul>
                                </div>
                                
                                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: 16, borderRadius: 8, marginTop: 8 }}>
                                    <strong style={{ color: '#166534', display: 'block', marginBottom: 4, fontSize: 14 }}>💡 เคล็ดลับจากระบบ!</strong>
                                    <span style={{ color: '#15803d', fontSize: 13 }}>
                                        เมื่อคุณบันทึก ระบบจะสร้างแพทเทิร์นชื่อไฟล์อัจฉริยะแบบบัญชี เช่น: <code>WHT3% - 51101_1000 - บริษัทตัวอย่างจำกัด - CH0001</code> 
                                        ซึ่งช่วยให้คนรับช่วงต่อ หรือนำเข้าโปรแกรมบัญชีทำได้อย่างไร้รอยต่อ
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* เครื่องมือจัดการเอกสาร */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, marginTop: 40 }}>
                            <span style={{ fontSize: 20 }}>🧰</span>
                            <h2 style={{ fontSize: 20, margin: 0, color: '#1e293b' }}>ส่วนที่ 2: เครื่องมือจัดการเอกสาร (Document Tools)</h2>
                        </div>
                        <div className="card" style={{ padding: 32 }}>
                            <p style={{ fontSize: 14, color: '#475569', marginBottom: 20 }}>
                                เครื่องมือเสริมที่เปรียบเสมือนผู้ช่วยส่วนตัว เข้าใช้งานโดยคลิกแท็บ <strong>การจัดการเอกสาร</strong> ที่เมนูซ้ายมือ
                            </p>
                            
                            <div style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid #e2e8f0', marginBottom: 32, boxShadow: '0 4px 20px rgba(0,0,0,.08)' }}>
                                <img src="/@fs/C:/Users/USER/.gemini/antigravity/brain/b12a1933-a8f2-41d1-8146-0c7b64ad8f9a/tools_page_1772206212152.png" alt="หน้าเครื่องมือ" style={{ width: '100%', display: 'block' }} />
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 32 }}>
                                <div>
                                    <h3 style={{ fontSize: 15, color: '#0f172a', marginBottom: 8 }}>✂️ 1. แยก PDF (Split PDF)</h3>
                                    <p style={{ fontSize: 13, color: '#64748b', marginBottom: 8 }}>ใช้เมื่อลูกค้าส่งรวมไฟล์มายาวๆ แล้วเราต้องการแค่บางหน้า</p>
                                    <ul style={{ paddingLeft: 20, fontSize: 13, color: '#475569', lineHeight: 1.5, margin: 0 }}>
                                        <li>กดเลือกไฟล์ PDF ต้นฉบับ ระบบจะโชว์ภาพพรีวิวขนาดย่อของทุกหน้า</li>
                                        <li>คุณสามารถคลิกเลือกหน้า 1, 3, 5 แล้วกด "แยก PDF" ระบบจะตัดเฉพาะหน้าที่เลือกออกมาเป็นไฟล์ใหม่ให้ทันที!</li>
                                    </ul>
                                </div>
                                
                                <div>
                                    <h3 style={{ fontSize: 15, color: '#0f172a', marginBottom: 8 }}>📑 2. รวม PDF (Merge PDF)</h3>
                                    <p style={{ fontSize: 13, color: '#64748b', marginBottom: 8 }}>ตรงข้ามกับการแยก ใช้เมื่อต้องการนำเอกสารหลายๆ ใบมาเย็บเล่มส่ง</p>
                                    <div style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid #e2e8f0', marginBottom: 8 }}>
                                        <img src="/@fs/C:/Users/USER/.gemini/antigravity/brain/b12a1933-a8f2-41d1-8146-0c7b64ad8f9a/merge_pdf_tab_1772206470061.png" alt="รวมไฟล์" style={{ width: '100%', display: 'block' }} />
                                    </div>
                                    <ul style={{ paddingLeft: 20, fontSize: 13, color: '#475569', lineHeight: 1.5, margin: 0 }}>
                                        <li>ติ๊กเลือกไฟล์ PDF (ทางซ้ายมือ) ที่ต้องการจะรวมกัน (เลือกได้ 2 ไฟล์ขึ้นไป)</li>
                                        <li>พิมพ์ชื่อไฟล์ผลลัพธ์ใหม่ แล้วกดรวมไฟล์ โปรแกรมจะจับทั้งหมดมาประกบกัน</li>
                                    </ul>
                                </div>
                            </div>

                            <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 32, marginBottom: 32 }}>
                                <h3 style={{ fontSize: 16, color: '#0f172a', marginBottom: 8 }}>📸 3. รูปภาพเป็น PDF (Image to PDF)</h3>
                                <p style={{ fontSize: 13, color: '#64748b', marginBottom: 12 }}>เครื่องมือเด็ด! สำหรับการเปลี่ยนรูปถ่าย (Slip โอนเงิน, ใบเสร็จคาเฟ่) ให้กลายเป็น PDF ที่ดูเป็นมืออาชีพ</p>
                                <div style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid #e2e8f0', marginBottom: 16 }}>
                                    <img src="/@fs/C:/Users/USER/.gemini/antigravity/brain/b12a1933-a8f2-41d1-8146-0c7b64ad8f9a/image_to_pdf_tab_1772206476258.png" alt="แปลงรูปเป็น PDF" style={{ width: '100%', display: 'block' }} />
                                </div>
                                <ul style={{ paddingLeft: 20, fontSize: 14, color: '#475569', lineHeight: 1.6, margin: 0 }}>
                                    <li style={{ marginBottom: 6 }}>เลือกไฟล์รูปภาพนามสกุลทั่วไป (.JPG, .PNG) ไม่ว่าจะ 1 รูป หรือ 20 รูป</li>
                                    <li>ก่อนกดแปลง สามารถกำหนด <strong>ขนาดกระดาษ</strong> ได้ (เช่น A4, เล็กเท่ารูปต้นฉบับ ฯลฯ) เหมาะมากเวลาเอาสลิปโอนเงินไปแนบรวมกันใน A4 เพื่อปรินต์!</li>
                                </ul>
                            </div>

                            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: 24, borderRadius: 12 }}>
                                <h3 style={{ fontSize: 16, color: '#0f172a', marginBottom: 12 }}>✨ เครื่องมืออื่นๆ ที่น่าสนใจ!</h3>
                                <ul style={{ paddingLeft: 20, fontSize: 14, color: '#475569', lineHeight: 1.6, margin: 0 }}>
                                    <li style={{ marginBottom: 8 }}>🔓 <strong>ปลดล็อค PDF / ปลดล็อค Excel</strong>: กรอกรหัสต้นฉบับ (ถ้ามี) แล้วกดปลดล็อค ระบบจะสร้างไฟล์ขาวสะอาดไร้พาสเวิร์ดมาให้ทำงานต่อได้เลย</li>
                                    <li style={{ marginBottom: 8 }}>🖼️ <strong>PDF เป็นภาพ</strong>: แปลงหนังสือราชการออกมาเป็นไฟล์ JPG ตัดปัญหาเวลานำไปอัพโหลดใส่ระบบอื่นๆ ที่บังคับแต่สกุลรูปภาพ</li>
                                    <li style={{ marginBottom: 8 }}>🖼️ <strong>แปลงแบบชาว Apple (แปลง HEIC)</strong>: ปราบเซียนรูปถ่ายที่โอนมาจาก iOS ยกดแปลงม้วนเดียว จบออกมาเป็น JPG ปกติที่คอมพิวเตอร์ทั่วไปเปิดดูได้สบาย!</li>
                                    <li>📦 <strong>แตกและรวมไฟล์ ZIP / RAR</strong>: ไม่ต้องโหลด WinRAR อีกต่อไป จัดการแพ็คและแตกไฟล์ตรงๆ ได้เลย</li>
                                </ul>
                                
                                <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', padding: 12, borderRadius: 8, marginTop: 16 }}>
                                    <span style={{ color: '#1d4ed8', fontSize: 13, fontWeight: 500 }}>
                                        🛡️ ฟังก์ชันทั้งหมดถูกทำมาให้ "ทำงานเบ็ดเสร็จ (Offline-Friendly)" ภายในคอมพิวเตอร์ของคุณเอง เพื่อประสิทธิผลขั้นสุดและความปลอดภัยของเอกสารชั้นความลับของบริษัท
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div style={{ textAlign: 'center', padding: '20px 0', color: '#94a3b8', fontSize: 13 }}>
                            © 2026 DocSort Pro • ระบบจัดการเอกสารมืออาชีพ
                        </div>

                    </div>
                </div>
            </main>
        </div>
    )
}
