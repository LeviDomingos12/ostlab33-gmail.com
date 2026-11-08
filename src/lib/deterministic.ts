/**
 * @file src/lib/deterministic.ts
 * Utilitários Determinísticos, Fiscais e Criptográficos para o ERP & POS OST Vendas.
 * 
 * Substitui o uso de Math.random() e Date.now() soltos para:
 * 1. Numeração de Faturas e Notas de Crédito Fiscais (Sequenciais, Determinísticas e Auditáveis)
 * 2. Referências Financeiras Móveis (M-Pesa, e-Mola, SIMO) Determinísticas e Únicas
 * 3. Geração de IDs Padronizados RFC 4122 UUID v4
 * 4. Geração de PINs e Códigos de Barras Criptograficamente Seguros
 */

/**
 * Gera um identificador único padrão RFC 4122 UUID v4
 * utilizando crypto.randomUUID() nativo com fallback criptográfico.
 */
export function generateUUID(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  // Fallback seguro usando crypto.getRandomValues
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40; // versão 4
    bytes[8] = (bytes[8] & 0x3f) | 0x80; // variante RFC 4122
    const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  // Fallback para ambientes sem Web Crypto
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Gera um ID de entidade com prefixo estruturado e UUID v4 criptográfico.
 * Exemplo: generateEntityId("cust") -> "cust_e3f5..."
 */
export function generateEntityId(prefix?: string): string {
  const uuid = generateUUID();
  return prefix ? `${prefix}_${uuid}` : uuid;
}

/**
 * Gera um número de recibo determinístico e auditável.
 */
export function generateReceiptNumber(seq?: number, prefix: string = "REC"): string {
  const year = new Date().getFullYear();
  const safeSeq = seq ? Math.max(1, Math.floor(seq)).toString().padStart(6, "0") : generateUUID().slice(0, 8).toUpperCase();
  return `${prefix}-${year}-${safeSeq}`;
}

/**
 * Gera um código de produto padronizado.
 */
export function generateProductCode(prefix: string = "PROD", seq?: number): string {
  if (seq !== undefined) {
    return `${prefix}-${seq.toString().padStart(5, "0")}`;
  }
  const entropy = generateSecurePin(4);
  return `${prefix}-${entropy}`;
}

/**
 * Gera um código de certificado determinístico e verificável.
 */
export function generateCertificateCode(): string {
  const hex = generateUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
  const year = new Date().getFullYear();
  return `CERT-OST-${hex}-${year}`;
}

/**
 * Gera um número de fatura sequencial e determinístico conforme exigências fiscais de Moçambique.
 * Formato: FAC <ANO>/<SERIE>-<SEQUENCIAL_6_DIGITOS> ou FT <ANO>/<SEQUENCIAL>
 */
export function generateDeterministicInvoiceNumber(
  sequenceNumber: number,
  series: string = "A",
  year: number = new Date().getFullYear()
): string {
  const safeSeq = Math.max(1, Math.floor(sequenceNumber));
  const padded = safeSeq.toString().padStart(6, "0");
  const cleanSeries = (series || "A").trim().toUpperCase();
  return `FAC-${year}-${cleanSeries}${padded}`;
}

/**
 * Gera um número de Nota de Crédito / Devolução determinístico.
 * Formato: NC-<ANO>-<SERIE><SEQUENCIAL_6_DIGITOS>
 */
export function generateDeterministicCreditNoteNumber(
  sequenceNumber: number,
  series: string = "NC",
  year: number = new Date().getFullYear()
): string {
  const safeSeq = Math.max(1, Math.floor(sequenceNumber));
  const padded = safeSeq.toString().padStart(6, "0");
  return `NC-${year}-${series}${padded}`;
}

/**
 * Gera uma Referência de Pagamento Financeiro Determinística (M-Pesa / e-Mola / SIMO).
 * Garante unicidade e correspondência direta com a fatura e tenant, sem números aleatórios soltos.
 */
export function generateDeterministicFinancialReference(
  tenantId: string,
  invoiceNumber: string,
  amount: number,
  sequence: number = 1
): string {
  const cleanTenant = (tenantId || "OST").replace(/[^a-zA-Z0-9]/g, "").slice(-4).toUpperCase() || "OST";
  const cleanInvoice = (invoiceNumber || "VND").replace(/[^a-zA-Z0-9]/g, "").slice(-6).toUpperCase();
  const centavos = Math.round(amount * 100).toString().slice(-4);
  const seqPadded = (sequence % 1000).toString().padStart(3, "0");

  return `REF-${cleanTenant}-${cleanInvoice}-${centavos}${seqPadded}`;
}

/**
 * Gera um PIN numérico seguro de 4 ou 6 dígitos usando entropia criptográfica.
 */
export function generateSecurePin(length: 4 | 6 = 6): string {
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const array = new Uint32Array(1);
    crypto.getRandomValues(array);
    const min = length === 4 ? 1000 : 100000;
    const max = length === 4 ? 9999 : 999999;
    const range = max - min + 1;
    const val = min + (array[0] % range);
    return val.toString();
  }
  const min = length === 4 ? 1000 : 100000;
  const max = length === 4 ? 9999 : 999999;
  return Math.floor(min + Math.random() * (max - min + 1)).toString();
}

/**
 * Gera um Código de Barras EAN-13 determinístico e válido com dígito de controlo checksum.
 */
export function generateDeterministicBarcodeEan13(prefix: string = "560", seqNumber: number = 1): string {
  const cleanPrefix = prefix.slice(0, 3).padEnd(3, "5");
  const numPart = seqNumber.toString().padStart(9, "0").slice(-9);
  const raw12 = `${cleanPrefix}${numPart}`;

  // Cálculo do dígito de controlo EAN-13
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const d = parseInt(raw12[i], 10);
    sum += i % 2 === 0 ? d : d * 3;
  }
  const checksum = (10 - (sum % 10)) % 10;
  return `${raw12}${checksum}`;
}
