import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { SystemSettings, CashClosure } from "../../types";

export const getBase64ImageFromUrl = async (imageUrl: string): Promise<string> => {
  if (!imageUrl) return "";
  try {
    const res = await fetch(imageUrl);
    const blob = await res.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (err) {
    console.error("Error loading logo for PDF:", err);
    return "";
  }
};

export const exportCashbookPdf = async (
  entries: any[],
  startDate: string,
  endDate: string,
  activeUsername: string,
  currency: string,
  settings?: SystemSettings
) => {
  const doc = new jsPDF();
  
  if (settings?.logoUrl) {
    const logoData = await getBase64ImageFromUrl(settings.logoUrl);
    if (logoData) {
      doc.addImage(logoData, "JPEG", 165, 10, 28, 28);
    }
  }

  // Header Title
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text(settings?.companyName || "Indisponível", 14, 16);
  
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(`NUIT: ${settings?.companyNuit || "Indisponível"} | ${settings?.storeAddress || settings?.companyAddress || "Indisponível"}`, 14, 22);
  doc.text(`Período de Extração: ${startDate} a ${endDate} | Emissão: ${new Date().toLocaleString("pt-MZ")}`, 14, 27);
  doc.text(`Operador Responsável: ${activeUsername}`, 14, 32);

  doc.setDrawColor(220, 220, 220);
  doc.line(14, 35, 196, 35);

  const headers = [["Data/Hora", "Tipo", "Operador", "Descrição / Referência", "Valor"]];
  const dataRows = entries.map(item => [
    new Date(item.timestamp).toLocaleString("pt-MZ"),
    item.type || "MOVIMENTO",
    item.responsibleUser || activeUsername,
    item.reason || "Sem descrição",
    `${item.isInput ? "+" : "-"}${Number(item.amount || 0).toLocaleString()} ${currency}`
  ]);

  autoTable(doc, {
    startY: 38,
    head: headers,
    body: dataRows,
    theme: "striped",
    styles: { fontSize: 8, cellPadding: 2.5 },
    headStyles: { fillColor: [249, 115, 22], textColor: [255, 255, 255], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [250, 250, 250] }
  });

  doc.save(`Livro_Caixa_${startDate}_${endDate}.pdf`);
};

export const exportSingleClosurePdf = async (
  closure: CashClosure,
  currency: string,
  settings?: SystemSettings
) => {
  const doc = new jsPDF();
  
  if (settings?.logoUrl) {
    const logoData = await getBase64ImageFromUrl(settings.logoUrl);
    if (logoData) {
      doc.addImage(logoData, "JPEG", 165, 10, 28, 28);
    }
  }

  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text(settings?.companyName || "Indisponível", 14, 16);
  
  doc.setFontSize(8.5);
  doc.setFont("helvetica", "normal");
  doc.text(`NUIT: ${settings?.companyNuit || "Indisponível"} | ${settings?.storeAddress || settings?.companyAddress || "Indisponível"}`, 14, 22);
  doc.text(`Certificação Fiscal: ${settings?.fiscalCertificationNumber || "Indisponível"}`, 14, 27);

  doc.setDrawColor(220, 220, 220);
  doc.line(14, 30, 196, 30);

  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("AUTO DE FECHO DE CAIXA E RECONCILIAÇÃO DE TURNO", 14, 38);

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(`ID do Turno: ${closure.id || "N/A"}`, 14, 45);
  doc.text(`Data e Hora: ${new Date(closure.closedAt || closure.openedAt || Date.now()).toLocaleString("pt-MZ")}`, 14, 50);
  doc.text(`Operador de Caixa: ${closure.closedBy || closure.openedBy || "Operador"}`, 14, 55);
  doc.text(`Supervisor Homologador: ${closure.closingSupervisor || closure.openingSupervisor || "Supervisor Autorizado"}`, 14, 60);

  const diffVal = closure.difference || 0;
  const diffStatusText = diffVal === 0 
    ? "CONCILIAÇÃO PERFEITA (SEM DIVERGÊNCIA)" 
    : diffVal > 0 
      ? `SOBRA DE CAIXA: +${diffVal.toLocaleString()} ${currency}` 
      : `QUEBRA DE CAIXA: -${Math.abs(diffVal).toLocaleString()} ${currency}`;

  doc.setFont("helvetica", "bold");
  doc.text(`Resultado da Conferência: ${diffStatusText}`, 14, 68);

  const headers = [["Rubrica Financeira", "Valor Reconciliado"]];
  const dataRows = [
    ["(+) Fundo de Maneio / Abertura", `${Number(closure.openingBalance || 0).toLocaleString()} ${currency}`],
    ["(+) Vendas em Dinheiro Físico", `${Number(closure.reconciliation?.cashSales || 0).toLocaleString()} ${currency}`],
    ["(+) Vendas Digitais Reconciliadas (M-Pesa / E-Mola / POS)", `${Number((closure.reconciliation?.mpesaSales || 0) + (closure.reconciliation?.emolaSales || 0) + (closure.reconciliation?.posCardSales || 0) + (closure.reconciliation?.transferSales || 0)).toLocaleString()} ${currency}`],
    ["(+) Reforços e Suprimentos de Caixa", `${Number(closure.reconciliation?.reinforcements || closure.reconciliation?.inputs || 0).toLocaleString()} ${currency}`],
    ["(-) Sangrias Efetuadas para Cofre / Banco", `${Number(closure.reconciliation?.sangrias || 0).toLocaleString()} ${currency}`],
    ["(-) Despesas Operacionais em Dinheiro", `${Number(closure.reconciliation?.expenses || 0).toLocaleString()} ${currency}`],
    ["(-) Devoluções e Reembolsos", `${Number(closure.reconciliation?.devolutions || 0).toLocaleString()} ${currency}`],
    ["(=) Saldo Teórico em Dinheiro (Esperado na Gaveta)", `${Number(closure.theoreticalBalance || 0).toLocaleString()} ${currency}`],
    ["(≡) Saldo Físico Apurado na Contagem", `${Number(closure.physicalBalance || 0).toLocaleString()} ${currency}`],
    ["(Δ) Desvio de Fecho (Sobra / Falta)", `${Number(closure.difference || 0).toLocaleString()} ${currency}`]
  ];

  autoTable(doc, {
    startY: 73,
    head: headers,
    body: dataRows,
    theme: "striped",
    styles: { fontSize: 8.5, cellPadding: 2.5 },
    headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: "bold" }
  });

  const finalY = (doc as any).lastAutoTable?.finalY || 180;
  
  if (closure.closingNotes) {
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "italic");
    doc.text(`Observações do Fechamento: ${closure.closingNotes}`, 14, finalY + 8);
  }

  // Signature areas
  const signY = finalY + 30;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);

  doc.line(20, signY, 80, signY);
  doc.text("Assinatura do Operador", 30, signY + 5);

  doc.line(125, signY, 185, signY);
  doc.text("Homologação do Supervisor", 132, signY + 5);

  doc.setFontSize(7.5);
  doc.text("Documento gerado eletronicamente pelo Sistema de Gestão Comercial OST Vendas.", 14, signY + 20);

  doc.save(`Auto_Fecho_Caixa_${closure.id || Date.now()}.pdf`);
};

export const printThermalSlip = (
  closure: CashClosure,
  currency: string,
  settings?: SystemSettings
) => {
  const printWindow = window.open("", "_blank", "width=380,height=600");
  if (!printWindow) return;

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Talão de Fecho de Caixa</title>
        <style>
          body {
            font-family: 'Courier New', Courier, monospace;
            width: 72mm;
            margin: 0 auto;
            padding: 8px 4px;
            font-size: 11px;
            color: #000;
          }
          .text-center { text-align: center; }
          .bold { font-weight: bold; }
          .line { border-top: 1px dashed #000; margin: 6px 0; }
          .flex { display: flex; justify-content: space-between; margin: 2px 0; }
          .title { font-size: 13px; font-weight: bold; text-transform: uppercase; }
        </style>
      </head>
      <body>
        <div class="text-center">
          <div class="title">${settings?.companyName || "Indisponível"}</div>
          <div>NUIT: ${settings?.companyNuit || "Indisponível"}</div>
          <div>${settings?.storeAddress || settings?.companyAddress || "Indisponível"}</div>
          <div class="line"></div>
          <div class="bold">TALÃO DE FECHO DE CAIXA</div>
          <div>ID: ${closure.id || "N/A"}</div>
          <div>${new Date(closure.closedAt || closure.openedAt || Date.now()).toLocaleString("pt-MZ")}</div>
        </div>

        <div class="line"></div>
        <div>OPERADOR: ${closure.closedBy || closure.openedBy || "Operador"}</div>
        <div>SUPERVISOR: ${closure.closingSupervisor || closure.openingSupervisor || "Supervisor"}</div>
        
        <div class="line"></div>
        <div class="flex"><span>FUNDO ABERTURA:</span><span class="bold">${Number(closure.openingBalance || 0).toLocaleString()} ${currency}</span></div>
        <div class="flex"><span>VENDAS DINHEIRO:</span><span class="bold">+${Number(closure.reconciliation?.cashSales || 0).toLocaleString()} ${currency}</span></div>
        <div class="flex"><span>VENDAS M-PESA:</span><span class="bold">+${Number(closure.reconciliation?.mpesaSales || 0).toLocaleString()} ${currency}</span></div>
        <div class="flex"><span>VENDAS E-MOLA:</span><span class="bold">+${Number(closure.reconciliation?.emolaSales || 0).toLocaleString()} ${currency}</span></div>
        <div class="flex"><span>VENDAS POS/CARD:</span><span class="bold">+${Number(closure.reconciliation?.posCardSales || 0).toLocaleString()} ${currency}</span></div>
        <div class="flex"><span>OUTRAS ENTRADAS:</span><span class="bold">+${Number(closure.reconciliation?.reinforcements || 0).toLocaleString()} ${currency}</span></div>
        <div class="flex"><span>SANGRIAS/SAÍDAS:</span><span class="bold">-${Number((closure.reconciliation?.sangrias || 0) + (closure.reconciliation?.expenses || 0)).toLocaleString()} ${currency}</span></div>
        
        <div class="line"></div>
        <div class="flex bold"><span>SALDO TEÓRICO:</span><span>${Number(closure.theoreticalBalance || 0).toLocaleString()} ${currency}</span></div>
        <div class="flex bold"><span>SALDO FÍSICO:</span><span>${Number(closure.physicalBalance || 0).toLocaleString()} ${currency}</span></div>
        <div class="flex bold"><span>DIFERENÇA:</span><span>${Number(closure.difference || 0).toLocaleString()} ${currency}</span></div>

        <div class="line"></div>
        <div style="font-size: 10px; font-style: italic;">Obs: ${closure.closingNotes || "Sem observações adicionais."}</div>

        <div style="margin-top: 25px;" class="text-center">
          __________________________<br/>
          Assinatura do Operador
        </div>
        <div style="margin-top: 20px;" class="text-center">
          __________________________<br/>
          Visto do Supervisor
        </div>
        <div class="line"></div>
        <div class="text-center" style="font-size: 9px; margin-top: 6px;">OST VENDAS ERP - Sistema Homologado</div>
      </body>
    </html>
  `;

  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => {
    printWindow.print();
  }, 400);
};
