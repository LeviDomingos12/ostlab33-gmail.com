import { Transaction, SystemSettings } from "../types";
import { getFormattedSystemVersion } from "./versionManager";

export function printInvoiceHTML(tx: Transaction, settings: SystemSettings) {
  const currency = settings.currency || "MT";
  const companyName = settings.companyName || "Indisponível";
  const address = settings.companyAddress || settings.storeAddress || "Indisponível";
  const nuit = settings.companyNuit || "Indisponível";
  const contact = settings.storeContact || "Indisponível";
  const logo = settings.logoUrl || "";
  const certificationNumber = settings.fiscalCertificationNumber || "Indisponível";

  const printWindow = window.open("", "_blank", "width=800,height=900");
  if (!printWindow) {
    alert("Por favor, permita pop-ups para imprimir a fatura.");
    return;
  }

  // Calculate some numbers
  const formattedDate = new Date(tx.timestamp).toLocaleString();
  const itemsRows = tx.items.map((item, index) => `
    <tr>
      <td style="text-align: center;">${String(index + 1).padStart(2, "0")}</td>
      <td>
        <div style="font-weight: 600; color: #1e293b;">${item.productName}</div>
      </td>
      <td style="text-align: center;">${item.quantity}</td>
      <td style="text-align: right;">${item.price.toLocaleString()} ${currency}</td>
      <td style="text-align: right; font-weight: 600;">${(item.price * item.quantity).toLocaleString()} ${currency}</td>
    </tr>
  `).join("");

  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(tx.invoiceNumber)}`;

  const htmlContent = `
    <!DOCTYPE html>
    <html lang="pt">
    <head>
      <meta charset="UTF-8">
      <title>Fatura #${tx.invoiceNumber} - ${companyName}</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap');
        
        * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }

        body {
          font-family: 'Inter', sans-serif;
          background-color: #f8fafc;
          color: #334155;
          line-height: 1.5;
          padding: 40px 20px;
          display: flex;
          justify-content: center;
          align-items: flex-start;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }

        .receipt-card {
          background: #ffffff;
          width: 100%;
          max-width: 680px;
          border-radius: 20px;
          box-shadow: 0 10px 25px -5px rgba(0,0,0,0.05), 0 8px 10px -6px rgba(0,0,0,0.05);
          border: 1px solid #e2e8f0;
          padding: 40px;
          position: relative;
        }

        /* Company Header */
        .header {
          text-align: center;
          border-bottom: 2px dashed #e2e8f0;
          padding-bottom: 24px;
          margin-bottom: 24px;
        }

        .logo-container {
          margin-bottom: 12px;
        }

        .logo {
          width: 64px;
          height: 64px;
          object-fit: contain;
          border-radius: 12px;
          border: 1px solid #e2e8f0;
          padding: 4px;
          background: #fff;
        }

        .company-name {
          font-size: 20px;
          font-weight: 800;
          color: #0f172a;
          letter-spacing: -0.025em;
          text-transform: uppercase;
        }

        .company-info {
          font-size: 12px;
          color: #64748b;
          margin-top: 4px;
        }

        /* Document Metadata */
        .metadata-section {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
          margin-bottom: 24px;
          font-size: 13px;
        }

        .meta-box {
          background-color: #f8fafc;
          border-radius: 12px;
          padding: 16px;
          border: 1px solid #f1f5f9;
        }

        .meta-title {
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          color: #94a3b8;
          letter-spacing: 0.05em;
          margin-bottom: 6px;
        }

        .meta-value {
          font-weight: 600;
          color: #1e293b;
        }

        .meta-mono {
          font-family: 'JetBrains Mono', monospace;
          font-size: 12px;
        }

        /* Items Table */
        .items-table-container {
          margin-bottom: 24px;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          overflow: hidden;
        }

        .items-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 13px;
        }

        .items-table th {
          background-color: #f8fafc;
          font-weight: 700;
          color: #475569;
          text-transform: uppercase;
          font-size: 11px;
          letter-spacing: 0.05em;
          padding: 12px 16px;
          border-bottom: 1px solid #e2e8f0;
        }

        .items-table td {
          padding: 14px 16px;
          border-bottom: 1px solid #f1f5f9;
        }

        .items-table tr:last-child td {
          border-bottom: none;
        }

        /* Financial Summary */
        .summary-container {
          display: flex;
          justify-content: flex-end;
          margin-bottom: 30px;
        }

        .summary-box {
          width: 100%;
          max-width: 300px;
          display: flex;
          flex-direction: column;
          gap: 8px;
          font-size: 13px;
        }

        .summary-row {
          display: flex;
          justify-content: space-between;
          color: #64748b;
        }

        .summary-row.discount {
          color: #ef4444;
          font-weight: 500;
        }

        .summary-row.grand-total {
          border-top: 1px solid #e2e8f0;
          padding-top: 12px;
          font-size: 16px;
          font-weight: 800;
          color: #0f172a;
        }

        /* Footer Certification & QR Code */
        .footer-cert {
          border-top: 2px dashed #e2e8f0;
          padding-top: 24px;
          text-align: center;
        }

        .qr-section {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 8px;
          margin-bottom: 20px;
        }

        .qr-box {
          padding: 8px;
          background: #ffffff;
          border-radius: 12px;
          border: 1px solid #e2e8f0;
          display: inline-block;
        }

        .qr-image {
          width: 100px;
          height: 100px;
          display: block;
        }

        .cert-badge {
          display: inline-block;
          background-color: #f0fdf4;
          border: 1px solid #bbf7d0;
          color: #166534;
          font-size: 10px;
          font-weight: 700;
          padding: 4px 12px;
          border-radius: 9999px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin-bottom: 12px;
        }

        .fiscal-details {
          font-family: 'JetBrains Mono', monospace;
          font-size: 10px;
          color: #64748b;
          line-height: 1.6;
          max-width: 480px;
          margin: 0 auto;
          background-color: #f8fafc;
          border-radius: 8px;
          padding: 12px;
          border: 1px solid #f1f5f9;
        }

        .fiscal-row {
          display: flex;
          justify-content: space-between;
          border-bottom: 1px solid #f1f5f9;
          padding: 4px 0;
        }

        .fiscal-row:last-child {
          border-bottom: none;
        }

        .fiscal-key {
          font-weight: 700;
          color: #334155;
        }

        .thank-you {
          margin-top: 24px;
          font-size: 12px;
          font-weight: 600;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        /* Print Actions (No-print) */
        .actions-bar {
          display: flex;
          justify-content: center;
          gap: 12px;
          margin-bottom: 24px;
          width: 100%;
          max-width: 680px;
          margin-left: auto;
          margin-right: auto;
        }

        .btn {
          font-family: 'Inter', sans-serif;
          font-size: 13px;
          font-weight: 700;
          padding: 12px 24px;
          border-radius: 12px;
          cursor: pointer;
          transition: all 0.2s ease;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          text-transform: uppercase;
        }

        .btn-primary {
          background-color: #0f172a;
          color: #ffffff;
          border: none;
          box-shadow: 0 4px 6px -1px rgba(15,23,42,0.1), 0 2px 4px -2px rgba(15,23,42,0.1);
        }

        .btn-primary:hover {
          background-color: #1e293b;
        }

        .btn-secondary {
          background-color: #ffffff;
          color: #475569;
          border: 1px solid #cbd5e1;
        }

        .btn-secondary:hover {
          background-color: #f8fafc;
          color: #1e293b;
        }

        @media print {
          body {
            background-color: #ffffff;
            padding: 0;
          }

          .receipt-card {
            box-shadow: none;
            border: none;
            padding: 0;
            max-width: 100%;
          }

          .actions-bar {
            display: none !important;
          }
        }
      </style>
    </head>
    <body>
      <div style="display: flex; flex-direction: column; align-items: center; width: 100%;">
        <!-- Actions Bar -->
        <div class="actions-bar">
          <button class="btn btn-secondary" onclick="window.close()">Fechar Janela</button>
          <button class="btn btn-primary" onclick="window.print()">Imprimir Fatura</button>
        </div>

        <!-- Receipt Card -->
        <div class="receipt-card">
          <!-- Header -->
          <div class="header">
            ${logo ? `
              <div class="logo-container">
                <img src="${logo}" alt="Logo" class="logo" />
              </div>
            ` : ""}
            <h1 class="company-name">${companyName}</h1>
            <p class="company-info">${address}</p>
            <p class="company-info" style="font-weight: 500; color: #475569;">NUIT: ${nuit} | Tel: ${contact}</p>
          </div>

          <!-- Metadata -->
          <div class="metadata-section">
            <div class="meta-box">
              <div class="meta-title">Dados do Documento</div>
              <div class="meta-value meta-mono" style="color: #0f172a; font-size: 14px; font-weight: 700; margin-bottom: 4px;">
                ${tx.invoiceNumber}
              </div>
              <div style="color: #64748b; font-size: 11px;">
                Emissão: <span style="font-weight: 500; color: #334155;">${formattedDate}</span>
              </div>
              <div style="color: #64748b; font-size: 11px;">
                Filial: <span style="font-weight: 500; color: #334155; text-transform: uppercase;">${tx.branchId || "Central"}</span>
              </div>
            </div>

            <div class="meta-box">
              <div class="meta-title">Cliente & Operador</div>
              <div class="meta-value" style="margin-bottom: 4px;">
                ${tx.customerName || "Consumidor Geral"}
              </div>
              ${tx.nuit ? `
                <div style="color: #64748b; font-size: 11px;">
                  NUIT Cliente: <span style="font-weight: 500; color: #334155;">${tx.nuit}</span>
                </div>
              ` : ""}
              <div style="color: #64748b; font-size: 11px;">
                Operador: <span style="font-weight: 500; color: #334155;">${tx.cashierName}</span>
              </div>
            </div>
          </div>

          <!-- Items Table -->
          <div class="items-table-container">
            <table class="items-table">
              <thead>
                <tr>
                  <th style="width: 50px; text-align: center;">Item</th>
                  <th style="text-align: left;">Descrição</th>
                  <th style="width: 60px; text-align: center;">Qtd</th>
                  <th style="width: 110px; text-align: right;">P. Unitário</th>
                  <th style="width: 120px; text-align: right;">Total</th>
                </tr>
              </thead>
              <tbody>
                ${itemsRows}
              </tbody>
            </table>
          </div>

          <!-- Summary -->
          <div class="summary-container">
            <div class="summary-box">
              <div class="summary-row">
                <span>Subtotal</span>
                <span style="font-family: 'JetBrains Mono', monospace;">${tx.subtotal.toLocaleString()} ${currency}</span>
              </div>
              ${tx.discountTotal > 0 ? `
                <div class="summary-row discount">
                  <span>Desconto</span>
                  <span style="font-family: 'JetBrains Mono', monospace;">-${tx.discountTotal.toLocaleString()} ${currency}</span>
                </div>
              ` : ""}
              <div class="summary-row">
                <span>IVA Incluído</span>
                <span style="font-family: 'JetBrains Mono', monospace;">${tx.vatTotal.toLocaleString()} ${currency}</span>
              </div>
              <div class="summary-row grand-total">
                <span>Total Pago</span>
                <span style="font-family: 'JetBrains Mono', monospace;">${tx.grandTotal.toLocaleString()} ${currency}</span>
              </div>
              ${(tx.paymentMethod === "CASH" || tx.amountPaid != null) ? `
                <div class="summary-row" style="color: #059669; font-weight: 600; margin-top: 4px;">
                  <span>Valor Entregue (Dinheiro)</span>
                  <span style="font-family: 'JetBrains Mono', monospace;">${(tx.amountPaid || tx.grandTotal).toLocaleString()} ${currency}</span>
                </div>
                <div class="summary-row" style="color: #0284c7; font-weight: 600;">
                  <span>Troco Devolvido</span>
                  <span style="font-family: 'JetBrains Mono', monospace;">${(tx.changeAmount || 0).toLocaleString()} ${currency}</span>
                </div>
              ` : ""}
              <div style="text-align: right; margin-top: 4px; font-size: 11px; color: #64748b; font-style: italic;">
                Método de Pagamento: <strong>${tx.paymentMethod}</strong>
                ${tx.paymentDetails ? `<br><span style="color: #64748b; font-weight: normal;">(${tx.paymentDetails})</span>` : ""}
              </div>
            </div>
          </div>

          <!-- Fiscal Section / Footer -->
          <div class="footer-cert">
            <div class="qr-section">
              <div class="qr-box">
                <img class="qr-image" src="${qrCodeUrl}" alt="Código QR Fiscal" />
              </div>
              <span class="cert-badge">Documento Fiscal Homologado</span>
            </div>

            <div class="fiscal-details">
              <div class="fiscal-row">
                <span>Autoridade Tributária (AT):</span>
                <span style="font-weight: 700;">PROCESSO DE CERTIFICAÇÃO</span>
              </div>
              <div class="fiscal-row">
                <span>Certificado Nº:</span>
                <span class="fiscal-key">${certificationNumber}</span>
              </div>
              ${tx.fiscalKeys ? `
                <div class="fiscal-row">
                  <span>Chaves de Assinatura:</span>
                  <span class="fiscal-key">${tx.fiscalKeys}</span>
                </div>
              ` : ""}
              ${tx.fiscalHash ? `
                <div class="fiscal-row">
                  <span>Assinatura Digital (Hash):</span>
                  <span style="word-break: break-all; text-align: right;">${tx.fiscalHash}</span>
                </div>
              ` : ""}
              <div class="fiscal-row">
                <span>Software de Faturação:</span>
                <span>OST VENDAS ERP ${getFormattedSystemVersion()}</span>
              </div>
            </div>

            <p class="thank-you">*** Muito obrigado pela preferência! Volte sempre! ***</p>
          </div>
        </div>
      </div>

      <script>
        // Auto print upon load
        window.addEventListener('DOMContentLoaded', () => {
          setTimeout(() => {
            window.print();
          }, 350);
        });
      </script>
    </body>
    </html>
  `;

  printWindow.document.write(htmlContent);
  printWindow.document.close();
}

/**
 * Generates and triggers print for a specific 80mm thermal receipt layout.
 */
export function printThermal80mmReceipt(tx: Transaction, settings: SystemSettings) {
  const currency = settings.currency || "MT";
  const companyName = settings.companyName || "Indisponível";
  const address = settings.companyAddress || settings.storeAddress || "Indisponível";
  const nuit = settings.companyNuit || "Indisponível";
  const contact = settings.storeContact || "Indisponível";
  const logo = settings.logoUrl || "";
  const certificationNumber = settings.fiscalCertificationNumber || "Indisponível";
  
  const marginTop = settings.thermalMarginTop !== undefined ? settings.thermalMarginTop : 4;
  const marginBottom = settings.thermalMarginBottom !== undefined ? settings.thermalMarginBottom : 8;

  const printWindow = window.open("", "_blank", "width=420,height=750");
  if (!printWindow) {
    alert("Por favor, permita pop-ups para imprimir o recibo térmico de 80mm.");
    return;
  }

  const formattedDate = new Date(tx.timestamp).toLocaleString("pt-MZ");
  const itemsRows = tx.items.map((item) => `
    <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
      <span style="font-weight: 600; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding-right: 4px;">
        ${item.productName}
      </span>
      <span style="white-space: nowrap; font-weight: 700;">
        ${item.quantity}x ${(item.price * item.quantity).toLocaleString("pt-MZ")} ${currency}
      </span>
    </div>
    <div style="font-size: 9px; color: #444; margin-bottom: 4px; padding-left: 8px;">
      @ ${item.price.toLocaleString("pt-MZ")} ${currency}/un
    </div>
  `).join("");

  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(tx.invoiceNumber)}`;

  const htmlContent = `
    <!DOCTYPE html>
    <html lang="pt">
    <head>
      <meta charset="UTF-8">
      <title>Recibo Térmico 80mm #${tx.invoiceNumber}</title>
      <style>
        @page {
          size: 80mm auto;
          margin: ${marginTop}mm 0mm ${marginBottom}mm 0mm;
        }

        * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }

        body {
          font-family: 'Courier New', Courier, monospace, sans-serif;
          background-color: #ffffff;
          color: #000000;
          line-height: 1.25;
          font-size: 11px;
          padding: ${marginTop}mm 4px ${marginBottom}mm 4px;
          display: flex;
          flex-direction: column;
          align-items: center;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }

        .receipt-container {
          width: 76mm;
          max-width: 80mm;
          background: #ffffff;
          color: #000000;
        }

        .header {
          text-align: center;
          border-bottom: 1px dashed #000000;
          padding-bottom: 8px;
          margin-bottom: 8px;
        }

        .logo {
          max-width: 48mm;
          max-height: 20mm;
          object-fit: contain;
          filter: grayscale(100%) contrast(200%);
          margin-bottom: 4px;
        }

        .company-title {
          font-size: 14px;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 2px;
        }

        .store-info {
          font-size: 9.5px;
          color: #222222;
        }

        .meta-section {
          border-bottom: 1px dashed #000000;
          padding-bottom: 6px;
          margin-bottom: 6px;
          font-size: 10px;
        }

        .meta-row {
          display: flex;
          justify-content: space-between;
          margin-bottom: 2px;
        }

        .meta-label {
          color: #444444;
        }

        .meta-val {
          font-weight: 700;
        }

        .items-section {
          border-bottom: 1px dashed #000000;
          padding-bottom: 6px;
          margin-bottom: 6px;
        }

        .items-header {
          display: flex;
          justify-content: space-between;
          font-weight: 900;
          font-size: 10px;
          border-bottom: 1px dashed #000000;
          padding-bottom: 4px;
          margin-bottom: 6px;
        }

        .summary-section {
          text-align: right;
          border-bottom: 1px dashed #000000;
          padding-bottom: 6px;
          margin-bottom: 6px;
          font-size: 10.5px;
        }

        .summary-row {
          display: flex;
          justify-content: space-between;
          margin-bottom: 2px;
        }

        .total-row {
          font-size: 13px;
          font-weight: 900;
          border-top: 1px dashed #000000;
          border-bottom: 1px dashed #000000;
          padding: 4px 0;
          margin-top: 4px;
          margin-bottom: 4px;
        }

        .qr-container {
          text-align: center;
          margin: 8px 0;
        }

        .qr-image {
          width: 30mm;
          height: 30mm;
          image-rendering: pixelated;
        }

        .fiscal-box {
          font-size: 8.5px;
          text-align: center;
          border-top: 1px dashed #000000;
          padding-top: 6px;
          margin-top: 6px;
          word-break: break-all;
        }

        .footer-thanks {
          text-align: center;
          font-weight: 700;
          font-size: 10px;
          margin-top: 8px;
          border-top: 1px dashed #000000;
          padding-top: 6px;
        }

        .actions-bar {
          display: flex;
          justify-content: center;
          gap: 10px;
          margin-bottom: 12px;
          width: 100%;
        }

        .btn {
          font-family: sans-serif;
          font-size: 11px;
          font-weight: 700;
          padding: 8px 16px;
          border-radius: 8px;
          cursor: pointer;
          border: none;
        }

        .btn-print {
          background-color: #f97316;
          color: #ffffff;
        }

        .btn-close {
          background-color: #e2e8f0;
          color: #334155;
        }

        @media print {
          .actions-bar {
            display: none !important;
          }
          body {
            padding: 0 !important;
          }
        }
      </style>
    </head>
    <body>
      <div class="actions-bar">
        <button class="btn btn-close" onclick="window.close()">Fechar</button>
        <button class="btn btn-print" onclick="window.print()">🖨️ Imprimir Recibo 80mm</button>
      </div>

      <div class="receipt-container">
        <!-- Header -->
        <div class="header">
          ${logo ? `<img src="${logo}" class="logo" alt="Logo" />` : ''}
          <div class="company-title">${companyName}</div>
          <div class="store-info">${address}</div>
          <div class="store-info">NUIT: ${nuit} | Tel: ${contact}</div>
        </div>

        <!-- Metadata -->
        <div class="meta-section">
          <div class="meta-row">
            <span class="meta-label">DOCUMENTO:</span>
            <span class="meta-val">${tx.invoiceNumber}</span>
          </div>
          <div class="meta-row">
            <span class="meta-label">DATA/HORA:</span>
            <span class="meta-val">${formattedDate}</span>
          </div>
          <div class="meta-row">
            <span class="meta-label">OPERADOR:</span>
            <span class="meta-val">${tx.cashierName}</span>
          </div>
          <div class="meta-row">
            <span class="meta-label">CLIENTE:</span>
            <span class="meta-val">${tx.customerName || "Consumidor Geral"}</span>
          </div>
          ${tx.nuit ? `
            <div class="meta-row">
              <span class="meta-label">NUIT CLIENTE:</span>
              <span class="meta-val">${tx.nuit}</span>
            </div>
          ` : ''}
        </div>

        <!-- Items -->
        <div class="items-section">
          <div class="items-header">
            <span>ARTIGO</span>
            <span>QTD x TOTAL</span>
          </div>
          ${itemsRows}
        </div>

        <!-- Totals Summary -->
        <div class="summary-section">
          <div class="summary-row">
            <span>SUBTOTAL:</span>
            <span>${tx.subtotal.toLocaleString("pt-MZ")} ${currency}</span>
          </div>
          ${tx.discountTotal > 0 ? `
            <div class="summary-row" style="color: #000; font-weight: 700;">
              <span>DESCONTO:</span>
              <span>-${tx.discountTotal.toLocaleString("pt-MZ")} ${currency}</span>
            </div>
          ` : ''}
          <div class="summary-row">
            <span>IVA (16% Incluído):</span>
            <span>${tx.vatTotal.toLocaleString("pt-MZ")} ${currency}</span>
          </div>

          <div class="summary-row total-row">
            <span>TOTAL PAGO:</span>
            <span>${tx.grandTotal.toLocaleString("pt-MZ")} ${currency}</span>
          </div>

          ${(tx.paymentMethod === "CASH" || tx.amountPaid != null) ? `
            <div class="summary-row" style="color: #000; font-weight: 600;">
              <span>RECEBIDO (DINHEIRO):</span>
              <span>${(tx.amountPaid || tx.grandTotal).toLocaleString("pt-MZ")} ${currency}</span>
            </div>
            <div class="summary-row" style="color: #000; font-weight: 600;">
              <span>TROCO DEVOLVIDO:</span>
              <span>${(tx.changeAmount || 0).toLocaleString("pt-MZ")} ${currency}</span>
            </div>
          ` : ''}

          <div class="summary-row" style="margin-top: 4px;">
            <span>MÉTODO:</span>
            <span style="font-weight: 700;">${tx.paymentMethod}</span>
          </div>
          ${tx.paymentDetails ? `
            <div style="font-size: 9.5px; color: #333;">(${tx.paymentDetails})</div>
          ` : ''}
        </div>

        <!-- QR Code -->
        <div class="qr-container">
          <img src="${qrCodeUrl}" class="qr-image" alt="QR Recibo Digital" />
          <div style="font-size: 8.5px; font-weight: 700; margin-top: 2px;">RECIBO DIGITAL #${tx.invoiceNumber}</div>
        </div>

        <!-- Fiscal Certification -->
        ${tx.fiscalCertified ? `
          <div class="fiscal-box">
            <div><strong>DOCUMENTO FISCAL HOMOLOGADO</strong></div>
            <div>Certificado: ${certificationNumber}</div>
            ${tx.fiscalKeys ? `<div>Chave: ${tx.fiscalKeys}</div>` : ''}
            ${tx.fiscalHash ? `<div style="font-size: 7.5px;">Hash: ${tx.fiscalHash}</div>` : ''}
          </div>
        ` : ''}

        <!-- Footer -->
        <div class="footer-thanks">
          *** OBRIGADO PELA PREFERÊNCIA! ***<br>
          <span style="font-size: 8px; font-weight: normal;">Processado por Computador / OST VENDAS</span>
        </div>
      </div>

      <script>
        window.addEventListener('DOMContentLoaded', () => {
          setTimeout(() => {
            window.print();
          }, 350);
        });
      </script>
    </body>
    </html>
  `;

  printWindow.document.write(htmlContent);
  printWindow.document.close();
}
