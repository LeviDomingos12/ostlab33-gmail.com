import React, { useState, useEffect } from "react";
import { 
  Play, 
  Video, 
  Clock, 
  Award, 
  HelpCircle, 
  ThumbsUp, 
  BookOpen,
  Search, 
  CheckCircle, 
  RefreshCw, 
  Sparkles, 
  X, 
  Lock, 
  Trophy, 
  FileText
} from "lucide-react";
import jsPDF from "jspdf";
import { MasterclassVideo } from "../types";

interface TrainingModuleProps {
  videos: MasterclassVideo[];
  currency: string;
}

// Interactive Quiz Questions tailored to the system and Moçambique retail context
interface QuizQuestion {
  id: number;
  question: string;
  options: string[];
  correctAnswer: number;
  explanation: string;
}

const quizQuestions: QuizQuestion[] = [
  {
    id: 1,
    question: "Qual é a taxa padrão de IVA (Imposto sobre o Valor Acrescentado) em Moçambique configurada por padrão no sistema?",
    options: [
      "17% (Taxa histórica)",
      "16% (Taxa em vigor regulada pelo MEF)",
      "14% (Taxa reduzida de províncias)",
      "Isenção total automática"
    ],
    correctAnswer: 1,
    explanation: "O IVA em Moçambique foi reduzido de 17% para 16% sob as reformas de estímulo económico (PAE) do Ministério da Economia e Finanças."
  },
  {
    id: 2,
    question: "Ao realizar o Fechamento de Caixa no final do turno, qual é o procedimento correcto exigido pelo sistema?",
    options: [
      "Retirar todo o dinheiro e fechar a janela sem salvar",
      "Comparar o saldo teórico calculado pelo sistema com a contagem física real do dinheiro na gaveta e obter validação do supervisor",
      "Apagar as faturas do dia para diminuir o espaço na base de dados",
      "Deixar o caixa aberto para o próximo operador continuar"
    ],
    correctAnswer: 1,
    explanation: "O fecho seguro de caixa exige o balanço entre o saldo teórico (faturamento digital) e a contagem física real, assinado digitalmente pelo operador e validado pelo supervisor."
  },
  {
    id: 3,
    question: "O que acontece imediatamente quando um artigo em stock atinge o limite mínimo configurado?",
    options: [
      "O produto é bloqueado para venda no POS",
      "O sistema gera alertas visuais no painel geral e pode disparar notificações via SMTP/SMS se configurados",
      "O preço de custo é aumentado automaticamente",
      "O produto é eliminado do banco de dados"
    ],
    correctAnswer: 1,
    explanation: "O sistema ativa avisos de stock crítico no dashboard do gestor para alertar sobre a necessidade urgente de reposição com fornecedores antes da ruptura."
  },
  {
    id: 4,
    question: "Como funciona a integração real do sistema com pagamentos móveis M-Pesa e E-Mola?",
    options: [
      "Apenas exibe um texto estático e não faz chamadas",
      "Requer chaves API e shortcodes reais introduzidos nas Definições, permitindo enviar Push USSD e gerar QR Codes integrados",
      "Exige enviar uma mensagem escrita manual ao cliente pelo telemóvel pessoal",
      "O caixa deve ligar directamente para a operadora"
    ],
    correctAnswer: 1,
    explanation: "A aba de Integrações permite configurar chaves API para comunicação segura com as operadoras Vodacom (M-Pesa) e Movitel (E-Mola) de forma automatizada."
  },
  {
    id: 5,
    question: "Qual é o principal objectivo de preencher as datas de validade/lotes no cadastro de produtos?",
    options: [
      "Para que o sistema mude a cor do tema automaticamente",
      "Para habilitar alertas de proximidade de vencimento no painel do administrador, prevenindo perdas financeiras",
      "Apenas para cumprir exigências estéticas",
      "Dobrar os pontos de fidelidade do cliente no CRM"
    ],
    correctAnswer: 1,
    explanation: "O controlo de lotes e validades permite que o sistema projete alertas com dias de antecedência para que mercadorias próximas do vencimento sejam promocionadas."
  }
];

export default function TrainingModule({ videos, currency: _currency }: TrainingModuleProps) {
  // Use the videos passed as prop (synchronized with mockData)
  const trainingVideos = videos;

  // Local state management
  const [selectedVideo, setSelectedVideo] = useState<any>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playerMode, setPlayerMode] = useState<"real" | "simulation">("real");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [activeFilter, setActiveFilter] = useState<string>("todos");
  
  // Progress tracking saved locally
  const [watchedVideos, setWatchedVideos] = useState<string[]>([]);
  const [likesCount, setLikesCount] = useState<Record<string, number>>({
    v1: 154,
    v2: 98,
    v3: 212,
    v4: 87,
    v5: 320,
    v6: 245
  });

  // Quiz States
  const [quizStarted, setQuizStarted] = useState<boolean>(false);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState<number>(0);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, number>>({});
  const [quizSubmitted, setQuizSubmitted] = useState<boolean>(false);
  const [showAnswerFeedback, setShowAnswerFeedback] = useState<boolean>(false);
  const [quizScore, setQuizScore] = useState<number>(0);

  // Load progress on mount
  useEffect(() => {
    const savedWatched = localStorage.getItem("ost_watched_videos");
    if (savedWatched) {
      try {
        setWatchedVideos(JSON.parse(savedWatched));
      } catch (e) {
        console.error("Erro ao carregar vídeos assistidos:", e);
      }
    }
  }, []);

  const handleToggleWatched = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    let updated: string[];
    if (watchedVideos.includes(id)) {
      updated = watchedVideos.filter(item => item !== id);
    } else {
      updated = [...watchedVideos, id];
    }
    setWatchedVideos(updated);
    localStorage.setItem("ost_watched_videos", JSON.stringify(updated));
  };

  const handleOpenVideo = (video: any) => {
    setSelectedVideo(video);
    setIsPlaying(true);
    setPlayerMode("real");
    
    // Automatically mark as watched when opened
    if (!watchedVideos.includes(video.id)) {
      const updated = [...watchedVideos, video.id];
      setWatchedVideos(updated);
      localStorage.setItem("ost_watched_videos", JSON.stringify(updated));
    }
  };

  const handleLikeVideo = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setLikesCount(prev => ({
      ...prev,
      [id]: prev[id] + 1
    }));
  };

  // Filter and search videos
  const filteredVideos = trainingVideos.filter(vid => {
    const matchesQuery = vid.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                         vid.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = activeFilter === "todos" || vid.category === activeFilter;
    return matchesQuery && matchesCategory;
  });

  const progressPercentage = Math.round((watchedVideos.length / trainingVideos.length) * 100);

  // Quiz Logic
  const startQuiz = () => {
    setQuizStarted(true);
    setCurrentQuestionIndex(0);
    setSelectedAnswers({});
    setQuizSubmitted(false);
    setShowAnswerFeedback(false);
    setQuizScore(0);
  };

  const handleSelectAnswer = (optionIndex: number) => {
    if (showAnswerFeedback) return;
    setSelectedAnswers(prev => ({
      ...prev,
      [currentQuestionIndex]: optionIndex
    }));
  };

  const handleNextQuestion = () => {
    const isCorrect = selectedAnswers[currentQuestionIndex] === quizQuestions[currentQuestionIndex].correctAnswer;
    if (isCorrect) {
      setQuizScore(prev => prev + 1);
    }

    if (currentQuestionIndex < quizQuestions.length - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
      setShowAnswerFeedback(false);
    } else {
      setQuizSubmitted(true);
    }
  };

  const getScorePercentage = () => {
    return Math.round((quizScore / quizQuestions.length) * 100);
  };

  // Generate certificate PDF
  const handleDownloadCertificate = () => {
    try {
      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      
      // Warm elegant background
      doc.setFillColor(255, 253, 250);
      doc.rect(0, 0, 297, 210, "F");

      // Outer border
      doc.setDrawColor(249, 115, 22); // OST Laranja
      doc.setLineWidth(1.5);
      doc.rect(8, 8, 281, 194, "D");

      // Inner thin border
      doc.setDrawColor(253, 186, 116);
      doc.setLineWidth(0.5);
      doc.rect(11, 11, 275, 188, "D");

      // Corner geometric accents
      doc.setFillColor(249, 115, 22);
      doc.triangle(11, 11, 25, 11, 11, 25, "F");
      doc.triangle(286, 11, 272, 11, 286, 25, "F");
      doc.triangle(11, 199, 25, 199, 11, 185, "F");
      doc.triangle(286, 199, 272, 199, 286, 185, "F");

      // Header Brand
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.setTextColor(249, 115, 22);
      doc.text("OST VENDAS ACADEMY & SMART SYSTEMS", 148, 32, { align: "center" });

      // Title
      doc.setFont("georgia", "italic");
      doc.setFontSize(32);
      doc.setTextColor(30, 41, 59); // Slate 800
      doc.text("Certificado de Especialista", 148, 55, { align: "center" });

      doc.setFont("helvetica", "normal");
      doc.setFontSize(12);
      doc.setTextColor(100, 116, 139); // Slate 500
      doc.text("Certificamos de forma solene e homologada que o operador(a)", 148, 70, { align: "center" });

      // Student Name
      doc.setFont("helvetica", "bold");
      doc.setFontSize(22);
      doc.setTextColor(249, 115, 22);
      doc.text("LEVI DOMINGOS", 148, 85, { align: "center" });

      // Body text
      doc.setFont("helvetica", "normal");
      doc.setFontSize(11.5);
      doc.setTextColor(71, 85, 105);
      const descriptionText = `Concluiu com aproveitamento e distinção todas as lições operacionais do Centro de Formação, demonstrando competência técnica na operação do Ponto de Venda (POS), fecho de caixa auditado, gestão de stock inteligente, controle de IVA e integrações móveis de Moçambique.`;
      const splitText = doc.splitTextToSize(descriptionText, 210);
      doc.text(splitText, 148, 102, { align: "center" });

      // Performance Score Badge
      doc.setFillColor(254, 243, 199);
      doc.rect(118, 130, 60, 10, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(180, 83, 9);
      doc.text(`APROVEITAMENTO: ${quizScore}/${quizQuestions.length} RESPOSTAS CERTAS`, 148, 136, { align: "center" });

      // Signatures
      doc.setDrawColor(148, 163, 184);
      doc.setLineWidth(0.5);
      doc.line(55, 170, 115, 170);
      doc.line(180, 170, 240, 170);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(51, 65, 85);
      doc.text("Direção Geral", 85, 175, { align: "center" });
      doc.text("Coordenação Técnica", 210, 175, { align: "center" });

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text("Gestão do Sistema", 85, 179, { align: "center" });
      doc.text("Chave de Validação: OST-CERT-" + Math.random().toString(36).substring(2, 8).toUpperCase(), 210, 179, { align: "center" });

      doc.save(`Certificado_Especialista_OST_Vendas.pdf`);
    } catch (err) {
      console.error("Erro ao gerar PDF do certificado:", err);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300 pb-16">
      
      {/* Hero Header Section */}
      <div className="bg-gradient-to-r from-orange-500 to-amber-600 text-white rounded-3xl p-6 shadow-xl shadow-orange-500/10 flex flex-col md:flex-row gap-6 justify-between items-start md:items-center relative overflow-hidden">
        {/* Background visual graphics */}
        <div className="absolute right-0 top-0 w-96 h-96 bg-white/5 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute left-1/3 bottom-0 w-48 h-48 bg-black/10 rounded-full blur-xl pointer-events-none"></div>

        <div className="space-y-2 z-10 max-w-2xl">
          <span className="bg-white/20 backdrop-blur text-white text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full font-mono">
            Universidade Corporativa OST
          </span>
          <h2 className="text-2xl font-black tracking-tight flex items-center gap-2">
            <Trophy className="w-6.5 h-6.5 text-amber-300 animate-bounce" />
            Centro de Formação de Operadores
          </h2>
          <p className="text-xs text-orange-50 font-semibold leading-relaxed">
            Aprenda a operar todas as engrenagens do **OST Vendas** como um verdadeiro especialista comercial. Assista a vídeos reais, animados e totalmente condizentes com os módulos de facturação, caixas e stock gravados para Moçambique!
          </p>
        </div>

        <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/20 text-center shrink-0 w-full md:w-56 z-10">
          <span className="text-[10px] uppercase tracking-wider font-extrabold text-orange-200 block mb-1">
            Progresso das Aulas
          </span>
          <div className="flex items-center justify-center gap-2">
            <span className="text-3xl font-black tracking-tight font-mono">{progressPercentage}%</span>
            <span className="text-xs text-orange-100 font-bold">concluído</span>
          </div>
          
          {/* Custom micro progress bar */}
          <div className="w-full bg-white/20 h-1.5 rounded-full overflow-hidden mt-2.5 relative">
            <div 
              className="bg-white h-1.5 rounded-full transition-all duration-500"
              style={{ width: `${progressPercentage}%` }}
            ></div>
          </div>
          
          <p className="text-[9.5px] text-orange-100 mt-2 font-bold leading-none">
            {watchedVideos.length} de {trainingVideos.length} módulos assistidos
          </p>
        </div>
      </div>

      {/* Main Layout Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        
        {/* Left 2 Columns: Video List & Search & Filters */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Filters and search card */}
          <div className="bg-white dark:bg-zinc-900 border border-slate-100 dark:border-zinc-800 p-4.5 rounded-2xl shadow-sm flex flex-col md:flex-row gap-3.5 items-center justify-between">
            {/* Category tabs */}
            <div className="flex flex-wrap gap-1.5 w-full md:w-auto">
              {[
                { id: "todos", label: "Todos" },
                { id: "vendas", label: "Vendas (POS)" },
                { id: "caixa", label: "Gestão de Caixa" },
                { id: "stock", label: "Stock" },
                { id: "relatorios", label: "Relatórios" }
              ].map(filter => (
                <button
                  key={filter.id}
                  onClick={() => setActiveFilter(filter.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-black cursor-pointer transition-all ${
                    activeFilter === filter.id
                      ? "bg-orange-500 text-white shadow-md shadow-orange-500/10"
                      : "bg-slate-50 hover:bg-slate-100 dark:bg-zinc-950 dark:hover:bg-zinc-800 text-slate-500 dark:text-slate-400"
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>

            {/* Search Input bar */}
            <div className="relative w-full md:w-64 shrink-0">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Pesquisar lição..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl py-2 pl-9 pr-4 text-xs font-semibold focus:outline-none focus:border-orange-500 dark:text-white"
              />
            </div>
          </div>

          {/* Videos Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {filteredVideos.map((vid) => {
              const isWatched = watchedVideos.includes(vid.id);

              return (
                <div 
                  key={vid.id} 
                  onClick={() => handleOpenVideo(vid)}
                  className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-100 dark:border-zinc-800/80 overflow-hidden shadow-sm flex flex-col justify-between group hover:border-orange-200 dark:hover:border-orange-900/40 transition-all cursor-pointer relative"
                >
                  {/* Thumbnail / Image with overlay */}
                  <div className="aspect-video bg-slate-950 relative flex items-center justify-center overflow-hidden">
                    {/* Simulated Youtube Banner placeholder */}
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-900/60 to-slate-800/20 group-hover:scale-105 transition duration-500 flex items-center justify-center">
                      <span className="text-5xl opacity-40 select-none transform group-hover:scale-110 transition duration-500">
                        {vid.thumbnail}
                      </span>
                    </div>

                    {/* YouTube Logo design accent */}
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="w-12 h-12 rounded-full bg-orange-500/90 text-white flex items-center justify-center shadow-lg group-hover:scale-110 transition duration-300 z-10">
                        <Play className="w-5 h-5 fill-white ml-0.5" />
                      </span>
                    </div>

                    {/* Duration sticker */}
                    <span className="absolute bottom-3 right-3 bg-slate-950/80 backdrop-blur-sm text-white font-mono text-[9px] font-black px-1.5 py-0.5 rounded flex items-center gap-1">
                      <Clock className="w-3 h-3 text-orange-400" />
                      {vid.duration} Mins
                    </span>

                    {/* Category Label */}
                    <span className="absolute top-3 left-3 bg-orange-500 text-white text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider">
                      {vid.category}
                    </span>

                    {/* Watched stamp */}
                    {isWatched && (
                      <span className="absolute top-3 right-3 bg-emerald-500 text-white text-[9px] font-black px-2 py-0.5 rounded-full flex items-center gap-1 shadow-sm">
                        <CheckCircle className="w-2.5 h-2.5" />
                        Concluído
                      </span>
                    )}
                  </div>

                  {/* Text Content */}
                  <div className="p-4.5 space-y-3 flex-1 flex flex-col justify-between">
                    <div className="space-y-1.5">
                      <h3 className="font-extrabold text-slate-800 dark:text-zinc-100 text-xs md:text-sm line-clamp-1 group-hover:text-orange-500 transition">
                        {vid.title}
                      </h3>
                      <p className="text-[11px] text-slate-400 dark:text-slate-400 font-medium line-clamp-2 leading-relaxed">
                        {vid.description}
                      </p>
                    </div>

                    {/* Steps list teaser */}
                    <div className="bg-slate-50 dark:bg-zinc-950/60 p-2.5 rounded-xl border border-slate-100/50 dark:border-zinc-800/40">
                      <span className="text-[9px] text-slate-400 dark:text-slate-500 font-extrabold uppercase tracking-widest block mb-1">
                        Destaques da Aula:
                      </span>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold line-clamp-1">
                        • {vid.steps[0]}
                      </p>
                    </div>

                    {/* Card Footer */}
                    <div className="flex justify-between items-center pt-2.5 border-t border-slate-50 dark:border-zinc-800 text-[10px]">
                      <span className="text-slate-400 font-bold">
                        Instrutor: <strong className="text-slate-650 dark:text-zinc-300 font-extrabold">{vid.instructor}</strong>
                      </span>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={(e) => handleToggleWatched(vid.id, e)}
                          className={`p-1 rounded-lg border transition ${
                            isWatched 
                              ? "bg-emerald-50 border-emerald-200 text-emerald-600 dark:bg-emerald-950/20 dark:border-emerald-900/30 dark:text-emerald-400" 
                              : "bg-slate-50 border-slate-200 text-slate-400 hover:text-slate-650 dark:bg-zinc-950 dark:border-zinc-850"
                          }`}
                          title={isWatched ? "Marcar como não assistido" : "Marcar como assistido"}
                        >
                          <CheckCircle className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={(e) => handleLikeVideo(vid.id, e)}
                          className="flex items-center gap-1 text-slate-400 hover:text-orange-500 font-bold transition"
                        >
                          <ThumbsUp className="w-3.5 h-3.5" />
                          <span>{likesCount[vid.id] || 0}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

        </div>

        {/* Right 1 Column: Interactive Quiz & Certification Panel */}
        <div className="space-y-6">
          
          {/* Certificate Badge Card */}
          <div className="bg-white dark:bg-zinc-900 border border-slate-100 dark:border-zinc-800/80 p-5 rounded-3xl shadow-sm space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-orange-100 dark:bg-orange-500/10 text-orange-600 dark:text-orange-400 flex items-center justify-center text-2xl font-mono">
                🎓
              </div>
              <div>
                <span className="text-[9px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500 font-mono">
                  Certificação Especialista
                </span>
                <h3 className="font-extrabold text-xs md:text-sm text-slate-800 dark:text-zinc-100">
                  Diploma de Proficiência
                </h3>
              </div>
            </div>

            <p className="text-[11px] text-slate-400 dark:text-slate-400 font-medium leading-relaxed">
              Consolide seu conhecimento respondendo o Quiz. Pontue pelo menos **4 de 5** respostas certas para desbloquear e baixar o seu **Certificado de Especialista em Faturamento** emitido pelo sistema!
            </p>

            {/* Progress indicators before downloading */}
            <div className="space-y-2 border-t border-slate-50 dark:border-zinc-800/60 pt-3">
              <div className="flex justify-between items-center text-[11px] font-bold">
                <span className="text-slate-400">1. Assistir a todas as lições:</span>
                <span className={progressPercentage === 100 ? "text-emerald-500" : "text-slate-400"}>
                  {watchedVideos.length}/{trainingVideos.length} ({progressPercentage}%)
                </span>
              </div>
              <div className="flex justify-between items-center text-[11px] font-bold">
                <span className="text-slate-400">2. Desafio de Conhecimento:</span>
                <span className={quizSubmitted && quizScore >= 4 ? "text-emerald-500" : "text-slate-400"}>
                  {quizSubmitted ? `${quizScore} / 5 Acertos` : "Pendente"}
                </span>
              </div>
            </div>

            {/* Action Certificate Button */}
            {quizSubmitted && quizScore >= 4 ? (
              <button
                onClick={handleDownloadCertificate}
                className="w-full bg-orange-500 hover:bg-orange-600 text-white font-black py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all shadow-md cursor-pointer active:scale-95 shadow-orange-500/25"
              >
                <FileText className="w-4 h-4" />
                Descarregar Certificado (PDF)
              </button>
            ) : (
              <button
                disabled
                className="w-full bg-slate-100 dark:bg-zinc-950 text-slate-400 dark:text-slate-600 font-black py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-1.5 cursor-not-allowed border border-slate-200/40 dark:border-zinc-800"
              >
                <Lock className="w-3.5 h-3.5" />
                Certificado Bloqueado
              </button>
            )}
          </div>

          {/* Interactive Knowledge Quiz Container */}
          <div className="bg-white dark:bg-zinc-900 border border-slate-100 dark:border-zinc-800/80 p-5 rounded-3xl shadow-sm space-y-4">
            <h3 className="font-extrabold text-slate-800 dark:text-zinc-100 text-sm flex items-center gap-1.5">
              <HelpCircle className="w-4.5 h-4.5 text-orange-500 animate-pulse" />
              Desafio de Conhecimento OST
            </h3>

            {!quizStarted ? (
              <div className="space-y-3.5 text-center py-4">
                <p className="text-[11px] text-slate-400 dark:text-slate-400 font-medium leading-relaxed">
                  Avalie os seus conhecimentos de faturação e regras fiscais vigentes em Moçambique no teste prático oficial.
                </p>
                <button
                  onClick={startQuiz}
                  className="w-full bg-orange-500 hover:bg-orange-600 text-white font-black py-2.5 px-4 rounded-xl text-xs transition-all cursor-pointer shadow-md active:scale-95 shadow-orange-500/10"
                >
                  Iniciar o Desafio
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Score / Progress Header */}
                <div className="flex justify-between items-center text-[10px] font-bold text-slate-400">
                  <span>Questão {currentQuestionIndex + 1} de {quizQuestions.length}</span>
                  <span>Pontuação: {quizScore}</span>
                </div>

                {/* Progress bar */}
                <div className="w-full bg-slate-100 dark:bg-zinc-950 h-1 rounded-full overflow-hidden">
                  <div 
                    className="bg-orange-500 h-1 transition-all duration-300"
                    style={{ width: `${((currentQuestionIndex + 1) / quizQuestions.length) * 100}%` }}
                  ></div>
                </div>

                {/* Question Text */}
                <h4 className="text-xs font-extrabold text-slate-800 dark:text-zinc-100 leading-relaxed min-h-[40px]">
                  {quizQuestions[currentQuestionIndex].question}
                </h4>

                {/* Options list */}
                <div className="space-y-2">
                  {quizQuestions[currentQuestionIndex].options.map((opt, idx) => {
                    const isSelected = selectedAnswers[currentQuestionIndex] === idx;
                    let optionStyle = "bg-slate-50 hover:bg-slate-100 dark:bg-zinc-950 dark:hover:bg-zinc-800 border-slate-200 dark:border-zinc-800";
                    
                    if (isSelected) {
                      optionStyle = "bg-orange-500/10 border-orange-500 text-orange-600 dark:text-orange-400 font-bold";
                    }

                    if (quizSubmitted || showAnswerFeedback) {
                      const isCorrectOpt = quizQuestions[currentQuestionIndex].correctAnswer === idx;
                      if (isCorrectOpt) {
                        optionStyle = "bg-emerald-500/10 border-emerald-500 text-emerald-600 dark:text-emerald-400 font-bold";
                      } else if (isSelected) {
                        optionStyle = "bg-red-500/10 border-red-500 text-red-600 dark:text-red-400 font-bold";
                      }
                    }

                    return (
                      <button
                        key={idx}
                        onClick={() => handleSelectAnswer(idx)}
                        disabled={quizSubmitted || showAnswerFeedback}
                        className={`w-full text-left p-3 rounded-xl border text-[11px] leading-relaxed transition-all cursor-pointer ${optionStyle}`}
                      >
                        <span className="font-mono font-black mr-2">
                          {String.fromCharCode(65 + idx)})
                        </span>
                        {opt}
                      </button>
                    );
                  })}
                </div>

                {/* Question Explanation Feed */}
                {showAnswerFeedback && (
                  <div className="bg-slate-50 dark:bg-zinc-950 p-3 rounded-xl border border-slate-100 dark:border-zinc-850 space-y-1">
                    <span className="text-[9px] font-black uppercase text-orange-500 tracking-wider">
                      Explicação Técnica:
                    </span>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-normal font-semibold">
                      {quizQuestions[currentQuestionIndex].explanation}
                    </p>
                  </div>
                )}

                {/* Controls */}
                <div className="flex gap-2">
                  {!showAnswerFeedback ? (
                    <button
                      onClick={() => {
                        if (selectedAnswers[currentQuestionIndex] !== undefined) {
                          setShowAnswerFeedback(true);
                        }
                      }}
                      disabled={selectedAnswers[currentQuestionIndex] === undefined}
                      className="w-full bg-slate-800 hover:bg-slate-900 text-white font-black py-2.5 px-4 rounded-xl text-xs transition disabled:opacity-50 cursor-pointer"
                    >
                      Confirmar Resposta
                    </button>
                  ) : (
                    <button
                      onClick={handleNextQuestion}
                      className="w-full bg-orange-500 hover:bg-orange-600 text-white font-black py-2.5 px-4 rounded-xl text-xs transition cursor-pointer"
                    >
                      {currentQuestionIndex < quizQuestions.length - 1 ? "Próxima Questão" : "Ver Resultados"}
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Results modal overlay inside the box */}
            {quizSubmitted && (
              <div className="bg-slate-950 text-white p-4.5 rounded-2xl space-y-3.5 text-center animate-in zoom-in duration-200">
                <span className="text-4xl">🏆</span>
                <h4 className="font-extrabold text-xs uppercase text-orange-400 tracking-wider">
                  Resultados do Desafio
                </h4>
                <div className="space-y-1">
                  <p className="text-xl font-black">{quizScore} de 5 Acertos</p>
                  <p className="text-[10.5px] text-slate-400 font-semibold">
                    Aproveitamento Geral: {getScorePercentage()}%
                  </p>
                </div>

                {quizScore >= 4 ? (
                  <div className="p-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-bold rounded-lg">
                    Parabéns! Desbloqueou o certificado de proficiência com êxito!
                  </div>
                ) : (
                  <div className="p-2 bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[10px] font-bold rounded-lg">
                    Não atingiu os 4 acertos mínimos. Assista mais aulas e tente novamente!
                  </div>
                )}

                <div className="flex gap-2 justify-center">
                  <button
                    onClick={startQuiz}
                    className="bg-white/10 hover:bg-white/15 text-white font-black text-[11px] py-2 px-3 rounded-lg flex items-center gap-1 cursor-pointer transition"
                  >
                    <RefreshCw className="w-3 h-3" />
                    Repetir Desafio
                  </button>
                  {quizScore >= 4 && (
                    <button
                      onClick={handleDownloadCertificate}
                      className="bg-orange-500 hover:bg-orange-600 text-white font-black text-[11px] py-2 px-3 rounded-lg flex items-center gap-1 cursor-pointer transition shadow-md shadow-orange-500/15"
                    >
                      <FileText className="w-3 h-3" />
                      PDF Diploma
                    </button>
                  )}
                </div>
              </div>
            )}

          </div>

        </div>

      </div>

      {/* Embedded Real Player Modal */}
      {selectedVideo && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-zinc-950 text-white p-5 rounded-3xl max-w-4xl w-full border border-zinc-800 shadow-2xl space-y-4 animate-in zoom-in-95 duration-200">
            
            {/* Header of player */}
            <div className="flex justify-between items-center pb-2.5 border-b border-zinc-800/60">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="bg-orange-500 text-white text-[9px] font-black uppercase px-2 py-0.5 rounded-md font-mono">
                    AULA EM REPRODUÇÃO
                  </span>
                  <span className="text-[10px] font-mono text-slate-400">
                    Módulo {selectedVideo.category.toUpperCase()}
                  </span>
                </div>
                <h3 className="font-extrabold text-sm md:text-base text-slate-100">
                  {selectedVideo.title}
                </h3>
              </div>
              
              <button 
                onClick={() => { setSelectedVideo(null); setIsPlaying(false); }}
                className="text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 p-2 rounded-xl transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Selector: Video real or Interactive Simulator */}
            <div className="flex border-b border-zinc-800/40 pb-2 gap-1.5 text-xs">
              <button
                onClick={() => { setPlayerMode("real"); setIsPlaying(true); }}
                className={`px-3 py-1.5 rounded-xl font-black cursor-pointer flex items-center gap-1.5 transition ${
                  playerMode === "real"
                    ? "bg-orange-500 text-white shadow"
                    : "bg-zinc-900 text-slate-400 hover:text-slate-200"
                }`}
              >
                <Video className="w-3.5 h-3.5" />
                📺 Vídeo Tutorial Explicativo
              </button>
              <button
                onClick={() => { setPlayerMode("simulation"); setIsPlaying(true); }}
                className={`px-3 py-1.5 rounded-xl font-black cursor-pointer flex items-center gap-1.5 transition ${
                  playerMode === "simulation"
                    ? "bg-orange-500 text-white shadow"
                    : "bg-zinc-900 text-slate-400 hover:text-slate-200"
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 animate-pulse" />
                ✨ Demonstração Prática Interativa
              </button>
            </div>

            {/* Video / Simulator Frame Container */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              
              {/* Media Screen Area */}
              <div className="lg:col-span-2 aspect-video bg-black rounded-2xl overflow-hidden border border-zinc-800 relative flex items-center justify-center shadow-lg">
                
                {playerMode === "real" ? (
                  // REAL EMBEDDED VIDEO
                  <iframe
                    className="w-full h-full"
                    src={`https://www.youtube.com/embed/${selectedVideo.youtubeId}?autoplay=1&mute=0&rel=0&modestbranding=1`}
                    title={selectedVideo.title}
                    frameBorder="0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                  ></iframe>
                ) : (
                  // INTERACTIVE 3D SIMULATOR FROM ORIGINAL COMPONENT
                  <div className="w-full h-full relative flex items-center justify-center bg-slate-950 p-4">
                    {/* Perspective grid background */}
                    <div className="absolute inset-0 bg-[linear-gradient(rgba(249,115,22,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(249,115,22,0.04)_1px,transparent_1px)] bg-[size:24px_24px] [transform:rotateX(60deg)_translateY(-30%)] opacity-60"></div>
                    
                    {/* Course Category Specific 3D Rendering */}
                    {selectedVideo.category === "vendas" && (
                      <div className="relative w-72 h-44 [transform:rotateY(-15deg)_rotateX(15deg)] [transform-style:preserve-3d] transition duration-700 animate-in fade-in">
                        <div className="absolute inset-0 bg-white/10 backdrop-blur-md rounded-xl border border-white/20 p-3 shadow-2xl flex flex-col justify-between [transform:translateZ(20px)]">
                          <div className="flex items-center justify-between border-b border-white/10 pb-1.5">
                            <span className="text-[8px] font-mono font-bold text-orange-400">POS TERMINAL CORE</span>
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
                          </div>
                          
                          <div className="space-y-1 my-1">
                            <div className="bg-slate-900/60 p-1.5 rounded-lg flex justify-between text-[8px] items-center border border-white/5">
                              <span className="font-sans text-slate-200">🛒 Carrinho: 2 Items</span>
                              <span className="text-orange-300 font-bold">1,250 MT</span>
                            </div>
                            <div className="grid grid-cols-2 gap-1 text-[7px] text-slate-300">
                              <span className="bg-white/5 p-0.5 rounded text-center">Arroz Fino x1</span>
                              <span className="bg-white/5 p-0.5 rounded text-center">Óleo Puro x1</span>
                            </div>
                          </div>
                          
                          <div className="bg-orange-500 text-white text-[8px] font-extrabold text-center py-1 rounded-lg tracking-wider uppercase font-mono shadow-md shadow-orange-500/20">
                            PAGAMENTO PROCESSADO ✓
                          </div>
                        </div>
                      </div>
                    )}

                    {selectedVideo.category === "caixa" && (
                      <div className="relative w-64 h-44 [transform:rotateY(10deg)_rotateX(20deg)] [transform-style:preserve-3d] flex items-center justify-center animate-in fade-in">
                        <div className="absolute inset-x-4 h-16 bg-slate-800 rounded-lg flex flex-col justify-end p-2 border border-slate-700 [transform:translateZ(-10px)]">
                          <span className="text-[7px] font-mono text-slate-500 block text-center">CAIXA REGISTADORA FISCAL</span>
                        </div>
                        <div className="absolute inset-x-2 bottom-6 h-14 bg-orange-500/90 rounded-lg p-2.5 border border-orange-400 flex justify-between items-center [transform:translateZ(30px)] shadow-2xl">
                          <div>
                            <span className="text-[8px] font-bold text-slate-950 block leading-none">GAVETA DE VALORES</span>
                            <span className="text-[6.5px] text-orange-950">Fecho do Turno</span>
                          </div>
                          <span className="text-xs font-bold text-white font-mono">18,450 MT</span>
                        </div>
                      </div>
                    )}

                    {selectedVideo.category === "stock" && (
                      <div className="relative w-60 h-40 [transform:rotateY(-20deg)_rotateX(10deg)] [transform-style:preserve-3d] flex flex-col items-center justify-center animate-in fade-in">
                        <div className="w-24 h-24 bg-amber-800/80 rounded-lg border border-amber-900 shadow-2xl p-2.5 flex flex-col justify-between [transform:translateZ(10px)]">
                          <span className="text-[6px] font-mono text-amber-200 block text-center">PRODUTO #33190</span>
                          <span className="font-mono text-center text-[10px] block text-white">📦 Lote Ativo</span>
                          <span className="text-[6px] bg-red-500/25 border border-red-500/30 text-rose-400 font-extrabold rounded p-0.5 text-center block">Stock Mínimo: 3u</span>
                        </div>
                        <div className="absolute inset-x-0 h-0.5 bg-red-500 shadow-[0_0_12px_#ef4444] animate-pulse z-10 [transform:translateZ(20px)]"></div>
                      </div>
                    )}

                    {selectedVideo.category === "relatorios" && (
                      <div className="relative w-72 h-44 [transform:rotateY(15deg)_rotateX(15deg)] [transform-style:preserve-3d] flex items-center justify-center animate-in fade-in">
                        <div className="absolute inset-0 bg-slate-900/50 rounded-xl border border-white/15 p-3.5 shadow-2xl flex flex-col justify-between [transform:translateZ(20px)]">
                          <span className="text-[8px] font-mono text-slate-400 block border-b border-white/5 pb-1 uppercase">ESTATÍSTICAS AUTOMÁTICAS</span>
                          <div className="flex justify-around items-end h-16 px-1">
                            <div className="w-3.5 bg-orange-400 rounded-t h-1/4"></div>
                            <div className="w-3.5 bg-orange-500 rounded-t h-2/4"></div>
                            <div className="w-3.5 bg-emerald-500 rounded-t h-3/4 animate-pulse"></div>
                            <div className="w-3.5 bg-blue-500 rounded-t h-5/6"></div>
                          </div>
                          <span className="text-[7.5px] font-mono font-bold text-center text-emerald-400">IVA LIQUIDADO: 16% REGISTADO</span>
                        </div>
                      </div>
                    )}

                    {/* Subtitles Overlay */}
                    <div className="absolute bottom-4 left-4 right-4 bg-black/80 border border-zinc-800 p-2.5 rounded-xl text-center text-xs text-orange-300 font-sans italic">
                      {selectedVideo.category === "vendas" && "... e com isso, o POS efetua a baixa de stock imediatamente de forma real e integrada à nossa base de faturamento."}
                      {selectedVideo.category === "caixa" && "... lembrando que ao fechar o turno, o supervisor valida o balancete de forma homologada e o caixa baixa o arquivo PDF com um clique."}
                      {selectedVideo.category === "stock" && "... o sistema avisa na hora se algum produto bater o limite mínimo ou se aproximar do prazo de vencimento."}
                      {selectedVideo.category === "relatorios" && "... o envio automático pode ser parametrizado para horas específicas do dia para ser enviado por SMTP real ao administrador."}
                    </div>
                  </div>
                )}

              </div>

              {/* Sidebar Guide checklist during video play */}
              <div className="space-y-4 max-h-[380px] overflow-y-auto pr-1">
                <div className="bg-zinc-900 p-4 rounded-2xl border border-zinc-800 space-y-3">
                  <h4 className="font-extrabold text-xs uppercase text-orange-400 tracking-wider flex items-center gap-1">
                    <BookOpen className="w-4 h-4" />
                    Roteiro Passo a Passo
                  </h4>
                  <p className="text-[10px] text-slate-400 font-bold leading-normal">
                    Siga estas diretivas na prática dentro do sistema de facturação enquanto assiste ao tutorial explicativo:
                  </p>

                  <div className="space-y-2 text-[11px] leading-relaxed font-semibold">
                    {selectedVideo.steps.map((step: string, index: number) => (
                      <div key={index} className="flex gap-2.5 items-start bg-zinc-950/60 p-2.5 rounded-xl border border-zinc-850">
                        <span className="w-5 h-5 rounded-full bg-orange-500 text-white text-[9.5px] font-black flex items-center justify-center shrink-0">
                          {index + 1}
                        </span>
                        <p className="text-slate-300 font-medium">
                          {step}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Additional support notes */}
                <div className="bg-orange-500/10 border border-orange-500/20 p-4 rounded-2xl text-[10.5px] text-slate-300 leading-normal font-semibold space-y-1">
                  <span className="text-orange-400 font-bold uppercase tracking-wider block">Suporte Técnico:</span>
                  Caso tenha alguma dúvida, fale directamente com o co-piloto de IA na aba **Centro de Inteligência** ou contacte o administrador do sistema.
                </div>
              </div>

            </div>

            {/* Bottom details inside modal */}
            <div className="bg-zinc-900 p-4 rounded-2xl border border-zinc-800 text-xs text-slate-400 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Award className="w-5.5 h-5.5 text-orange-400 shrink-0" />
                <div>
                  <p className="font-extrabold text-slate-200 text-xs leading-none">Módulo de Especialização Ativo</p>
                  <p className="text-[10.5px] text-slate-400 mt-1 font-semibold">Garantimos treinamento corporativo completo de faturamento local.</p>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={(e) => handleToggleWatched(selectedVideo.id, e)}
                  className={`px-3 py-1.5 rounded-xl font-black text-[11px] border transition cursor-pointer ${
                    watchedVideos.includes(selectedVideo.id)
                      ? "bg-emerald-500 text-white border-emerald-400"
                      : "bg-zinc-950 text-slate-400 border-zinc-800"
                  }`}
                >
                  {watchedVideos.includes(selectedVideo.id) ? "✓ Aula Concluída" : "Marcar Como Concluída"}
                </button>
                <button
                  onClick={() => { setSelectedVideo(null); setIsPlaying(false); }}
                  className="bg-zinc-950 hover:bg-zinc-900 text-white font-black text-[11px] py-1.5 px-3 rounded-xl border border-zinc-800 transition cursor-pointer"
                >
                  Fechar Lição
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
