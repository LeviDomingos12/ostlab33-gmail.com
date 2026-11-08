import React, { useState, useEffect, useCallback, useId } from "react";
import { 
  Building, 
  Mail, 
  FileText, 
  MapPin, 
  Image as ImageIcon, 
  Save, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle, 
  ShieldCheck, 
  Lock, 
  Upload, 
  Sparkles,
  Info
} from "lucide-react";
import { CommercialDataService } from "../services/dataService";
import { CompanyProfile } from "../types";
import { imageStorageService } from "../services/imageStorageService";

interface CompanyProfileFormProps {
  userEmail: string;
  onProfileUpdated?: (updatedProfile: CompanyProfile) => void;
  canEdit?: boolean;
  onShowToast?: (message: string, type: "success" | "error" | "info" | "warning", title?: string) => void;
}

export const CompanyProfileForm: React.FC<CompanyProfileFormProps> = ({
  userEmail,
  onProfileUpdated,
  canEdit = true,
  onShowToast
}) => {
  const normalizedEmail = (userEmail || "").trim().toLowerCase();
  const fileInputId = useId();

  // Estados do formulário
  const [id, setId] = useState<string>("");
  const [companyName, setCompanyName] = useState<string>("");
  const [nuit, setNuit] = useState<string>("");
  const [address, setAddress] = useState<string>("");
  const [logoUrl, setLogoUrl] = useState<string>("");
  const [createdAt, setCreatedAt] = useState<string>("");
  const [updatedAt, setUpdatedAt] = useState<string>("");

  // Estados de controlo
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<{
    text: string;
    type: "success" | "error" | "info";
  } | null>(null);

  // Carregar dados de forma autenticada usando CommercialDataService
  const loadProfile = useCallback(async (isSilent = false) => {
    if (!normalizedEmail) {
      setLoading(false);
      return;
    }

    if (!isSilent) setLoading(true);
    setStatusMessage(null);

    try {
      const data = await CommercialDataService.fetchCompanyProfile(normalizedEmail);
      if (data) {
        setId(data.id || "");
        setCompanyName(data.company_name || "");
        setNuit(data.nuit || "");
        setAddress(data.address || "");
        setLogoUrl(data.logo_url || "");
        setCreatedAt(data.created_at || "");
        setUpdatedAt(data.updated_at || "");
      } else {
        // Inicializa com padrões caso seja o primeiro acesso deste e-mail
        setId(`cp_${Math.random().toString(36).substring(2, 10)}`);
        setCompanyName("");
        setNuit("");
        setAddress("");
        setLogoUrl("");
      }
    } catch (err: any) {
      console.error("[CompanyProfileForm] Erro ao carregar perfil:", err);
      setStatusMessage({
        text: "Não foi possível carregar os dados cadastrais da empresa.",
        type: "error"
      });
    } finally {
      setLoading(false);
    }
  }, [normalizedEmail]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  // Manipular upload de logotipo local convertendo para base64 Data URL
  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      const errorMsg = "A imagem selecionada é muito pesada (máximo 2MB).";
      setStatusMessage({ text: errorMsg, type: "error" });
      if (onShowToast) onShowToast(errorMsg, "error", "Ficheiro muito grande");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      if (result) {
        setLogoUrl(result);
        imageStorageService.saveCompanyLogo(result).catch(console.warn);
        setStatusMessage({ text: "Logotipo carregado com sucesso. Clique em Salvar para persistir.", type: "info" });
      }
    };
    reader.readAsDataURL(file);
  };

  // Salvar dados da empresa através de CommercialDataService
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!normalizedEmail) {
      const errorMsg = "Erro de autenticação: nenhum e-mail de sessão encontrado.";
      setStatusMessage({ text: errorMsg, type: "error" });
      if (onShowToast) onShowToast(errorMsg, "error");
      return;
    }

    if (!companyName.trim()) {
      const errorMsg = "O Nome da Empresa é obrigatório.";
      setStatusMessage({ text: errorMsg, type: "error" });
      if (onShowToast) onShowToast(errorMsg, "warning");
      return;
    }

    setSaving(true);
    setStatusMessage(null);

    const payload: CompanyProfile = {
      id: id || undefined,
      email: normalizedEmail,
      company_name: companyName.trim(),
      nuit: nuit.trim(),
      address: address.trim(),
      logo_url: logoUrl.trim(),
      updated_at: new Date().toISOString()
    };

    try {
      const ok = await CommercialDataService.saveCompanyProfile(payload, normalizedEmail);

      if (ok) {
        const successMsg = "Dados da empresa guardados com sucesso!";
        setStatusMessage({ text: successMsg, type: "success" });
        setUpdatedAt(new Date().toLocaleTimeString());

        if (onShowToast) {
          onShowToast(successMsg, "success", "Perfil Guardado");
        }

        if (onProfileUpdated) {
          onProfileUpdated(payload);
        }
      } else {
        throw new Error("Falha na confirmação de persistência.");
      }
    } catch (err: any) {
      console.error("[CompanyProfileForm] Erro ao gravar perfil:", err);
      const errMsg = "Erro ao guardar dados da empresa: " + (err?.message || "Tente novamente.");
      setStatusMessage({ text: errMsg, type: "error" });
      if (onShowToast) onShowToast(errMsg, "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden">
      {/* Cabeçalho do Componente */}
      <div className="p-6 border-b border-slate-100 bg-gradient-to-r from-orange-50/50 via-white to-amber-50/30">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2.5 bg-orange-600 text-white rounded-xl shadow-xs shrink-0">
              <Building className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-bold text-slate-900">
                  Perfil da Empresa
                </h3>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Informações fiscais e de identificação comercial da sua empresa para faturas e recibos.
              </p>
            </div>
          </div>

          {/* Botão de Atualização Rápida */}
          <button
            type="button"
            onClick={() => loadProfile()}
            disabled={loading || saving}
            title="Recarregar dados da empresa"
            className="self-start sm:self-auto inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl transition-colors shadow-2xs disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-slate-600 ${loading ? "animate-spin text-orange-600" : ""}`} />
            <span>{loading ? "A carregar..." : "Recarregar"}</span>
          </button>
        </div>
      </div>

      {/* Formulário Principal */}
      <form onSubmit={handleSubmit} className="p-6 space-y-6">
        {/* Mensagem de Feedback */}
        {statusMessage && (
          <div
            className={`p-3.5 rounded-xl border text-xs flex items-center gap-2.5 transition-all animate-in fade-in-50 duration-200 ${
              statusMessage.type === "success"
                ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                : statusMessage.type === "error"
                ? "bg-rose-50 border-rose-200 text-rose-900"
                : "bg-blue-50 border-blue-200 text-blue-900"
            }`}
          >
            {statusMessage.type === "success" ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : statusMessage.type === "error" ? (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            ) : (
              <Info className="w-4 h-4 text-blue-600 shrink-0" />
            )}
            <span className="font-medium">{statusMessage.text}</span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Coluna 1 & 2: Campos de Dados */}
          <div className="lg:col-span-2 space-y-4">
            {/* Campo 1: Email Logado - Somente Leitura */}
            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-slate-500" />
                  E-mail do Administrador / Responsável
                </span>
                <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200 flex items-center gap-1">
                  <Lock className="w-2.5 h-2.5" /> Autenticado
                </span>
              </label>
              <div className="relative">
                <input
                  type="email"
                  readOnly
                  disabled
                  value={normalizedEmail}
                  className="w-full px-3.5 py-2.5 bg-slate-100 border border-slate-300 rounded-xl text-xs font-mono text-slate-700 cursor-not-allowed select-all"
                  title="O e-mail vinculado à sua sessão oficial."
                />
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                Identificador oficial da conta empresarial no sistema.
              </p>
            </div>

            {/* Campo 2: Nome da Empresa */}
            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1 flex items-center gap-1.5">
                <Building className="w-3.5 h-3.5 text-orange-600" />
                Nome da Empresa / Razão Social *
              </label>
              <input
                type="text"
                required
                disabled={!canEdit || loading || saving}
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Ex: Comercial Maputo & Serviços, Lda."
                className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all placeholder:text-slate-400 disabled:bg-slate-50 disabled:text-slate-500"
              />
            </div>

            {/* Campo 3: NUIT / NIF */}
            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-slate-500" />
                  NUIT / Identificação Tributária (NIF)
                </span>
                <span className="text-[10px] text-slate-600">Moçambique (9 dígitos)</span>
              </label>
              <input
                type="text"
                disabled={!canEdit || loading || saving}
                value={nuit}
                onChange={(e) => setNuit(e.target.value)}
                placeholder="Ex: 400987654"
                maxLength={20}
                className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all placeholder:text-slate-400 disabled:bg-slate-50 disabled:text-slate-500 font-mono"
              />
            </div>

            {/* Campo 4: Endereço Comercial */}
            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-slate-500" />
                Endereço Físico / Sede Comercial
              </label>
              <textarea
                rows={2}
                disabled={!canEdit || loading || saving}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Ex: Av. 24 de Julho, Edifício Comercial, 1º Andar, Maputo"
                className="w-full px-3.5 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all placeholder:text-slate-400 disabled:bg-slate-50 disabled:text-slate-500 resize-none"
              />
            </div>

            {/* Campo 5: URL do Logotipo */}
            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <ImageIcon className="w-3.5 h-3.5 text-slate-500" />
                  URL do Logotipo da Empresa
                </span>
                <span className="text-[10px] text-slate-500">HTTPS ou Imagem Base64</span>
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  disabled={!canEdit || loading || saving}
                  value={logoUrl}
                  onChange={(e) => setLogoUrl(e.target.value)}
                  placeholder="https://exemplo.com/logo.png"
                  className="flex-1 px-3.5 py-2 bg-white border border-slate-300 rounded-xl text-xs font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all placeholder:text-slate-400 disabled:bg-slate-50 disabled:text-slate-500"
                />
                
                {/* Botão de Upload Local */}
                <label 
                  htmlFor={fileInputId} 
                  className={`inline-flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl cursor-pointer transition-colors border border-slate-200 ${
                    !canEdit || loading || saving ? "opacity-50 pointer-events-none" : ""
                  }`}
                  title="Carregar imagem do seu computador"
                >
                  <Upload className="w-3.5 h-3.5 text-slate-600" />
                  <span>Upload</span>
                </label>
                <input
                  id={fileInputId}
                  type="file"
                  accept="image/png, image/jpeg, image/webp, image/svg+xml"
                  onChange={handleLogoUpload}
                  className="hidden"
                  disabled={!canEdit || loading || saving}
                />
              </div>
            </div>
          </div>

          {/* Coluna 3: Pré-visualização do Perfil & Recibo */}
          <div className="bg-slate-50/70 p-4 rounded-xl border border-slate-200/90 flex flex-col justify-between space-y-4">
            <div>
              <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-200">
                <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                  Prévia no Recibo Fiscal
                </span>
                <span className="text-[10px] text-slate-400 font-mono">Pré-visualização</span>
              </div>

              {/* Caixa Estilo Recibo Térmico */}
              <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-2xs text-center space-y-2.5 font-sans">
                {/* Logotipo */}
                {logoUrl ? (
                  <div className="flex justify-center">
                    <img
                      src={logoUrl}
                      alt="Logotipo da Empresa"
                      className="max-h-14 max-w-full object-contain rounded-md border border-slate-100 p-1"
                      onError={() => {
                        // fallback se URL falhar
                      }}
                    />
                  </div>
                ) : (
                  <div className="w-12 h-12 mx-auto rounded-xl bg-slate-100 border border-dashed border-slate-300 flex items-center justify-center text-slate-400">
                    <Building className="w-6 h-6 text-slate-300" />
                  </div>
                )}

                {/* Nome da Empresa */}
                <div>
                  <h4 className="font-extrabold text-sm text-slate-900 leading-tight">
                    {companyName.trim() || "Nome da Empresa"}
                  </h4>
                  <p className="text-[10px] text-slate-600 mt-0.5">
                    {address.trim() || "Endereço da Empresa"}
                  </p>
                </div>

                {/* Dados Fiscais */}
                <div className="pt-2 border-t border-dashed border-slate-200 text-[11px] text-slate-600 font-mono">
                  <span>NUIT: <strong>{nuit.trim() || "--- --- ---"}</strong></span>
                </div>

                <div className="text-[9px] text-slate-600">
                  Operador autenticado: {normalizedEmail}
                </div>
              </div>
            </div>

            {/* Metadados de Proteção */}
            <div className="text-[10px] text-slate-600 space-y-1 bg-white p-2.5 rounded-lg border border-slate-200">
              <div className="flex items-center gap-1.5 text-emerald-700 font-semibold">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span>Perfil Comercial Protegido & Isolado</span>
              </div>
              {createdAt && (
                <div className="flex justify-between text-slate-500 pt-1 border-t border-slate-100">
                  <span>Criado em:</span>
                  <span className="font-mono">{createdAt}</span>
                </div>
              )}
              {updatedAt && (
                <div className="flex justify-between text-slate-500 pt-1 border-t border-slate-100">
                  <span>Última atualização:</span>
                  <span className="font-mono">{updatedAt}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Rodapé com Botão de Ação */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-slate-100">
          <div className="text-xs text-slate-500 flex items-center gap-1.5 self-start sm:self-auto">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Perfil verificado: informações comerciais protegidas e isoladas para a sua conta.</span>
          </div>

          <button
            type="submit"
            disabled={!canEdit || saving || loading}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs rounded-xl shadow-xs hover:shadow-md transition-all disabled:opacity-50 cursor-pointer"
          >
            {saving ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>A guardar alterações...</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>Salvar Perfil da Empresa</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};

export default CompanyProfileForm;
