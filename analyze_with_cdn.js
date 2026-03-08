const https = require('https');
const fs = require('fs');

const pdfPath = "C:\\Users\\BMU-17\\.gemini\\antigravity\\brain\\8eb62aef-a890-4e6a-aabd-1f96e9372c9a\\.tempmediaStorage\\4c4e70678fd7b328.pdf";

https.get('https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.js', (res) => {
    let code = '';
    res.on('data', d => code += d);
    res.on('end', async () => {
        try {
            // Write it to a file so we can require it
            fs.writeFileSync('temp_pdf_lib.js', code);
            const PDFLib = require('./temp_pdf_lib.js');
            const { PDFDocument } = PDFLib;
            
            const pdfBytes = fs.readFileSync(pdfPath);
            const pdfDoc = await PDFDocument.load(pdfBytes);
            
            console.log(`Number of Pages: ${pdfDoc.getPageCount()}`);
            console.log(`Title: ${pdfDoc.getTitle()}`);
            console.log(`Author: ${pdfDoc.getAuthor()}`);
            console.log(`Creation Date: ${pdfDoc.getCreationDate()}`);
            
            const form = pdfDoc.getForm();
            const fields = form.getFields();
            console.log(`\nForm Fields found: ${fields.length}`);
            
            if (fields.length > 0) {
                console.log("Fields:");
                fields.forEach(field => {
                    console.log(`- ${field.getName()} (${field.constructor.name})`);
                });
            } else {
                console.log("No interactive form fields found.");
            }
        } catch (e) {
            console.error("Error analyzing:", e);
        }
    });
}).on('error', e => console.error("Download error:", e));
