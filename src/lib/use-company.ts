import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getCompany } from "./api/companies";
import { getCompanyFallback } from "./company";
import type { Company } from "./types";

export function useCompanyById(companyId: string | number | undefined): Company {
  const [company, setCompany] = useState<Company>(() => getCompanyFallback(companyId ?? ""));
  
  const { data } = useQuery({
    queryKey: ["company", companyId],
    queryFn: () => getCompany(companyId ? companyId.toString() : ""),
    enabled: !!companyId,
  });

  useEffect(() => {
    if (data) setCompany(data);
  }, [data]);

  return company;
}
