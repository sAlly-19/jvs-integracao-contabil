/**
 * Standardized Error Handler for JVS Integração Contábil.
 * Translates and parses technical errors (such as Firebase, network, or permissions)
 * into friendly, Portuguese messages for display in UI Toasts.
 */

export interface FriendlyError {
  title: string;
  description: string;
}

export function getFriendlyErrorMessage(error: any): FriendlyError {
  if (!error) {
    return {
      title: "Erro desconhecido",
      description: "Ocorreu um imprevisto desconhecido. Por favor, tente novamente.",
    };
  }

  // Handle Firebase rule error JSON representation (Phase 3 of Firebase skill)
  if (error instanceof Error && error.message.trim().startsWith("{")) {
    try {
      const info = JSON.parse(error.message);
      if (info && typeof info === "object" && info.error) {
        return getFriendlyErrorMessage({
          code: info.operationType || "firebase-operation",
          message: info.error,
        });
      }
    } catch (e) {
      // Ignore JSON parse error and fallback
    }
  }

  // Common properties
  const message = error.message || String(error);
  const code = error.code || "";

  // Log to console for debugging
  console.debug("[Technical Error Debug Log]:", { code, message, original: error });

  // 1. Firebase Firestore & Permissions Errors
  if (
    code === "permission-denied" || 
    message.includes("permission-denied") || 
    message.includes("Permission denied") || 
    message.includes("insufficient permissions")
  ) {
    return {
      title: "Erro de Permissão",
      description: "Seu usuário não tem autorização para realizar esta operação.",
    };
  }

  // 2. Firebase Quota Exceeded
  if (
    code === "quota-exceeded" || 
    message.includes("quota-exceeded") || 
    message.includes("Quota exceeded")
  ) {
    return {
      title: "Limite de Cota Atingido",
      description: "O limite diário de processamento foi atingido. Tente novamente amanhã.",
    };
  }

  // 3. Offline / Connection Errors
  if (
    code === "unavailable" || 
    message.includes("unavailable") || 
    message.includes("offline") || 
    message.includes("failed to connect") || 
    message.includes("network-request-failed")
  ) {
    return {
      title: "Sem Conexão",
      description: "Serviço indisponível ou você está offline. Verifique sua conexão.",
    };
  }

  // 4. Firebase Auth specific codes
  if (code.startsWith("auth/")) {
    switch (code) {
      case "auth/user-not-found":
        return {
          title: "Usuário Não Encontrado",
          description: "Não existe nenhuma conta associada a este e-mail.",
        };
      case "auth/wrong-password":
        return {
          title: "Senha Incorreta",
          description: "A senha inserida é inválida para esta conta.",
        };
      case "auth/email-already-in-use":
        return {
          title: "E-mail em Uso",
          description: "Este e-mail já está sendo utilizado por outro usuário.",
        };
      case "auth/weak-password":
        return {
          title: "Senha Fraca",
          description: "A senha fornecida deve ter pelo menos 6 caracteres.",
        };
      case "auth/invalid-email":
        return {
          title: "E-mail Inválido",
          description: "O endereço de e-mail informado não tem um formato válido.",
        };
      case "auth/popup-closed-by-user":
        return {
          title: "Login Cancelado",
          description: "O login foi interrompido porque a janela de autenticação foi fechada.",
        };
      case "auth/network-request-failed":
        return {
          title: "Erro de Rede",
          description: "Falha ao se conectar com o servidor de autenticação. Tente novamente.",
        };
      default:
        return {
          title: "Erro de Autenticação",
          description: "Falha na validação das credenciais da conta. Tente novamente.",
        };
    }
  }

  // 5. App-specific file import errors (e.g., CSV/Excel)
  if (message.includes("invalid-format") || message.includes("formato inválido")) {
    return {
      title: "Formato de Arquivo Inválido",
      description: "O arquivo enviado não possui o layout ou colunas esperados pelo sistema.",
    };
  }

  if (message.includes("empty-file") || message.includes("arquivo vazio")) {
    return {
      title: "Arquivo Vazio",
      description: "O arquivo carregado não contém linhas ou registros para processamento.",
    };
  }

  // 6. General Network / Fetch errors
  if (message.includes("failed to fetch") || message.includes("NetworkError")) {
    return {
      title: "Falha de Comunicação",
      description: "Não foi possível enviar a requisição ao servidor. Verifique sua internet.",
    };
  }

  // Default fallback for any unhandled technical errors
  return {
    title: "Erro Inesperado",
    description: "Ocorreu uma falha no sistema. Os detalhes foram salvos no log.",
  };
}
