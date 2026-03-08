const { fixBranch } = require('./backend/routes/ocr/postprocess');

// Test fixBranch with values extracted from address
const tests = [
    { input: 'สำนักงานใหญ่', expected: '00000' },
    { input: 'สาขา 69', expected: '00069' },
    { input: 'สาขา 1', expected: '00001' },
    { input: 'สาขาที่ 25', expected: '00025' },
    { input: null, expected: '00000' },
];

let allPass = true;
for (const t of tests) {
    const result = fixBranch(t.input);
    const pass = result === t.expected;
    console.log(`  ${pass ? '✅' : '❌'} fixBranch(${JSON.stringify(t.input)}) → "${result}" (expected: "${t.expected}")`);
    if (!pass) allPass = false;
}

// Test extractBranchFromAddress simulation
// The address: "สาขาที่ 00069 สาขาศาลายา : 87/18 หมู่ที่ 3..."
const testAddress = "สาขาที่ 00069 สาขาศาลายา : 87/18 หมู่ที่ 3 ต.ศาลายา อ.พุทธมณฑล จ.นครปฐม 73170";
const m = testAddress.match(/(?:สาขา(?:ที่)?|branch)\s*(\d+)/i);
const branchFromAddr = m ? `สาขา ${parseInt(m[1], 10)}` : null;
const finalBranch = fixBranch(branchFromAddr);
const addrPass = finalBranch === '00069';
console.log(`\n  ${addrPass ? '✅' : '❌'} extractBranch("${testAddress.substring(0,30)}...") → "${branchFromAddr}" → fixBranch → "${finalBranch}" (expected: "00069")`);
if (!addrPass) allPass = false;

console.log(`\n${allPass ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`);
