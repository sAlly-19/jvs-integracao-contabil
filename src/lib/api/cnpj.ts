export type CnpjInfo = {
  name: string;
  nickname: string;
  error?: string;
};

export async function fetchCnpjInfo(document: string): Promise<CnpjInfo> {
  const cleanDocument = document.replace(/\D/g, "");
  
  if (cleanDocument.length !== 11 && cleanDocument.length !== 14) {
    return {
      name: "",
      nickname: "",
      error: "CPF ou CNPJ inválido"
    };
  }

  try {
    const response = await fetch(`https://publica.cnpj.ws/cnpj/${cleanDocument}`, {
      method: "GET",
      headers: {
        "Accept": "application/json"
      }
    });

    if (!response.ok) {
      if (response.status === 404) {
        return {
          name: "",
          nickname: "",
          error: "CNPJ não encontrado na Receita Federal"
        };
      }
      return {
        name: "",
        nickname: "",
        error: "Erro ao buscar CNPJ. Tente novamente."
      };
    }

    const data = await response.json();
    
    const tradeName = data?.fantasia?.trim();
    const legalName = data?.razao_social?.trim();
    const name = legalName || tradeName || "";
    
    let nickname = "";
    if (tradeName) {
      nickname = tradeName;
    } else if (legalName) {
      const words = legalName.split(" ");
      if (words.length > 1 && words[words.length - 1].toUpperCase() === "LTDA" || 
          words[words.length - 1].toUpperCase() === "EIRELI" ||
          words[words.length - 1].toUpperCase() === "S/A") {
        nickname = words.slice(0, -1).join(" ");
      } else {
        nickname = legalName;
      }
    }

    if (nickname.length > 30) {
      nickname = nickname.substring(0, 27) + "...";
    }

    return {
      name,
      nickname
    };
  } catch (error) {
    return {
      name: "",
      nickname: "",
      error: "Falha ao conectar com a Receita Federal"
    };
  }
}

export function generateNickname(name: string): string {
  if (!name) return "";
  
  let nickname = name.trim();
  
  nickname = nickname
    .replace(/\s+/g, " ")
    .replace(/[^\w\s]/g, "")
    .replace(/\b\w/g, l => l.toUpperCase());
  
  if (nickname.length > 30) {
    nickname = nickname.substring(0, 27).trim() + "...";
  }
  
  return nickname;
}