const { chromium } = require("playwright");

(async () => {
    console.log("🚀 กำลังเข้าสู่ระบบและดึงโครงสร้างหน้าจอ เพิ่มผู้ติดต่อ...");
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
        await page.goto("https://secure.peakaccount.com/", { waitUntil: "domcontentloaded", timeout: 30000 });
        console.log("📧 กำลังเข้าสู่ระบบ...");
        await page.locator("input[placeholder='กรุณากรอกข้อมูลอีเมล']").fill("buildmeupbot@gmail.com");
        await page.locator("input[placeholder='รหัสผ่าน']").fill("Buildmeupbot.1");
        await page.locator("button:has-text('เข้าสู่ระบบ')").click();
        
        await page.waitForURL(/.*(?:selectlist|dashboard).*/, { timeout: 30000 });
        console.log("✅ เข้าสู่ระบบสำเร็จ");

        console.log("📝 กำลังไปที่หน้า บันทึกข่ายใช้จ่าย (บริษัท MZ|WNjE5)...");
        await page.goto("https://secure.peakaccount.com/expense/invoiceCreate?emi=MzIwNjE5", { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(3000);

        // หาช่องผู้ติดต่อและคลิกเพิ่ม
        const vendorTaxIdInput = page.locator("input[placeholder*='กรุณาระบุเลขทะเบียน']").first();
        let clickedAdd = false;
        
        // ลองเขียนเลขมั่วๆ เพื่อให้ Dropdown โผล่ แล้วกดเพิ่ม
        if (await vendorTaxIdInput.isVisible()) {
            await vendorTaxIdInput.pressSequentially("0107567000414", { delay: 10 });
            await page.waitForTimeout(1000);
            const addContactOption = page.locator(".multiselect__option").filter({ hasText: "เพิ่มผู้ติดต่อ" }).first();
            if (await addContactOption.isVisible()) {
                 await addContactOption.click();
                 clickedAdd = true;
            } else {
                 const addContactBtn = page.getByText("+ เพิ่มผู้ติดต่อ", { exact: false }).first();
                 if (await addContactBtn.isVisible()) {
                     await addContactBtn.click({ force: true });
                     clickedAdd = true;
                 }
            }
        }

        if (!clickedAdd) {
            console.log("ย้อนไปกดเพิ่มผู้ติดต่อแบบทางตรง (เผื่อปุ่มบนแถบบาร์)");
            const directAddBtn = page.getByText("+ เพิ่มผู้ติดต่อใหม่");
            if (await directAddBtn.isVisible()) await directAddBtn.click();
        }

        console.log("⏳ รอ Modal โหลด...");
        await page.waitForTimeout(2000);

        // ดึงเฉพาะโครงสร้างของหน้าต่าง Modal
        const modalHtml = await page.evaluate(() => {
            const modal = document.querySelector('.el-dialog, .modal-content, [role="dialog"], #AddcontactBox');
            if (!modal) return "ไม่พบ Modal";
            
            // สกัดข้อมูล input/label ออกมา
            const inputs = Array.from(modal.querySelectorAll('input, select, textarea, label, button, .radio, .checkbox')).map(el => {
                let text = el.innerText || el.textContent || '';
                text = text.replace(/\n/g, ' ').trim();
                return `[${el.tagName}] ` + 
                       (el.type ? `type=${el.type} ` : '') +
                       (el.placeholder ? `placeholder="${el.placeholder}" ` : '') +
                       (el.id ? `id="${el.id}" ` : '') +
                       (el.name ? `name="${el.name}" ` : '') +
                       (text ? `text="${text}" ` : '');
            });
            return inputs.join('\n');
        });

        console.log("\n================ โครงสร้าง Modal (ย่อ) ================\n");
        console.log(modalHtml);
        console.log("\n========================================================\n");
    } catch(e) {
        console.log("Error:", e);
    } finally {
        await browser.close();
    }
})();
