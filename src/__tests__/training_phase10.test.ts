import { describe, it, expect } from "vitest";
import { MasterclassVideo, Employee } from "../types";

// ==========================================
// Phase 10: Training, Masterclasses & Certification
// ==========================================

export interface QuizAssessmentResult {
  totalQuestions: number;
  correctAnswers: number;
  scorePercentage: number;
  passed: boolean;
  certificateEligible: boolean;
}

export function evaluateTrainingQuiz(
  answers: Record<number, number>,
  questions: { id: number; correctAnswer: number }[],
  passingScorePercent: number = 70
): QuizAssessmentResult {
  const totalQuestions = questions.length;
  if (totalQuestions === 0) {
    return {
      totalQuestions: 0,
      correctAnswers: 0,
      scorePercentage: 0,
      passed: false,
      certificateEligible: false
    };
  }

  let correctAnswers = 0;
  questions.forEach(q => {
    if (answers[q.id] === q.correctAnswer) {
      correctAnswers++;
    }
  });

  const scorePercentage = Math.round((correctAnswers / totalQuestions) * 100);
  const passed = scorePercentage >= passingScorePercent;

  return {
    totalQuestions,
    correctAnswers,
    scorePercentage,
    passed,
    certificateEligible: passed
  };
}

export interface TrainingProgress {
  totalVideos: number;
  completedVideos: number;
  progressPercentage: number;
  isFullyCompleted: boolean;
}

export function calculateTrainingProgress(
  videos: MasterclassVideo[],
  completedVideoIds: string[]
): TrainingProgress {
  const totalVideos = videos.length;
  if (totalVideos === 0) {
    return {
      totalVideos: 0,
      completedVideos: 0,
      progressPercentage: 100,
      isFullyCompleted: true
    };
  }

  const completedSet = new Set(completedVideoIds);
  const completedVideos = videos.filter(v => completedSet.has(v.id)).length;
  const progressPercentage = Math.round((completedVideos / totalVideos) * 100);

  return {
    totalVideos,
    completedVideos,
    progressPercentage,
    isFullyCompleted: completedVideos === totalVideos
  };
}

export function generateCertificationData(
  candidate: Employee,
  courseTitle: string = "Certificação Oficial OST Vendas Moçambique",
  scorePercent: number = 100
): {
  certificateId: string;
  candidateName: string;
  candidateRole: string;
  courseTitle: string;
  issueDate: string;
  validUntil: string;
  scorePercent: number;
  verificationCode: string;
} {
  const issueDate = new Date().toISOString().split("T")[0];
  const validUntil = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]; // 1 ano
  const verificationCode = `CERT-OST-${Math.random().toString(36).substring(2, 8).toUpperCase()}-${new Date().getFullYear()}`;

  return {
    certificateId: `CRT_${Date.now()}`,
    candidateName: candidate.name,
    candidateRole: candidate.role,
    courseTitle,
    issueDate,
    validUntil,
    scorePercent,
    verificationCode
  };
}

// ==========================================
// Test Suite: Phase 10 - Training & Certification
// ==========================================

describe("Phase 10: Módulo de Treinamento, Masterclasses, Quiz e Certificação de Operadores", () => {
  const mockVideos: MasterclassVideo[] = [
    {
      id: "v1",
      title: "1. Abertura e Fecho de Caixa Seguro em Moçambique",
      description: "Aprenda a fazer a contagem de numerário e o fecho com supervisor.",
      duration: "10:15",
      category: "OPERACAO",
      thumbnail: "https://example.com/v1.jpg",
      steps: ["Contagem de cédulas", "Conferência com supervisor"]
    },
    {
      id: "v2",
      title: "2. Emissão de Faturas e Pagamentos M-Pesa / E-Mola",
      description: "Como processar faturas no POS e aceitar pagamentos móveis.",
      duration: "14:20",
      category: "POS",
      thumbnail: "https://example.com/v2.jpg",
      steps: ["Seleção de produtos", "Push USSD M-Pesa"]
    },
    {
      id: "v3",
      title: "3. Gestão de Lotes, Validades e Alertas de Stock",
      description: "Controle de produtos perecíveis e reposição de mercadoria.",
      duration: "12:00",
      category: "STOCK",
      thumbnail: "https://example.com/v3.jpg",
      steps: ["Registo de validade", "Alerta FIFO"]
    }
  ];

  const mockQuestions = [
    { id: 1, correctAnswer: 1 },
    { id: 2, correctAnswer: 1 },
    { id: 3, correctAnswer: 1 },
    { id: 4, correctAnswer: 1 },
    { id: 5, correctAnswer: 1 }
  ];

  describe("Cálculo de Progresso da Trilha de Formação", () => {
    it("deve calcular 33% de conclusão ao completar 1 de 3 vídeos", () => {
      const progress = calculateTrainingProgress(mockVideos, ["v1"]);
      expect(progress.completedVideos).toBe(1);
      expect(progress.totalVideos).toBe(3);
      expect(progress.progressPercentage).toBe(33);
      expect(progress.isFullyCompleted).toBe(false);
    });

    it("deve calcular 100% de conclusão ao finalizar todos os módulos", () => {
      const progress = calculateTrainingProgress(mockVideos, ["v1", "v2", "v3"]);
      expect(progress.completedVideos).toBe(3);
      expect(progress.progressPercentage).toBe(100);
      expect(progress.isFullyCompleted).toBe(true);
    });
  });

  describe("Avaliação Interativa (Quiz) e Validação de Aprovação", () => {
    it("deve aprovar candidato com nota >= 70% (ex: 4 de 5 acertos = 80%)", () => {
      const userAnswers = { 1: 1, 2: 1, 3: 1, 4: 1, 5: 0 }; // 4 corretas
      const evalResult = evaluateTrainingQuiz(userAnswers, mockQuestions, 70);

      expect(evalResult.correctAnswers).toBe(4);
      expect(evalResult.scorePercentage).toBe(80);
      expect(evalResult.passed).toBe(true);
      expect(evalResult.certificateEligible).toBe(true);
    });

    it("deve reprovar candidato com nota inferior à nota de corte (< 70%)", () => {
      const userAnswers = { 1: 1, 2: 1, 3: 0, 4: 0, 5: 0 }; // 2 corretas = 40%
      const evalResult = evaluateTrainingQuiz(userAnswers, mockQuestions, 70);

      expect(evalResult.correctAnswers).toBe(2);
      expect(evalResult.scorePercentage).toBe(40);
      expect(evalResult.passed).toBe(false);
      expect(evalResult.certificateEligible).toBe(false);
    });
  });

  describe("Emissão e Validação do Certificado de Capacitação", () => {
    const mockOperator: Employee = {
      id: "emp-202",
      name: "João Silva Muthemba",
      email: "joao.muthemba@supermercado.co.mz",
      contact: "847778899",
      role: "CASHIER",
      salary: 18000,
      admissionDate: "2025-03-01",
      status: "ACTIVE",
      pin: "1234"
    };

    it("deve gerar certificado oficial com código único de validação e prazo de 1 ano", () => {
      const cert = generateCertificationData(mockOperator, "Certificação Operacional POS & Caixa OST", 90);

      expect(cert.candidateName).toBe("João Silva Muthemba");
      expect(cert.candidateRole).toBe("CASHIER");
      expect(cert.scorePercent).toBe(90);
      expect(cert.verificationCode).toContain("CERT-OST-");
      expect(cert.issueDate).toBeDefined();
      expect(cert.validUntil).toBeDefined();
    });
  });
});
