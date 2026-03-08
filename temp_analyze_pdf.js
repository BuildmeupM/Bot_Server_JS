const fs = require('fs');
const https = require('https');
const { PDFDocument } = require('pdf-lib');

async function analyze() {
    const url = "https://www.rd.go.th/fileadmin/tax_pdf/withhold/approve_wh3_081156.pdf";
    console.log("Downloading PDF...");
    
    const file = fs.createWriteStream("temp_doc.pdf");
    https.get(url, function(response) {
        response.pipe(file);
        file.on('finish', async function() {
            file.close();
            console.log("Download complete. Analyzing...");
            try {
                const pdfBytes = fs.readFileSync("temp_doc.pdf");
                const pdfDoc = await PDFDocument.load(pdfBytes);
                
                console.log(`Number of Pages: ${pdfDoc.getPageCount()}`);
                console.log(`Title: ${pdfDoc.getTitle()}`);
                console.log(`Author: ${pdfDoc.getAuthor()}`);
                console.log(`Creation Date: ${pdfDoc.getCreationDate()}`);
                console.log(`Modification Date: ${pdfDoc.getModificationDate()}`);
                
                const form = pdfDoc.getForm();
                const fields = form.getFields();
                console.log(`\nForm Fields found: ${fields.length}`);
                
                if (fields.length > 0) {
                    console.log("First 30 fields:");
                    fields.slice(0, 30).forEach(field => {
                        console.log(`- ${field.getName()} (${field.constructor.name})`);
                    });
                } else {
                    console.log("No interactive form fields found.");
                }
            } catch (err) {
                console.error("Error analyzing PDF:", err);
            }
        });
    }).on('error', function(err) {
        console.error("Download error:", err);
    });
}

analyze();
