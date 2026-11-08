import React from "react";

export interface WelcomeAdminTemplateProps {
  adminName: string;
  adminEmail: string;
  tempPin?: string;
  password?: string;
  role?: string;
  branchName?: string;
  loginUrl?: string;
  adminCopyEmail?: string;
  createdAt?: string;
}

/**
 * Returns an email-compatible HTML string styled with inline CSS matching
 * modern Tailwind aesthetic for dual-notification welcome emails.
 */
export function renderWelcomeAdminHtml(props: WelcomeAdminTemplateProps): string {
  const {
    adminName,
    adminEmail,
    tempPin,
    password,
    role = "Administrador do Sistema",
    branchName = "Sede Principal",
    loginUrl = typeof window !== "undefined" ? window.location.origin : "#",
    adminCopyEmail = "",
    createdAt = new Date().toLocaleString("pt-PT")
  } = props;

  const credentialSecret = tempPin || password || "******";

  return `
<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Credenciais de Acesso - OST Vendas ERP</title>
</head>
<body style="margin:0; padding:0; background-color:#0f172a; font-family:'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color:#f8fafc;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#0f172a; padding: 40px 10px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width: 620px; background-color:#1e293b; border-radius: 16px; border: 1px solid #334155; overflow: hidden; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);">
          
          <!-- Header Banner -->
          <tr>
            <td style="background: linear-gradient(135deg, #ea580c 0%, #c2410c 100%); padding: 32px 28px; text-align: center;">
              <div style="display: inline-block; background-color: rgba(255, 255, 255, 0.2); padding: 8px 16px; border-radius: 9999px; margin-bottom: 12px;">
                <span style="color: #ffffff; font-size: 11px; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase;">OST VENDAS ERP • NOTIFICAÇÃO OFICIAL</span>
              </div>
              <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 800; letter-spacing: -0.025em;">
                Boas-vindas ao Sistema
              </h1>
              <p style="color: #ffedd5; margin: 6px 0 0 0; font-size: 14px; font-weight: 500;">
                Conta de Administrador Ativada com Sucesso
              </p>
            </td>
          </tr>

          <!-- Body Content -->
          <tr>
            <td style="padding: 32px 28px;">
              <p style="font-size: 15px; color: #cbd5e1; margin-top: 0; line-height: 1.6;">
                Olá <strong style="color: #ffffff;">${adminName}</strong>,
              </p>
              <p style="font-size: 14px; color: #94a3b8; line-height: 1.6; margin-bottom: 24px;">
                A sua conta com privilégios de <strong style="color: #f97316;">${role}</strong> foi registada e sincronizada no sistema de gestão <strong style="color: #f8fafc;">OST Vendas ERP</strong>.
              </p>

              <!-- Credentials Box -->
              <div style="background-color: #0f172a; border: 1px solid #334155; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
                <div style="font-size: 11px; font-weight: 700; color: #f97316; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 12px; border-bottom: 1px solid #1e293b; padding-bottom: 8px;">
                  🔑 Credenciais de Acesso Direto
                </div>
                
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td style="padding: 6px 0; font-size: 13px; color: #94a3b8; width: 140px;">E-mail / Utilizador:</td>
                    <td style="padding: 6px 0; font-size: 13px; font-weight: 700; color: #f8fafc; font-family: monospace;">${adminEmail}</td>
                  </tr>
                  <tr>
                    <td style="padding: 6px 0; font-size: 13px; color: #94a3b8;">Senha / PIN Inicial:</td>
                    <td style="padding: 6px 0;">
                      <span style="font-size: 15px; font-weight: 800; color: #ea580c; background-color: #1e293b; border: 1px solid #475569; padding: 4px 10px; border-radius: 6px; font-family: monospace;">
                        ${credentialSecret}
                      </span>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 6px 0; font-size: 13px; color: #94a3b8;">Função / Nível:</td>
                    <td style="padding: 6px 0; font-size: 13px; font-weight: 700; color: #38bdf8;">${role}</td>
                  </tr>
                  <tr>
                    <td style="padding: 6px 0; font-size: 13px; color: #94a3b8;">Empresa / Filial:</td>
                    <td style="padding: 6px 0; font-size: 13px; color: #cbd5e1;">${branchName}</td>
                  </tr>
                </table>
              </div>

              <!-- Security Protocol Banner -->
              <div style="background-color: rgba(225, 29, 72, 0.1); border-left: 4px solid #f43f5e; border-radius: 0 8px 8px 0; padding: 14px 16px; margin-bottom: 24px;">
                <div style="font-size: 13px; font-weight: 700; color: #fb7185; margin-bottom: 4px;">
                  🛡️ Recomendações de Segurança Mandatórias
                </div>
                <ul style="margin: 0; padding-left: 18px; font-size: 12px; color: #fda4af; line-height: 1.6;">
                  <li>Altere esta senha temporária após o primeiro login de acesso.</li>
                  <li>As credenciais de administrador expiram e requerem renovação periódica (60 dias).</li>
                  <li>Nunca partilhe este e-mail ou a sua senha com terceiros não autorizados.</li>
                </ul>
              </div>

              <!-- Action CTA -->
              <div style="text-align: center; margin: 32px 0 24px 0;">
                <a href="${loginUrl}" target="_blank" style="display: inline-block; background-color: #ea580c; color: #ffffff; font-size: 14px; font-weight: 700; text-decoration: none; padding: 14px 32px; border-radius: 10px; box-shadow: 0 4px 12px rgba(234, 88, 12, 0.4);">
                  Aceder ao Painel ERP →
                </a>
              </div>

              <!-- Dual Notification Notice -->
              <div style="border-top: 1px solid #334155; padding-top: 16px; margin-top: 24px;">
                <p style="font-size: 11px; color: #64748b; margin: 0; line-height: 1.5;">
                  ℹ️ <strong>Sistema de Dupla Notificação Ativo:</strong> Esta mensagem foi enviada para o administrador registado (<span style="color: #94a3b8;">${adminEmail}</span>) e uma cópia de auditoria (CC) foi enviada para a administração geral (<span style="color: #94a3b8;">${adminCopyEmail}</span>).
                </p>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #0f172a; border-top: 1px solid #334155; padding: 20px 28px; text-align: center;">
              <p style="font-size: 11px; color: #475569; margin: 0 0 6px 0;">
                OST Vendas ERP &bull; Plataforma Cloud de Gestão Comercial
              </p>
              <p style="font-size: 10px; color: #334155; margin: 0;">
                Data de Emissão: ${createdAt} &bull; Módulo de Segurança & Auditoria
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

/**
 * React Component representation of the Welcome Admin Template
 * for rendering preview in the app UI if needed.
 */
export const WelcomeAdminTemplate: React.FC<WelcomeAdminTemplateProps> = (props) => {
  const {
    adminName,
    adminEmail,
    tempPin,
    password,
    role = "Administrador do Sistema",
    branchName = "Sede Principal",
    loginUrl = "#",
    adminCopyEmail = "",
    createdAt = new Date().toLocaleString("pt-PT")
  } = props;

  const credentialSecret = tempPin || password || "******";

  return (
    <div className="max-w-2xl mx-auto bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl text-slate-100 font-sans">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-orange-600 to-amber-700 p-7 text-center">
        <div className="inline-block bg-white/20 backdrop-blur-md px-3 py-1 rounded-full text-[10px] font-extrabold text-white uppercase tracking-widest mb-3">
          OST VENDAS ERP • NOTIFICAÇÃO OFICIAL
        </div>
        <h1 className="text-2xl font-black text-white tracking-tight">
          Boas-vindas ao Sistema
        </h1>
        <p className="text-orange-100 text-sm font-medium mt-1">
          Conta de Administrador Ativada com Sucesso
        </p>
      </div>

      {/* Body Content */}
      <div className="p-7 space-y-6">
        <div>
          <p className="text-base text-slate-200">
            Olá <strong className="text-white">{adminName}</strong>,
          </p>
          <p className="text-sm text-slate-400 mt-1 leading-relaxed">
            A sua conta com privilégios de <strong className="text-orange-400">{role}</strong> foi registada e sincronizada no sistema de gestão <strong className="text-slate-200">OST Vendas ERP</strong>.
          </p>
        </div>

        {/* Credentials Box */}
        <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 space-y-3">
          <div className="text-[11px] font-bold text-orange-400 uppercase tracking-wider pb-2 border-b border-slate-800 flex items-center justify-between">
            <span>🔑 Credenciais de Acesso Direto</span>
            <span className="text-[10px] text-slate-500 font-normal">Confidencial</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <span className="text-slate-500 block text-[10px] uppercase font-bold tracking-wider">E-mail / Utilizador</span>
              <span className="text-slate-100 font-mono font-semibold">{adminEmail}</span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px] uppercase font-bold tracking-wider">Senha / PIN Inicial</span>
              <span className="inline-block mt-0.5 font-mono text-sm font-bold text-orange-400 bg-slate-900 border border-slate-700 px-2.5 py-0.5 rounded-md">
                {credentialSecret}
              </span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px] uppercase font-bold tracking-wider">Função / Nível</span>
              <span className="text-sky-400 font-semibold">{role}</span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px] uppercase font-bold tracking-wider">Empresa / Filial</span>
              <span className="text-slate-300">{branchName}</span>
            </div>
          </div>
        </div>

        {/* Security Protocol Banner */}
        <div className="bg-rose-950/40 border-l-4 border-rose-500 rounded-r-xl p-4 text-xs space-y-1.5">
          <div className="font-bold text-rose-400 text-sm flex items-center gap-1.5">
            <span>🛡️</span> Recomendações de Segurança Mandatórias
          </div>
          <ul className="list-disc list-inside text-rose-200/80 space-y-1 text-[11px] leading-relaxed">
            <li>Altere esta senha temporária após o primeiro login de acesso.</li>
            <li>As credenciais de administrador expiram e requerem renovação periódica (60 dias).</li>
            <li>Nunca partilhe este e-mail ou a sua senha com terceiros não autorizados.</li>
          </ul>
        </div>

        {/* Action CTA */}
        <div className="text-center pt-2">
          <a
            href={loginUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-orange-600 hover:bg-orange-500 text-white text-sm font-bold px-8 py-3 rounded-xl shadow-lg shadow-orange-600/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
          >
            <span>Aceder ao Painel ERP</span>
            <span>→</span>
          </a>
        </div>

        {/* Dual Notification Notice */}
        <div className="border-t border-slate-800 pt-4 text-[11px] text-slate-500 leading-relaxed">
          ℹ️ <strong className="text-slate-400">Sistema de Dupla Notificação Ativo:</strong> Esta mensagem foi enviada para o administrador registado (<span className="text-slate-400 font-mono">{adminEmail}</span>) e uma cópia de auditoria (CC) foi enviada para a administração geral (<span className="text-slate-400 font-mono">{adminCopyEmail}</span>).
        </div>
      </div>

      {/* Footer */}
      <div className="bg-slate-950 border-t border-slate-800 p-5 text-center text-[10px] text-slate-500">
        <p>OST Vendas ERP &bull; Plataforma Cloud de Gestão Comercial</p>
        <p className="mt-1 text-slate-600">Data de Emissão: {createdAt} &bull; Módulo de Segurança & Auditoria</p>
      </div>
    </div>
  );
};

export default WelcomeAdminTemplate;
