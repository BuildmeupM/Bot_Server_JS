const { chromium } = require("playwright");

(async () => {
  console.log("🚀 เปิด Browser เพื่อให้คุณตรวจสอบหน้าเว็บ...");
  const browser = await chromium.launch({ headless: false, args: ["--start-maximized"] });
  const context = await browser.newContext({ viewport: null });
  const page = await context.newPage();

  console.log("🔗 เข้าหน้า Login PEAK...");
  await page.goto("https://secure.peakaccount.com/", { waitUntil: "domcontentloaded", timeout: 30000 });

  console.log("⏳ รอฟอร์ม Login โหลด...");
  const emailInput = page.locator("input[placeholder='กรุณากรอกข้อมูลอีเมล']");
  await emailInput.waitFor({ state: "visible", timeout: 15000 });

  console.log("📧 เลียนแบบการเข้าระบบ...");
  await emailInput.fill("buildmeupbot@gmail.com");
  
  const passwordInput = page.locator("input[placeholder='รหัสผ่าน']");
  await passwordInput.fill("Buildmeupbot.1");

  const loginBtn = page.locator("button:has-text('เข้าสู่ระบบ')");
  await loginBtn.click();

  console.log("✅ Login ส่งไปแล้ว กำลังรอหน้าถัดไป...");
  try {
    await page.waitForURL(/.*(?:selectlist|dashboard).*/, { timeout: 30000 });
  } catch (e) {
    console.log("⚠️ อาจจะยังรอเข้าสู่ระบบอยู่...");
  }

  console.log("🏢 เลือกรหัสบริษัท MzIwNjE5...");
  const peakCode = "MzIwNjE5";
  try {
    const profileBtn = page.locator(`a[href*="/${peakCode}"]`);
    if (await profileBtn.isVisible()) {
      await profileBtn.click();
      await page.waitForTimeout(3000);
    }
  } catch(e) {}

  console.log("📝 กำลังไปที่หน้า บันทึกบัญชีค่าใช้จ่าย...");
  await page.goto(`https://secure.peakaccount.com/${peakCode}/expenses/record`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);

  console.log("⚠️ สมมติว่ากด เพิ่มผู้ติดต่อ...");
  const addContactBtn = page.getByText("+ เพิ่มผู้ติดต่อใหม่");
  if (await addContactBtn.isVisible()) {
      await addContactBtn.click();
  } else {
      const altAdd = page.getByText("+ เพิ่มผู้ติดต่อ");
      if (await altAdd.isVisible()) {
          await altAdd.click();
      }
  }
  await page.waitForTimeout(2000);

  const vendorTaxIdInput = page.locator("input[placeholder*='กรุณาระบุเลขทะเบียน']").first();
  if (await vendorTaxIdInput.isVisible()) {
      console.log("✍️ พิมพ์เลขประจำตัวผู้เสียภาษี 0107567000414...");
      // Type slowly to simulate bot
      await vendorTaxIdInput.pressSequentially("0107567000414", { delay: 50 });
      await page.waitForTimeout(1000);
      
      const branchInput = page.locator('input[placeholder="กรุณาระบุรหัสสาขา"], input[placeholder="รหัสสาขา"]').first();
      await branchInput.fill("00069");
      await page.waitForTimeout(1000);

      const searchBtn = page.getByRole("button", { name: /ค้นหา/ }).first();
      await searchBtn.click();
      console.log("🔍 กดค้นหาข้อมูลจากระบบกรมพัฒน์ฯ...");
      await page.waitForTimeout(4000); // Wait for load
  }

  console.log("🛑 หยุดการทำงานของสคริปต์ชั่วคราว ให้คุณกดดูหน้าเว็บได้เลย!");
  console.log("เมื่อดูเสร็จแล้ว ให้กดปุ่ม Play (Resume) บนหน้าต่าง Playwright Inspector เพื่อปิด");
  
  // Pause allows the user to inspect the UI manually
  await page.pause();

  console.log("ปิด Browser...");
  await browser.close();
})();
